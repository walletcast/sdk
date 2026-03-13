use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::spawn_local;

use libp2p::{
    core::upgrade::Version,
    futures::StreamExt,
    gossipsub, noise,
    swarm::SwarmEvent,
    yamux, Multiaddr, Swarm, SwarmBuilder, Transport,
};

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use futures::channel::mpsc;
use futures::select;

/// Commands sent from the JS API to the swarm event loop.
enum Command {
    Subscribe(String),
    Unsubscribe(String),
    Publish(String, Vec<u8>),
    Shutdown,
}

type Callbacks = Rc<RefCell<HashMap<String, Vec<js_sys::Function>>>>;

/// A libp2p node exposing gossipsub pub/sub to JavaScript via wasm-bindgen.
#[wasm_bindgen]
pub struct LibP2PNode {
    cmd_tx: RefCell<mpsc::UnboundedSender<Command>>,
    callbacks: Callbacks,
}

#[wasm_bindgen]
impl LibP2PNode {
    /// Create a new libp2p node and connect to the given bootnodes.
    ///
    /// `bootnodes_js` is a JS array of multiaddr strings, e.g.
    /// `["/dns4/bootnode.example.com/tcp/443/wss/p2p/12D3Koo..."]`.
    /// Async factory — call `await LibP2PNode.create([...])` from JS.
    pub async fn create(bootnodes_js: JsValue) -> Result<LibP2PNode, JsValue> {
        console_error_panic_hook::set_once();

        let bootnodes: Vec<String> = serde_wasm_bindgen::from_value(bootnodes_js)
            .map_err(|e| JsValue::from_str(&format!("Invalid bootnodes: {e}")))?;

        let (cmd_tx, cmd_rx) = mpsc::unbounded();
        let callbacks: Callbacks = Rc::new(RefCell::new(HashMap::new()));

        // Build the swarm: websocket-websys + noise + yamux + gossipsub
        let mut swarm = build_swarm()
            .map_err(|e| JsValue::from_str(&format!("Swarm build failed: {e}")))?;

        // Dial each bootnode
        for addr_str in &bootnodes {
            match addr_str.parse::<Multiaddr>() {
                Ok(addr) => {
                    if let Err(e) = swarm.dial(addr) {
                        web_sys::console::warn_1(
                            &format!("Failed to dial {addr_str}: {e}").into(),
                        );
                    }
                }
                Err(e) => {
                    web_sys::console::warn_1(
                        &format!("Invalid multiaddr {addr_str}: {e}").into(),
                    );
                }
            }
        }

        // Spawn the event loop on the WASM micro-task queue
        let cbs = callbacks.clone();
        spawn_local(event_loop(swarm, cmd_rx, cbs));

        Ok(LibP2PNode {
            cmd_tx: RefCell::new(cmd_tx),
            callbacks,
        })
    }

    /// Subscribe to a gossipsub topic (typically a recipient public key hex).
    pub fn subscribe(&self, topic: &str, callback: js_sys::Function) -> Result<(), JsValue> {
        self.cmd_tx
            .borrow()
            .unbounded_send(Command::Subscribe(topic.to_string()))
            .map_err(|e| JsValue::from_str(&format!("Send error: {e}")))?;

        self.callbacks
            .borrow_mut()
            .entry(topic.to_string())
            .or_default()
            .push(callback);

        Ok(())
    }

    /// Unsubscribe from a gossipsub topic.
    pub fn unsubscribe(&self, topic: &str) -> Result<(), JsValue> {
        self.cmd_tx
            .borrow()
            .unbounded_send(Command::Unsubscribe(topic.to_string()))
            .map_err(|e| JsValue::from_str(&format!("Send error: {e}")))?;

        self.callbacks.borrow_mut().remove(topic);

        Ok(())
    }

    /// Publish data to a gossipsub topic.
    pub fn publish(&self, topic: &str, data: &[u8]) -> Result<(), JsValue> {
        self.cmd_tx
            .borrow()
            .unbounded_send(Command::Publish(topic.to_string(), data.to_vec()))
            .map_err(|e| JsValue::from_str(&format!("Send error: {e}")))?;

        Ok(())
    }

    /// Shut down the node and clean up resources.
    pub fn destroy(&self) -> Result<(), JsValue> {
        self.cmd_tx
            .borrow()
            .unbounded_send(Command::Shutdown)
            .map_err(|e| JsValue::from_str(&format!("Send error: {e}")))?;

        self.callbacks.borrow_mut().clear();

        Ok(())
    }
}

/// Build a libp2p Swarm with websocket-websys transport, noise security,
/// yamux multiplexing, and gossipsub behaviour.
fn build_swarm() -> Result<Swarm<gossipsub::Behaviour>, String> {
    let swarm = SwarmBuilder::with_new_identity()
        .with_wasm_bindgen()
        .with_other_transport(|keypair| {
            Ok(libp2p::websocket_websys::Transport::default()
                .upgrade(Version::V1)
                .authenticate(noise::Config::new(&keypair).expect("noise config"))
                .multiplex(yamux::Config::default())
                .boxed())
        })
        .map_err(|e| format!("transport: {e}"))?
        .with_behaviour(|key| {
            let config = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(std::time::Duration::from_secs(10))
                .validation_mode(gossipsub::ValidationMode::Strict)
                .build()
                .expect("valid gossipsub config");

            gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                config,
            )
            .expect("valid gossipsub behaviour")
        })
        .map_err(|e| format!("behaviour: {e}"))?
        .with_swarm_config(|cfg| cfg.with_idle_connection_timeout(std::time::Duration::from_secs(60)))
        .build();

    Ok(swarm)
}

/// Long-running event loop that drives the libp2p swarm and dispatches
/// incoming gossipsub messages to registered JS callbacks.
async fn event_loop(
    mut swarm: Swarm<gossipsub::Behaviour>,
    mut cmd_rx: mpsc::UnboundedReceiver<Command>,
    callbacks: Callbacks,
) {
    loop {
        select! {
            cmd = cmd_rx.next() => {
                match cmd {
                    Some(Command::Subscribe(topic)) => {
                        let t = gossipsub::IdentTopic::new(&topic);
                        if let Err(e) = swarm.behaviour_mut().subscribe(&t) {
                            web_sys::console::warn_1(
                                &format!("subscribe '{topic}': {e}").into(),
                            );
                        }
                    }
                    Some(Command::Unsubscribe(topic)) => {
                        let t = gossipsub::IdentTopic::new(&topic);
                        if !swarm.behaviour_mut().unsubscribe(&t) {
                            web_sys::console::warn_1(
                                &format!("unsubscribe '{topic}': not subscribed").into(),
                            );
                        }
                    }
                    Some(Command::Publish(topic, data)) => {
                        let t = gossipsub::IdentTopic::new(&topic);
                        if let Err(e) = swarm.behaviour_mut().publish(t, data) {
                            web_sys::console::warn_1(
                                &format!("publish '{topic}': {e}").into(),
                            );
                        }
                    }
                    Some(Command::Shutdown) | None => break,
                }
            }
            event = swarm.select_next_some() => {
                if let SwarmEvent::Behaviour(gossipsub::Event::Message {
                    message, ..
                }) = event {
                    let topic = message.topic.to_string();

                    let cbs = callbacks.borrow();
                    if let Some(fns) = cbs.get(&topic) {
                        let js_data = js_sys::Uint8Array::from(&message.data[..]);
                        for f in fns {
                            if let Err(e) = f.call1(&JsValue::NULL, &js_data) {
                                web_sys::console::warn_1(
                                    &format!("callback error: {e:?}").into(),
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}
