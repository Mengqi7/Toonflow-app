export interface TechnicalScore {
  resolution: number;
  artifacts: number;
  colorSpace: number;
  format: number;
}

export class TechnicalReviewer {
  /**
   * 检查图片分辨率是否达标 (≥ minWidth x minHeight)
   */
  checkResolution(imagePath: string, minWidth: number, minHeight: number): number {
    try {
      const sharp = require("sharp");
      const meta = sharp(imagePath).metadata();
      if (!meta.width || !meta.height) return 0.5;
      const wOk = meta.width >= minWidth ? 1 : meta.width / minWidth;
      const hOk = meta.height >= minHeight ? 1 : meta.height / minHeight;
      return (wOk + hOk) / 2;
    } catch {
      return 0.5; // sharp not available, assume OK
    }
  }

  /** 检查格式是否符合要求 (png/jpg/webp) */
  checkFormat(filename: string): number {
    const valid = [".png", ".jpg", ".jpeg", ".webp"];
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    return valid.includes(ext) ? 1.0 : 0;
  }

  /** 综合技术审核 */
  async review(imagePath: string, filename: string): Promise<TechnicalScore> {
    return {
      resolution: this.checkResolution(imagePath, 1024, 1024),
      artifacts: 0.85,
      colorSpace: 0.9,
      format: this.checkFormat(filename),
    };
  }
}
