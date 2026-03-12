// Future: Rust/WASM implementation of libp2p signaling
// Will expose: init_node(), subscribe_topic(), publish_offer()
// via wasm-bindgen bindings

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn init_node() -> Result<(), JsValue> {
    Err(JsValue::from_str("Not yet implemented"))
}
