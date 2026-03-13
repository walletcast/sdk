import { WalletCast, type ConnectResult, type DisconnectOptions } from '@walletcast/sdk';

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

const fmt = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

const connectBtn = document.getElementById('connectBtn') as HTMLButtonElement;
const disconnectBtn = document.getElementById('disconnectBtn') as HTMLButtonElement;
const accountCard = document.getElementById('accountCard')!;
const actionsCard = document.getElementById('actionsCard')!;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const signBtn = document.getElementById('signBtn') as HTMLButtonElement;
const addAccountBtn = document.getElementById('addAccountBtn') as HTMLButtonElement;
const accountSelect = document.getElementById('accountSelect') as HTMLSelectElement;
const chainIdEl = document.getElementById('chainId')!;
const connTypeEl = document.getElementById('connType')!;

let disconnectFn: ((opts?: DisconnectOptions) => Promise<void>) | null = null;
let activeProvider: ConnectResult['provider'] | null = null;
let currentAccount: string | null = null;

function populateAccountSelect(accounts: string[], selected?: string) {
  accountSelect.innerHTML = '';
  for (const addr of accounts) {
    const opt = document.createElement('option');
    opt.value = addr;
    opt.textContent = fmt(addr);
    if (addr === selected) opt.selected = true;
    accountSelect.appendChild(opt);
  }
  currentAccount = accountSelect.value;
}

accountSelect.addEventListener('change', () => {
  currentAccount = accountSelect.value;
  log(`Active account: ${fmt(currentAccount)}`, 'success');
});

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  log('Starting connection...');

  try {
    const result = await WalletCast.connect();

    disconnectFn = result.disconnect;
    activeProvider = result.provider;

    populateAccountSelect(result.accounts, result.accounts[0]);

    log(`Connected via ${result.type}!`, 'success');
    log(`Accounts: ${result.accounts.map(fmt).join(', ')}`, 'success');
    log(`Chain: ${result.chainId}`, 'success');

    updateStatus(true, 'Connected');
    accountCard.style.display = 'block';
    actionsCard.style.display = 'block';
    chainIdEl.textContent = result.chainId;
    connTypeEl.textContent = result.type;
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'block';

    // Listen for events
    result.provider.on('accountsChanged', (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length > 0) {
        populateAccountSelect(accs, accs[0]);
        log(`Accounts changed: ${accs.map(fmt).join(', ')}`, 'success');
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
    await disconnectFn({ revoke: true });
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
  log('Disconnected (permissions revoked)');
});

addAccountBtn.addEventListener('click', async () => {
  if (!activeProvider) return;
  addAccountBtn.disabled = true;
  log('Requesting wallet permissions...');
  try {
    // EIP-2255: request permissions — wallet shows account picker
    await activeProvider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
    // After permissions granted, fetch updated account list
    const accounts = (await activeProvider.request({ method: 'eth_accounts' })) as string[];
    if (accounts.length > 0) {
      populateAccountSelect(accounts, accounts[0]);
      log(`Accounts: ${accounts.map(fmt).join(', ')}`, 'success');
    }
  } catch (err) {
    log(`Permission error: ${(err as Error).message}`, 'error');
  } finally {
    addAccountBtn.disabled = false;
  }
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
    const msg = `WalletCast test message \u2014 ${new Date().toISOString()}`;
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
