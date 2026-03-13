/** Raw QR code result — a 2D boolean grid. */
export interface QRCode {
  /** QR version (1–40). */
  version: number;
  /** Size in modules (= 4 * version + 17). */
  size: number;
  /** Row-major boolean matrix. true = dark module. */
  modules: boolean[][];
}

export interface QROptions {
  /** Error correction level. Default: 'M'. */
  ecLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Minimum QR version (1–40). Auto-selected if omitted. */
  minVersion?: number;
  /** Maximum QR version (1–40). Default: 40. */
  maxVersion?: number;
}

export interface SVGOptions {
  /** Module (pixel) size in SVG units. Default: 10. */
  moduleSize?: number;
  /** Quiet zone width in modules. Default: 4. */
  quietZone?: number;
  /** Foreground (dark module) color. Default: '#000000'. */
  foreground?: string;
  /** Background color. Default: '#ffffff'. */
  background?: string;
}

export interface CanvasOptions {
  /** Module (pixel) size in canvas pixels. Default: 10. */
  moduleSize?: number;
  /** Quiet zone width in modules. Default: 4. */
  quietZone?: number;
  /** Foreground color. Default: '#000000'. */
  foreground?: string;
  /** Background color. Default: '#ffffff'. */
  background?: string;
}

export type ECLevel = 'L' | 'M' | 'Q' | 'H';
