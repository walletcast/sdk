/**
 * Framework-agnostic QR code modal using Shadow DOM for style isolation.
 *
 * Shows a wallet picker, then a QR code for the selected wallet.
 * Auto-closes on successful connection.
 */
import { toSVGDataURL } from '@walletcast/qr';
import type { WalletId } from '@walletcast/deep-link';
import { WALLET_REGISTRY } from '@walletcast/deep-link';

export interface QRModalOptions {
  theme?: 'dark' | 'light';
  onWalletSelect?: (walletId: WalletId) => void;
  onClose?: () => void;
}

const WALLET_ORDER: WalletId[] = ['metamask', 'trust', 'coinbase', 'phantom', 'okx'];

const STYLES = /* css */ `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .overlay.dark {
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    color: #e2e8f0;
  }
  .overlay.light {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    color: #1e293b;
  }

  .card {
    width: 100%;
    max-width: 380px;
    border-radius: 16px;
    padding: 2rem;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    animation: fadeIn 0.15s ease-out;
  }
  .dark .card { background: #1a1a2e; }
  .light .card { background: #fff; }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  .title {
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
  }
  .dark .title { color: #818cf8; }
  .light .title { color: #4f46e5; }

  .subtitle {
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }
  .dark .subtitle { color: #94a3b8; }
  .light .subtitle { color: #64748b; }

  .wallets {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .wallet-btn {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1px solid;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  .dark .wallet-btn {
    background: #0f172a;
    border-color: #2a2a3e;
    color: #e2e8f0;
  }
  .dark .wallet-btn:hover {
    border-color: #6366f1;
    background: #1e293b;
  }
  .light .wallet-btn {
    background: #f8fafc;
    border-color: #e2e8f0;
    color: #1e293b;
  }
  .light .wallet-btn:hover {
    border-color: #4f46e5;
    background: #eef2ff;
  }

  .wallet-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .qr-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .qr-view img {
    width: 240px;
    height: 240px;
    border-radius: 12px;
  }

  .qr-label {
    font-size: 0.9rem;
    font-weight: 500;
  }
  .dark .qr-label { color: #94a3b8; }
  .light .qr-label { color: #64748b; }

  .back-btn {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    cursor: pointer;
    font-weight: 500;
  }
  .dark .back-btn { background: #1e293b; color: #94a3b8; }
  .dark .back-btn:hover { background: #2a2a3e; }
  .light .back-btn { background: #f1f5f9; color: #64748b; }
  .light .back-btn:hover { background: #e2e8f0; }

  .success-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 0;
  }

  .checkmark {
    font-size: 3rem;
    animation: pop 0.3s ease-out;
  }

  @keyframes pop {
    from { transform: scale(0); }
    50% { transform: scale(1.2); }
    to { transform: scale(1); }
  }

  .success-text {
    font-size: 1.1rem;
    font-weight: 600;
  }
  .dark .success-text { color: #6ee7b7; }
  .light .success-text { color: #059669; }

  .close-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    font-size: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .dark .close-btn { background: #2a2a3e; color: #94a3b8; }
  .dark .close-btn:hover { background: #374151; }
  .light .close-btn { background: #f1f5f9; color: #64748b; }
  .light .close-btn:hover { background: #e2e8f0; }

  .card-wrap { position: relative; }
`;

const WALLET_ICONS: Record<WalletId, string> = {
  metamask: '\uD83E\uDD8A',   // fox
  trust: '\uD83D\uDEE1\uFE0F',  // shield
  coinbase: '\uD83D\uDFE6',  // blue square
  phantom: '\uD83D\uDC7B',  // ghost
  okx: '\uD83D\uDFE0',     // orange circle
};

export class QRModal {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private theme: 'dark' | 'light';
  private onWalletSelect?: (walletId: WalletId) => void;
  private onClose?: () => void;
  private links: Record<WalletId, { universal: string; native: string }> | null = null;

  constructor(options: QRModalOptions = {}) {
    this.theme = options.theme ?? 'dark';
    this.onWalletSelect = options.onWalletSelect;
    this.onClose = options.onClose;

    this.host = document.createElement('div');
    this.shadow = this.host.attachShadow({ mode: 'closed' });
  }

  show(): void {
    document.body.appendChild(this.host);
    this.renderPicker();
  }

  setLinks(links: Record<WalletId, { universal: string; native: string }>): void {
    this.links = links;
  }

  showQR(url: string, walletId: WalletId): void {
    const walletName = WALLET_REGISTRY[walletId].name;
    const qrDataUrl = toSVGDataURL(url, {
      moduleSize: 6,
      quietZone: 4,
      foreground: this.theme === 'dark' ? '#818cf8' : '#4f46e5',
      background: this.theme === 'dark' ? '#0f172a' : '#f8fafc',
    });

    this.render(/* html */ `
      <div class="qr-view">
        <img src="${qrDataUrl}" alt="QR Code for ${walletName}">
        <div class="qr-label">Scan with <strong>${walletName}</strong></div>
        <button class="back-btn" data-action="back">Back to wallets</button>
      </div>
    `);

    this.shadow.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.renderPicker();
    });
  }

  showSuccess(): void {
    this.render(/* html */ `
      <div class="success-view">
        <div class="checkmark">\u2705</div>
        <div class="success-text">Connected!</div>
      </div>
    `);

    setTimeout(() => this.destroy(), 1200);
  }

  destroy(): void {
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }

  private renderPicker(): void {
    const buttons = WALLET_ORDER.map((id) => {
      const wallet = WALLET_REGISTRY[id];
      return /* html */ `
        <button class="wallet-btn" data-wallet="${id}">
          <span class="wallet-icon">${WALLET_ICONS[id]}</span>
          ${wallet.name}
        </button>
      `;
    }).join('');

    this.render(/* html */ `
      <div class="wallets">${buttons}</div>
    `);

    for (const btn of this.shadow.querySelectorAll('[data-wallet]')) {
      btn.addEventListener('click', () => {
        const walletId = (btn as HTMLElement).dataset.wallet as WalletId;
        this.onWalletSelect?.(walletId);

        if (this.links) {
          this.showQR(this.links[walletId].universal, walletId);
        }
      });
    }
  }

  private render(content: string): void {
    this.shadow.innerHTML = /* html */ `
      <style>${STYLES}</style>
      <div class="overlay ${this.theme}">
        <div class="card-wrap">
          <div class="card">
            <button class="close-btn" data-action="close">\u00D7</button>
            <div class="title">WalletCast</div>
            <div class="subtitle">Connect your mobile wallet</div>
            ${content}
          </div>
        </div>
      </div>
    `;

    // Close button
    this.shadow.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      this.destroy();
      this.onClose?.();
    });

    // Click overlay to close
    this.shadow.querySelector('.overlay')?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('overlay')) {
        this.destroy();
        this.onClose?.();
      }
    });
  }
}
