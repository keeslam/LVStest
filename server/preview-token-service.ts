import crypto from 'crypto';

interface PreviewData {
  token: string;
  vehicleId: number;
  customerId: number;
  startDate: string;
  endDate?: string;
  notes?: string;
  templateId?: number;
  pdfBuffer: Buffer;
  createdAt: number;
  userId: string;
}

class PreviewTokenService {
  private previews: Map<string, PreviewData> = new Map();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  store(data: Omit<PreviewData, 'token' | 'createdAt'>): string {
    const token = this.generateToken();
    this.previews.set(token, {
      ...data,
      token,
      createdAt: Date.now(),
    });

    // Cleanup expired previews
    this.cleanup();

    return token;
  }

  get(token: string, userId: string): PreviewData | null {
    const preview = this.previews.get(token);
    
    if (!preview) {
      return null;
    }

    // Check if expired
    if (Date.now() - preview.createdAt > this.TTL) {
      this.previews.delete(token);
      return null;
    }

    // Check if owned by same user
    if (preview.userId !== userId) {
      return null;
    }

    return preview;
  }

  delete(token: string): void {
    this.previews.delete(token);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [token, preview] of this.previews.entries()) {
      if (now - preview.createdAt > this.TTL) {
        this.previews.delete(token);
      }
    }
  }
}

export const previewTokenService = new PreviewTokenService();

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  previewTokenService.cleanup();
}, 5 * 60 * 1000);
