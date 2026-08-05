type WalletWalletBarcodeFormat = 'QR' | 'PDF417' | 'Aztec' | 'Code128';

type WalletWalletField = {
  label?: string;
  value: string;
  changeMessage?: string;
};

type WalletWalletPassPayload = {
  barcodeValue: string;
  barcodeFormat: WalletWalletBarcodeFormat;
  logoText: string;
  organizationName: string;
  colorPreset?: 'dark' | 'blue' | 'green' | 'red' | 'purple' | 'orange';
  color?: string;
  logoURL?: string;
  iconURL?: string;
  primaryFields?: WalletWalletField[];
  secondaryFields?: WalletWalletField[];
  backFields?: WalletWalletField[];
};

type WalletWalletCreateResponse = {
  serialNumber: string;
  googleSaveUrl?: string;
  applePass?: string;
  shareUrl?: string;
};

type WalletWalletUpdateResponse = {
  serialNumber: string;
  unchanged?: boolean;
  notifiedDevices?: number;
  lastUpdated?: number;
};

export type WalletWalletPassParams = {
  userId: string;
  clubId: string;
  memberName: string;
  clubName: string;
  visitCount: number;
  roundsThisYear: number;
  average: number;
  averageLabel?: string;
  settings?: {
    secondaryColor?: string;
    logoUrl?: string;
  };
};

export type WalletWalletCreatePassResult = {
  serialNumber: string;
  applePass: string;
  shareUrl?: string;
};

const WALLETWALLET_BASE_URL = 'https://api.walletwallet.dev';
const DEFAULT_COLOR_PRESET = 'orange';

export class WalletWalletService {
  private apiKey: string;
  private enabled: boolean;

  constructor() {
    this.apiKey = (process.env.WALLETWALLET_API_KEY || '').trim();
    this.enabled = this.apiKey.length > 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  validateHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  async createMembershipPass(params: WalletWalletPassParams): Promise<WalletWalletCreatePassResult | null> {
    if (!this.enabled) {
      return null;
    }

    const payload = this.buildPayload(params);

    try {
      const response = await this.requestJson<WalletWalletCreateResponse>('/api/passes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.serialNumber || !response.applePass) {
        throw new Error('WalletWallet create response missing serialNumber or applePass');
      }

      return {
        serialNumber: response.serialNumber,
        applePass: response.applePass,
        shareUrl: response.shareUrl,
      };
    } catch (error) {
      console.warn('WalletWallet create failed:', {
        clubId: params.clubId,
        userId: params.userId,
        error: this.extractErrorMessage(error),
      });
      return null;
    }
  }

  async refreshMembershipPass(serialNumber: string, params: WalletWalletPassParams): Promise<void> {
    if (!this.enabled || !serialNumber) {
      return;
    }

    const payload = this.buildPayload(params);

    try {
      const response = await this.requestJson<WalletWalletUpdateResponse>(`/api/passes/${encodeURIComponent(serialNumber)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (response.unchanged) {
        return;
      }
    } catch (error) {
      const message = this.extractErrorMessage(error);
      // Ignore unknown serials so stale records do not block refresh jobs.
      if (!message.includes('404')) {
        console.warn('WalletWallet refresh failed:', {
          serialNumber,
          clubId: params.clubId,
          userId: params.userId,
          error: message,
        });
      }
    }
  }

  private buildPayload(params: WalletWalletPassParams): WalletWalletPassPayload {
    const logoUrl = this.resolveLogoUrl(params.settings?.logoUrl);
    const color = this.resolveColor(params.settings?.secondaryColor);

    return {
      barcodeValue: `membership:${params.clubId}:${params.userId}`,
      barcodeFormat: 'QR',
      logoText: params.clubName,
      organizationName: params.clubName,
      colorPreset: DEFAULT_COLOR_PRESET,
      color,
      logoURL: logoUrl,
      iconURL: logoUrl,
      primaryFields: [
        {
          label: params.clubName,
          value: params.memberName,
        },
      ],
      secondaryFields: [
        {
          label: 'Visits',
          value: params.visitCount.toString(),
        },
        {
          label: 'Rounds',
          value: params.roundsThisYear.toString(),
        },
        {
          label: params.averageLabel || 'Average',
          value: params.average.toFixed(1),
        },
      ],
      backFields: [
        {
          label: 'Notifications',
          value: ' ',
          changeMessage: '%@',
        },
      ],
    };
  }

  private resolveLogoUrl(urlString?: string): string | undefined {
    if (!urlString) {
      return undefined;
    }
    if (!this.isLikelyHttpsUrl(urlString)) {
      return undefined;
    }
    return urlString;
  }

  private resolveColor(color?: string): string | undefined {
    if (!color) {
      return undefined;
    }
    return this.validateHexColor(color) ? color : undefined;
  }

  private isLikelyHttpsUrl(urlString: string): boolean {
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${WALLETWALLET_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers || {}),
      },
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`WalletWallet request failed (${response.status}): ${responseBody || response.statusText}`);
    }

    return response.json() as Promise<T>;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

let serviceInstance: WalletWalletService | null = null;

export function getWalletWalletService(): WalletWalletService {
  if (!serviceInstance) {
    serviceInstance = new WalletWalletService();
  }
  return serviceInstance;
}

export const walletWalletService = {
  get createMembershipPass() {
    return getWalletWalletService().createMembershipPass.bind(getWalletWalletService());
  },
  get refreshMembershipPass() {
    return getWalletWalletService().refreshMembershipPass.bind(getWalletWalletService());
  },
  get isEnabled() {
    return getWalletWalletService().isEnabled.bind(getWalletWalletService());
  },
};
