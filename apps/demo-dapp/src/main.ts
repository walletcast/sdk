import {
  WalletCast,
  generateKeyPair,
  generateURI,
} from '@walletcast/sdk';

const log = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
  const el = document.getElementById('log')!;
  const div = document.createElement('div');
  div.className = type;
  div.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
};

const updateStatus = (connected: boolean, text: string) => {
  const dot = document.getElementById('statusDot')!;
  const statusText = document.getElementById('statusText')!;
  dot.classList.toggle('connected', connected);
  statusText.textContent = text;
};

const initBtn = document.getElementById('initBtn') as HTMLButtonElement;
const uriContainer = document.getElementById('uriContainer')!;
const uriDisplay = document.getElementById('uriDisplay')!;
const accountCard = document.getElementById('accountCard')!;
const accountAddr = document.getElementById('accountAddr')!;
const chainIdEl = document.getElementById('chainId')!;

initBtn.addEventListener('click', () => {
  log('Generating keypair...');

  const keypair = generateKeyPair();
  log(`Public key: ${keypair.publicKeyHex.slice(0, 16)}...`, 'success');

  const uri = generateURI({
    publicKey: keypair.publicKeyHex,
    relayUrls: ['wss://relay.damus.io', 'wss://nos.lol'],
  });

  uriDisplay.textContent = uri;
  uriContainer.style.display = 'block';
  log(`URI generated: ${uri.slice(0, 40)}...`, 'success');

  // Create provider
  const provider = WalletCast.createProvider({
    rpcUrl: 'https://eth.llamarpc.com',
    chainId: 1,
    nostrRelays: ['wss://relay.damus.io', 'wss://nos.lol'],
  });

  provider.on('connect', (info: unknown) => {
    log(`Connected! Chain: ${(info as { chainId: string }).chainId}`, 'success');
    updateStatus(true, 'Connected');
    chainIdEl.textContent = (info as { chainId: string }).chainId;
  });

  provider.on('accountsChanged', (accounts: unknown) => {
    const accs = accounts as string[];
    if (accs.length > 0) {
      accountCard.style.display = 'block';
      accountAddr.textContent = `${accs[0].slice(0, 6)}...${accs[0].slice(-4)}`;
      log(`Account: ${accs[0]}`, 'success');
    }
  });

  provider.on('disconnect', () => {
    updateStatus(false, 'Disconnected');
    accountCard.style.display = 'none';
    log('Disconnected from wallet', 'error');
  });

  updateStatus(false, 'Waiting for wallet...');
  log('Waiting for wallet to scan URI and connect...');
  log('(In production, display this URI as a QR code)');

  initBtn.disabled = true;
  initBtn.textContent = 'Waiting for connection...';
});

log('WalletCast Demo initialized');
log(`SDK loaded — ready to create connections`);
