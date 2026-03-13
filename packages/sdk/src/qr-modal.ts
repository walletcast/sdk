/**
 * Framework-agnostic QR code modal using Shadow DOM for style isolation.
 *
 * Shows a wallet picker, then a QR code for the selected wallet.
 * Auto-closes on successful connection.
 *
 * Features:
 * - CSS custom properties for clean theming
 * - 'dark' | 'light' | 'system' theme configs
 * - setTheme() for runtime switching
 * - SVG wallet icons (no emojis)
 * - Branding footer with link to walletcast.net
 */
import { toSVGDataURL } from '@walletcast/qr';
import type { WalletId } from '@walletcast/deep-link';
import { WALLET_REGISTRY } from '@walletcast/deep-link';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Theme the integrator configures — includes 'system' for OS auto-detect */
export type ThemeConfig = 'dark' | 'light' | 'system';

/** Resolved runtime theme — always concrete */
export type ResolvedTheme = 'dark' | 'light';

export interface QRModalOptions {
  theme?: ThemeConfig;
  onWalletSelect?: (walletId: WalletId) => void;
  onClose?: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const WALLET_ORDER: WalletId[] = ['metamask', 'trust', 'coinbase', 'phantom', 'okx'];

const CHEVRON_RIGHT = /* html */ `<svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_LEFT = /* html */ `<svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CLOSE_ICON = /* html */ `<svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

/* ------------------------------------------------------------------ */
/*  Wallet SVG Icons                                                   */
/* ------------------------------------------------------------------ */

const WALLET_ICONS: Record<WalletId, string> = {
  metamask: /* html */ `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#F6851B"/>
    <path d="M29.5 10l-7.2 5.4 1.3-3.2z" fill="#E2761B" stroke="#E2761B" stroke-width=".2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10.5 10l7.1 5.5-1.2-3.3zm15.2 16.7l-1.9 2.9 4.1 1.1 1.2-3.9zm-18.8.1l1.1 3.9 4.1-1.1-1.9-2.9z" fill="#fff" opacity=".9"/>
    <path d="M16 21.4l-1.1 1.7 4 .2-.1-4.4zm8 0l-2.9-2.6-.1 4.5 4-.2zm-8 7.2l2.4-1.2-2.1-1.6zm5.6-1.2l2.4 1.2-.3-2.8z" fill="#fff" opacity=".75"/>
  </svg>`,

  trust: /* html */ `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#0500FF"/>
    <path d="M20 8c3.5 3.5 7.5 4.2 10 4.2 0 8-2 16.5-10 19.8C12 28.7 10 20.2 10 12.2c2.5 0 6.5-.7 10-4.2z" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  coinbase: /* html */ `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#0052FF"/>
    <circle cx="20" cy="20" r="10" fill="#fff"/>
    <rect x="16" y="16" width="8" height="8" rx="1.5" fill="#0052FF"/>
  </svg>`,

  phantom: /* html */ `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#AB9FF2"/>
    <path d="M10 21.5c0-5.8 4.5-10.5 10-10.5s10 4.7 10 10.5c0 .3 0 .5-.1.8h-3c.1-.3.1-.5.1-.8 0-3.9-3.1-7-7-7s-7 3.1-7 7c0 .3 0 .5.1.8h-3c-.1-.3-.1-.5-.1-.8z" fill="#fff"/>
    <circle cx="16" cy="20.5" r="1.8" fill="#fff"/>
    <circle cx="24" cy="20.5" r="1.8" fill="#fff"/>
    <ellipse cx="20" cy="26" rx="4" ry="2" fill="#fff" opacity=".6"/>
  </svg>`,

  okx: /* html */ `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="8" fill="#000"/>
    <rect x="10" y="10" width="8" height="8" rx="1" fill="#fff"/>
    <rect x="22" y="10" width="8" height="8" rx="1" fill="#fff"/>
    <rect x="16" y="16" width="8" height="8" rx="1" fill="#fff"/>
    <rect x="10" y="22" width="8" height="8" rx="1" fill="#fff"/>
    <rect x="22" y="22" width="8" height="8" rx="1" fill="#fff"/>
  </svg>`,
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const STYLES = /* css */ `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  /* ---- Theme tokens (CSS custom properties) ---- */

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .overlay.dark {
    background: rgba(0, 0, 0, 0.75);

    --wc-bg-card: #1a1a2e;
    --wc-bg-surface: #0f172a;
    --wc-bg-surface-hover: #1e293b;
    --wc-bg-button: #1e293b;
    --wc-bg-button-hover: #2a2a3e;

    --wc-border: #2a2a3e;
    --wc-border-hover: #6366f1;

    --wc-text-primary: #e2e8f0;
    --wc-text-secondary: #94a3b8;
    --wc-text-accent: #818cf8;
    --wc-text-success: #6ee7b7;

    --wc-qr-fg: #818cf8;
    --wc-qr-bg: #0f172a;

    --wc-shadow-card: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    --wc-footer-text: #4a5568;
    --wc-footer-link: #818cf8;
  }

  .overlay.light {
    background: rgba(0, 0, 0, 0.35);

    --wc-bg-card: #ffffff;
    --wc-bg-surface: #f8fafc;
    --wc-bg-surface-hover: #eef2ff;
    --wc-bg-button: #f1f5f9;
    --wc-bg-button-hover: #e2e8f0;

    --wc-border: #e2e8f0;
    --wc-border-hover: #4f46e5;

    --wc-text-primary: #1e293b;
    --wc-text-secondary: #64748b;
    --wc-text-accent: #4f46e5;
    --wc-text-success: #059669;

    --wc-qr-fg: #4f46e5;
    --wc-qr-bg: #f8fafc;

    --wc-shadow-card: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    --wc-footer-text: #94a3b8;
    --wc-footer-link: #4f46e5;
  }

  /* ---- Card ---- */

  .card-wrap { position: relative; }

  .card {
    width: 100%;
    max-width: 380px;
    border-radius: 16px;
    padding: 1.75rem 2rem 1.25rem;
    text-align: center;
    background: var(--wc-bg-card);
    box-shadow: var(--wc-shadow-card);
    animation: wc-fadeIn 0.18s ease-out;
  }

  @keyframes wc-fadeIn {
    from { opacity: 0; transform: scale(0.96) translateY(4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* ---- Header ---- */

  .header { margin-bottom: 1.25rem; }

  .title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--wc-text-accent);
    margin-bottom: 0.2rem;
  }

  .subtitle {
    font-size: 0.85rem;
    color: var(--wc-text-secondary);
  }

  /* ---- Close button ---- */

  .close-btn {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--wc-bg-button);
    color: var(--wc-text-secondary);
    transition: background 0.15s, color 0.15s;
  }
  .close-btn:hover {
    background: var(--wc-bg-button-hover);
    color: var(--wc-text-primary);
  }

  /* ---- Wallet picker ---- */

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
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--wc-border);
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    background: var(--wc-bg-surface);
    color: var(--wc-text-primary);
    transition: border-color 0.15s, background 0.15s, transform 0.1s;
  }
  .wallet-btn:hover {
    border-color: var(--wc-border-hover);
    background: var(--wc-bg-surface-hover);
    transform: translateX(2px);
  }
  .wallet-btn:active {
    transform: scale(0.98);
  }

  .wallet-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    flex-shrink: 0;
    overflow: hidden;
  }
  .wallet-icon svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .wallet-name {
    flex: 1;
    text-align: left;
  }

  .wallet-arrow {
    color: var(--wc-text-secondary);
    opacity: 0;
    transition: opacity 0.15s;
    display: flex;
    align-items: center;
  }
  .wallet-btn:hover .wallet-arrow {
    opacity: 1;
  }

  /* ---- QR view ---- */

  .qr-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .qr-container {
    position: relative;
    display: inline-block;
  }

  .qr-image {
    width: 260px;
    height: 260px;
    border-radius: 16px;
    border: 1px solid var(--wc-border);
    display: block;
  }

  .qr-logo {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 48px;
    height: 48px;
    border-radius: 10px;
    background: var(--wc-bg-card);
    padding: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  }
  .qr-logo svg {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: 6px;
  }

  .qr-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--wc-text-primary);
  }
  .qr-label strong {
    color: var(--wc-text-accent);
  }

  .qr-hint {
    font-size: 0.8rem;
    color: var(--wc-text-secondary);
    margin-top: -0.25rem;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin-top: 0.25rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 8px;
    font-size: 0.85rem;
    font-family: inherit;
    cursor: pointer;
    font-weight: 500;
    background: var(--wc-bg-button);
    color: var(--wc-text-secondary);
    transition: background 0.15s, color 0.15s;
  }
  .back-btn:hover {
    background: var(--wc-bg-button-hover);
    color: var(--wc-text-primary);
  }

  /* ---- Success view ---- */

  .success-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem 0 0.5rem;
  }

  .success-icon {
    color: var(--wc-text-success);
  }

  .success-circle {
    stroke-dasharray: 151;
    stroke-dashoffset: 151;
    animation: wc-drawCircle 0.4s ease-out forwards;
  }
  .success-check {
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: wc-drawCheck 0.3s ease-out 0.35s forwards;
  }

  @keyframes wc-drawCircle { to { stroke-dashoffset: 0; } }
  @keyframes wc-drawCheck { to { stroke-dashoffset: 0; } }

  .success-text {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--wc-text-success);
  }
  .success-sub {
    font-size: 0.85rem;
    color: var(--wc-text-secondary);
  }

  /* ---- Footer ---- */

  .footer {
    margin-top: 1.25rem;
    padding-top: 0.85rem;
    border-top: 1px solid var(--wc-border);
    font-size: 0.72rem;
    color: var(--wc-footer-text);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    letter-spacing: 0.01em;
  }

  .footer-link {
    color: var(--wc-footer-link);
    text-decoration: none;
    font-weight: 600;
  }
  .footer-link:hover {
    text-decoration: underline;
  }

  .footer-sep { color: var(--wc-footer-text); }
  .footer-tagline { color: var(--wc-footer-text); }
`;

/* ------------------------------------------------------------------ */
/*  QRModal Class                                                      */
/* ------------------------------------------------------------------ */

export class QRModal {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private configuredTheme: ThemeConfig;
  private resolvedTheme: ResolvedTheme;
  private onWalletSelect?: (walletId: WalletId) => void;
  private onClose?: () => void;
  private links: Record<WalletId, { universal: string; native: string }> | null = null;

  // Track QR URL for theme-switch regeneration
  private currentQRUrl: string | null = null;

  // System theme listener
  private systemMediaQuery: MediaQueryList | null = null;
  private systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

  constructor(options: QRModalOptions = {}) {
    this.configuredTheme = options.theme ?? 'dark';
    this.resolvedTheme = QRModal.resolveTheme(this.configuredTheme);
    this.onWalletSelect = options.onWalletSelect;
    this.onClose = options.onClose;

    this.host = document.createElement('div');
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    if (this.configuredTheme === 'system') {
      this.attachSystemThemeListener();
    }
  }

  /* ---------- Public API ---------- */

  show(): void {
    document.body.appendChild(this.host);
    this.renderPicker();
  }

  setLinks(links: Record<WalletId, { universal: string; native: string }>): void {
    this.links = links;
  }

  showQR(url: string, walletId: WalletId): void {
    this.currentQRUrl = url;
    const walletName = WALLET_REGISTRY[walletId].name;
    const qrDataUrl = toSVGDataURL(url, {
      moduleSize: 8,
      quietZone: 5,
      foreground: this.resolvedTheme === 'dark' ? '#818cf8' : '#4f46e5',
      background: this.resolvedTheme === 'dark' ? '#0f172a' : '#f8fafc',
    });

    this.render(/* html */ `
      <div class="qr-view">
        <div class="qr-container">
          <img class="qr-image" src="${qrDataUrl}" alt="QR Code for ${walletName}">
          <div class="qr-logo">${WALLET_ICONS[walletId]}</div>
        </div>
        <div class="qr-label">Scan with <strong>${walletName}</strong></div>
        <div class="qr-hint">Open your wallet app and scan this QR code</div>
        <button class="back-btn" data-action="back">${CHEVRON_LEFT} All wallets</button>
      </div>
    `);

    this.shadow.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.currentQRUrl = null;
      this.renderPicker();
    });
  }

  showSuccess(): void {
    this.currentQRUrl = null;

    this.render(/* html */ `
      <div class="success-view">
        <div class="success-icon">
          <svg viewBox="0 0 52 52" width="56" height="56">
            <circle class="success-circle" cx="26" cy="26" r="24"
                    fill="none" stroke="currentColor" stroke-width="2"/>
            <path class="success-check" d="M15 27l7 7 15-15"
                  fill="none" stroke="currentColor" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="success-text">Connected!</div>
        <div class="success-sub">Your wallet is ready to use</div>
      </div>
    `);

    setTimeout(() => this.destroy(), 1400);
  }

  /**
   * Switch theme at runtime. Accepts 'dark' or 'light'.
   * Cancels 'system' auto-detection if it was active.
   */
  setTheme(theme: ResolvedTheme): void {
    this.detachSystemThemeListener();
    this.configuredTheme = theme;
    this.resolvedTheme = theme;
    this.applyTheme();
  }

  destroy(): void {
    this.detachSystemThemeListener();
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }

  /* ---------- Theme helpers ---------- */

  private static resolveTheme(config: ThemeConfig): ResolvedTheme {
    if (config === 'system') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'dark'; // fallback for SSR / old browsers
    }
    return config;
  }

  private attachSystemThemeListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    this.systemMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemThemeListener = (e: MediaQueryListEvent) => {
      this.resolvedTheme = e.matches ? 'dark' : 'light';
      this.applyTheme();
    };
    this.systemMediaQuery.addEventListener('change', this.systemThemeListener);
  }

  private detachSystemThemeListener(): void {
    if (this.systemMediaQuery && this.systemThemeListener) {
      this.systemMediaQuery.removeEventListener('change', this.systemThemeListener);
      this.systemMediaQuery = null;
      this.systemThemeListener = null;
    }
  }

  /** Swap overlay theme class + regenerate QR if visible */
  private applyTheme(): void {
    const overlay = this.shadow.querySelector('.overlay');
    if (!overlay) return;
    overlay.classList.remove('dark', 'light');
    overlay.classList.add(this.resolvedTheme);

    // Re-render QR SVG (colors are baked into the data URL)
    this.updateQRColors();
  }

  private updateQRColors(): void {
    if (!this.currentQRUrl) return;
    const img = this.shadow.querySelector('.qr-image') as HTMLImageElement | null;
    if (!img) return;

    img.src = toSVGDataURL(this.currentQRUrl, {
      moduleSize: 8,
      quietZone: 5,
      foreground: this.resolvedTheme === 'dark' ? '#818cf8' : '#4f46e5',
      background: this.resolvedTheme === 'dark' ? '#0f172a' : '#f8fafc',
    });
  }

  /* ---------- Rendering ---------- */

  private renderPicker(): void {
    this.currentQRUrl = null;

    const buttons = WALLET_ORDER.map((id) => {
      const wallet = WALLET_REGISTRY[id];
      return /* html */ `
        <button class="wallet-btn" data-wallet="${id}">
          <span class="wallet-icon">${WALLET_ICONS[id]}</span>
          <span class="wallet-name">${wallet.name}</span>
          <span class="wallet-arrow">${CHEVRON_RIGHT}</span>
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
      <div class="overlay ${this.resolvedTheme}">
        <div class="card-wrap">
          <div class="card">
            <button class="close-btn" data-action="close" aria-label="Close">${CLOSE_ICON}</button>
            <div class="header">
              <div class="title">WalletCast</div>
              <div class="subtitle">Connect your mobile wallet</div>
            </div>
            <div class="content">
              ${content}
            </div>
            <div class="footer">
              <a href="https://walletcast.net" target="_blank" rel="noopener noreferrer" class="footer-link">walletcast.net</a>
              <span class="footer-sep">&middot;</span>
              <span class="footer-tagline">Open wallet infrastructure</span>
            </div>
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
