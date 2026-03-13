import { WalletCast } from '@walletcast/sdk';

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

const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const accountCard = document.getElementById('accountCard')!;
const accountAddr = document.getElementById('accountAddr')!;
const chainIdEl = document.getElementById('chainId')!;
const connTypeEl = document.getElementById('connType')!;

let disconnectFn: (() => Promise<void>) | null = null;

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  log('Starting connection...');

  try {
    const result = await WalletCast.connect({
      rpcUrl: 'https://eth.llamarpc.com',
      chainId: 1,
    });

    disconnectFn = result.disconnect;

    log(`Connected via ${result.type}!`, 'success');
    log(`Accounts: ${result.accounts.join(', ')}`, 'success');
    log(`Chain: ${result.chainId}`, 'success');

    updateStatus(true, 'Connected');
    accountCard.style.display = 'block';
    accountAddr.textContent = `${result.accounts[0].slice(0, 6)}...${result.accounts[0].slice(-4)}`;
    chainIdEl.textContent = result.chainId;
    connTypeEl.textContent = result.type;
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';

    // Listen for events
    result.provider.on('accountsChanged', (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length > 0) {
        accountAddr.textContent = `${accs[0].slice(0, 6)}...${accs[0].slice(-4)}`;
        log(`Account changed: ${accs[0]}`, 'success');
      }
    });

    result.provider.on('chainChanged', (chainId: unknown) => {
      chainIdEl.textContent = chainId as string;
      log(`Chain changed: ${chainId}`, 'success');
    });

    result.provider.on('disconnect', () => {
      updateStatus(false, 'Disconnected');
      accountCard.style.display = 'none';
      connectBtn.style.display = 'block';
      connectBtn.disabled = false;
      connectBtn.textContent = 'Connect Wallet';
      disconnectBtn.style.display = 'none';
      log('Wallet disconnected', 'error');
    });
  } catch (err) {
    log(`Error: ${(err as Error).message}`, 'error');
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect Wallet';
  }
});

disconnectBtn.addEventListener('click', async () => {
  if (disconnectFn) {
    await disconnectFn();
    disconnectFn = null;
  }
  updateStatus(false, 'Disconnected');
  accountCard.style.display = 'none';
  connectBtn.style.display = 'block';
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect Wallet';
  disconnectBtn.style.display = 'none';
  log('Disconnected');
});

log('WalletCast Demo initialized');
log('Click Connect to auto-detect wallet or show QR modal');
