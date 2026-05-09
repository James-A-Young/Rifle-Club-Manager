import { GoogleAuth } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import * as qr from 'qrcode';

interface PassClass {
  id: string;
  issuerId: string;
  reviewStatus: string;
  classTemplate?: {
    cardBarcodeSectionDetails?: {
      firstBottomDetail?: { fieldItem?: { firstValue?: { content: string } } };
      secondBottomDetail?: { fieldItem?: { firstValue?: { content: string } } };
    };
    cardRowTemplateInfos?: Array<{
      twoItems?: {
        startItem?: { firstValue?: { content: string } };
        endItem?: { firstValue?: { content: string } };
      };
    }>;
    details?: Array<{
      fieldLabel?: string;
      fieldValue?: string;
    }>;
    header?: {
      defaultHeader?: {
        hexBackgroundColor?: string;
      };
    };
    heroImage?: {
      image?: {
        sourceUri?: {
          uri?: string;
        };
      };
    };
  };
}

interface PassObject {
  id: string;
  classId: string;
  genericObjects?: Array<{
    classReference?: {
      id: string;
    };
    id: string;
    genericData?: {
      cardDetails?: {
        cardRowTemplateInfos?: Array<{
          twoItems?: {
            startItem?: { firstValue?: { content: string } };
            endItem?: { firstValue?: { content: string } };
          };
        }>;
      };
      header?: {
        hexBackgroundColor?: string;
      };
    };
    barcode?: {
      type: string;
      value: string;
      renderEncoding: string;
    };
  }>;
}

export class GoogleWalletService {
  private auth: GoogleAuth;
  private issuerId: string;
  private issuerEmail: string;
  private issuerPrivateKey: string;
  private privateKeyId?: string;
  private baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';

  constructor() {
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || '';
    this.issuerEmail = process.env.GOOGLE_WALLET_ISSUER_EMAIL || '';
    this.issuerPrivateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY || '';
    this.privateKeyId = process.env.GOOGLE_WALLET_PRIVATE_KEY_ID;

    if (!this.issuerId || !this.issuerEmail || !this.issuerPrivateKey) {
      throw new Error(
        'Google Wallet credentials not configured. Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_ISSUER_EMAIL, and GOOGLE_WALLET_PRIVATE_KEY environment variables.'
      );
    }

    this.auth = new GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_WALLET_PROJECT_ID,
        private_key_id: this.privateKeyId,
        private_key: this.issuerPrivateKey.replace(/\\n/g, '\n'),
        client_email: this.issuerEmail,
        client_id: process.env.GOOGLE_WALLET_CLIENT_ID,
      } as any,
      scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
    });
  }

  /**
   * Generate QR code as data URL string from membership ID
   */
  async generateQRCode(membershipId: string): Promise<string> {
    try {
      const qrDataUrl = await qr.toDataURL(membershipId, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        margin: 1,
        width: 300,
      } as any);
      return qrDataUrl;
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error}`);
    }
  }

  /**
   * Generate QR code as PNG buffer
   */
  async generateQRCodeBuffer(membershipId: string): Promise<Buffer> {
    try {
      const buffer = await qr.toBuffer(membershipId, {
        errorCorrectionLevel: 'H' as any,
        type: 'png' as any,
        margin: 1,
        width: 300,
      });
      return buffer as Buffer;
    } catch (error) {
      throw new Error(`Failed to generate QR code buffer: ${error}`);
    }
  }

  /**
   * Validate hex color format
   */
  validateHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  /**
   * Create pass class template for club
   */
  async createPassClass(
    clubId: string,
    clubName: string,
    settings: {
      primaryColor?: string;
      secondaryColor?: string;
      logoUrl?: string;
    }
  ): Promise<PassClass> {
    const client = await this.auth.getClient();

    const classId = `${this.issuerId}.${clubId}`;
    const passClass: PassClass = {
      id: classId,
      issuerId: this.issuerId,
      reviewStatus: 'UNDER_REVIEW',
      classTemplate: {
        header: {
          defaultHeader: {
            hexBackgroundColor: settings.primaryColor || '#1f2937',
          },
        },
        heroImage:
          settings.logoUrl && this._isValidUrl(settings.logoUrl)
            ? {
                image: {
                  sourceUri: {
                    uri: settings.logoUrl,
                  },
                },
              }
            : undefined,
        cardRowTemplateInfos: [
          {
            twoItems: {
              startItem: {
                firstValue: {
                  content: 'Membership Card',
                },
              },
              endItem: {
                firstValue: {
                  content: clubName,
                },
              },
            },
          },
        ],
      },
    };

    try {
      const response = await client.request({
        url: `${this.baseUrl}/genericClass`,
        method: 'POST',
        data: passClass,
      });
      return response.data as PassClass;
    } catch (error: any) {
      // If class already exists, that's OK
      if (error.status === 409) {
        return passClass;
      }
      throw new Error(`Failed to create pass class: ${error.message}`);
    }
  }

  /**
   * Create pass object for a user
   */
  async createPassObject(
    userId: string,
    clubId: string,
    memberName: string,
    membershipType: string,
    visitCount: number,
    clubName: string,
    qrCodeDataUrl: string,
    settings?: {
      secondaryColor?: string;
      accentColor?: string;
    }
  ): Promise<PassObject> {
    const passObjectId = `${this.issuerId}.${clubId}${userId.substring(0, 12)}`;
    const classId = `${this.issuerId}.${clubId}`;

    const passObject: PassObject = {
      id: passObjectId,
      classId,
      genericObjects: [
        {
          classReference: {
            id: classId,
          },
          id: passObjectId,
          genericData: {
            cardDetails: {
              cardRowTemplateInfos: [
                {
                  twoItems: {
                    startItem: {
                      firstValue: {
                        content: 'Member',
                      },
                    },
                    endItem: {
                      firstValue: {
                        content: memberName,
                      },
                    },
                  },
                },
                {
                  twoItems: {
                    startItem: {
                      firstValue: {
                        content: 'Type',
                      },
                    },
                    endItem: {
                      firstValue: {
                        content: membershipType,
                      },
                    },
                  },
                },
                {
                  twoItems: {
                    startItem: {
                      firstValue: {
                        content: 'Visits (YTD)',
                      },
                    },
                    endItem: {
                      firstValue: {
                        content: visitCount.toString(),
                      },
                    },
                  },
                },
              ],
            },
            header: {
              hexBackgroundColor: settings?.secondaryColor || '#374151',
            },
          },
          barcode: {
            type: 'QR_CODE',
            value: `club:${clubId}:member:${userId}`,
            renderEncoding: 'UTF_8',
          },
        },
      ],
    };

    return passObject;
  }

  /**
   * Generate JWT for pass object (for Add to Google Wallet button)
   */
  generateAddToWalletJwt(
    passClass: PassClass,
    passObject: PassObject
  ): string {
    const payload = {
      iss: this.issuerEmail,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        genericClasses: [passClass],
        genericObjects: passObject.genericObjects,
      },
    };

    const token = jwt.sign(payload, this.issuerPrivateKey.replace(/\\n/g, '\n'), {
      algorithm: 'RS256',
      keyid: this.privateKeyId,
    });

    return token;
  }

  /**
   * Generate Add to Google Wallet link
   */
  generateAddToWalletLink(jwtToken: string): string {
    return `https://pay.google.com/gp/v/save/${jwtToken}`;
  }

  /**
   * Update pass object visit count and other fields
   */
  async updatePassObject(
    passObject: PassObject,
    visitCount: number
  ): Promise<PassObject> {
    if (passObject.genericObjects?.[0]) {
      const cardDetails = passObject.genericObjects[0].genericData?.cardDetails;
      if (cardDetails?.cardRowTemplateInfos) {
        // Update visit count (3rd row)
        const visitRow = cardDetails.cardRowTemplateInfos[2];
        if (visitRow?.twoItems?.endItem?.firstValue) {
          visitRow.twoItems.endItem.firstValue.content = visitCount.toString();
        }
      }
    }
    return passObject;
  }

  /**
   * Helper to validate URL format
   */
  private _isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  }
}

// Lazy singleton pattern to defer initialization
let serviceInstance: GoogleWalletService | null = null;

export function getGoogleWalletService(): GoogleWalletService {
  if (!serviceInstance) {
    serviceInstance = new GoogleWalletService();
  }
  return serviceInstance;
}

// Export getter as default export for backward compatibility
export const googleWalletService = {
  get generateQRCode() {
    return getGoogleWalletService().generateQRCode.bind(getGoogleWalletService());
  },
  get generateQRCodeBuffer() {
    return getGoogleWalletService().generateQRCodeBuffer.bind(getGoogleWalletService());
  },
  get validateHexColor() {
    return getGoogleWalletService().validateHexColor.bind(getGoogleWalletService());
  },
  get createPassClass() {
    return getGoogleWalletService().createPassClass.bind(getGoogleWalletService());
  },
  get createPassObject() {
    return getGoogleWalletService().createPassObject.bind(getGoogleWalletService());
  },
  get generateAddToWalletJwt() {
    return getGoogleWalletService().generateAddToWalletJwt.bind(getGoogleWalletService());
  },
  get generateAddToWalletLink() {
    return getGoogleWalletService().generateAddToWalletLink.bind(getGoogleWalletService());
  },
  get updatePassObject() {
    return getGoogleWalletService().updatePassObject.bind(getGoogleWalletService());
  },
};
