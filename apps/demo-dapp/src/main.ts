import { WalletCast, type ConnectResult } from '@walletcast/sdk';

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
const actionsCard = document.getElementById('actionsCard')!;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const signBtn = document.getElementById('signBtn') as HTMLButtonElement;
const accountAddr = document.getElementById('accountAddr')!;
const chainIdEl = document.getElementById('chainId')!;
const connTypeEl = document.getElementById('connType')!;

let disconnectFn: (() => Promise<void>) | null = null;
let activeProvider: ConnectResult['provider'] | null = null;
let currentAccount: string | null = null;

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
    activeProvider = result.provider;
    currentAccount = result.accounts[0];

    log(`Connected via ${result.type}!`, 'success');
    log(`Accounts: ${result.accounts.join(', ')}`, 'success');
    log(`Chain: ${result.chainId}`, 'success');

    updateStatus(true, 'Connected');
    accountCard.style.display = 'block';
    actionsCard.style.display = 'block';
    accountAddr.textContent = `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`;
    chainIdEl.textContent = result.chainId;
    connTypeEl.textContent = result.type;
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';

    // Listen for events
    result.provider.on('accountsChanged', (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length > 0) {
        currentAccount = accs[0];
        accountAddr.textContent = `${accs[0].slice(0, 6)}...${accs[0].slice(-4)}`;
        log(`Account changed: ${accs[0]}`, 'success');
      }
    });

    result.provider.on('chainChanged', (chainId: unknown) => {
      chainIdEl.textContent = chainId as string;
      log(`Chain changed: ${chainId}`, 'success');
    });

    result.provider.on('disconnect', () => {
      activeProvider = null;
      currentAccount = null;
      updateStatus(false, 'Disconnected');
      accountCard.style.display = 'none';
      actionsCard.style.display = 'none';
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
  activeProvider = null;
  currentAccount = null;
  updateStatus(false, 'Disconnected');
  accountCard.style.display = 'none';
  actionsCard.style.display = 'none';
  connectBtn.style.display = 'block';
  connectBtn.disabled = false;
  connectBtn.textContent = 'Connect Wallet';
  disconnectBtn.style.display = 'none';
  log('Disconnected');
});

sendBtn.addEventListener('click', async () => {
  if (!activeProvider || !currentAccount) return;
  sendBtn.disabled = true;
  try {
    const txHash = await activeProvider.request({
      method: 'eth_sendTransaction',
      params: [{ from: currentAccount, to: currentAccount, value: '0x0', gas: '0x5208' }],
    });
    log(`Tx sent: ${txHash as string}`, 'success');
  } catch (err) {
    log(`Tx error: ${(err as Error).message}`, 'error');
  } finally {
    sendBtn.disabled = false;
  }
});

signBtn.addEventListener('click', async () => {
  if (!activeProvider || !currentAccount) return;
  signBtn.disabled = true;
  try {
    const msg = `WalletCast test message — ${new Date().toISOString()}`;
    const sig = await activeProvider.request({
      method: 'personal_sign',
      params: [msg, currentAccount],
    });
    log(`Signed: ${(sig as string).slice(0, 20)}...`, 'success');
  } catch (err) {
    log(`Sign error: ${(err as Error).message}`, 'error');
  } finally {
    signBtn.disabled = false;
  }
});

log('WalletCast Demo initialized');
log('Click Connect to auto-detect wallet or show QR modal');
