export interface OcrResult {
  success: boolean;
  freeFireId?: string;
  playerName?: string;
  level?: number;
  confidence: number;
  rawText?: string;
  message: string;
}

class OcrEngineService {
  /**
   * Mock OCR engine for Free Fire profile screenshot verification.
   * In production, integrate Tesseract.js, Google Vision, or AWS Textract.
   */
  async extractProfileData(screenshotUrl: string, expectedFreeFireId?: string): Promise<OcrResult> {
    await this.simulateProcessing();

    if (!screenshotUrl || screenshotUrl.length < 5) {
      return {
        success: false,
        confidence: 0,
        message: 'Invalid screenshot URL',
      };
    }

    // Mock extraction — derive ID from URL hash for deterministic demo behavior
    const hash = screenshotUrl.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const mockId = expectedFreeFireId || `${100000000 + (hash % 900000000)}`;

    const confidence = expectedFreeFireId
      ? expectedFreeFireId === mockId
        ? 0.95
        : 0.45
      : 0.88;

    return {
      success: confidence >= 0.7,
      freeFireId: mockId,
      playerName: `Player_${mockId.slice(-4)}`,
      level: 40 + (hash % 60),
      confidence,
      rawText: `Free Fire ID: ${mockId}\nLevel: ${40 + (hash % 60)}`,
      message: confidence >= 0.7 ? 'Profile verified via OCR' : 'OCR confidence too low',
    };
  }

  async validateScreenshot(screenshotUrl: string): Promise<boolean> {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const lower = screenshotUrl.toLowerCase();
    return allowedExtensions.some((ext) => lower.includes(ext)) || lower.startsWith('http');
  }

  private simulateProcessing(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export const ocrEngine = new OcrEngineService();
