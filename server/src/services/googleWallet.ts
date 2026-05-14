import { GoogleAuth, JWTInput } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { env } from 'process';
import { int } from 'zod/v4';

export interface PassClass{
  id: string;
  classTemplateInfo: {
    cardTemplateOverride: {
      cardRowTemplateInfos: CardRowTemplateInfo[];
    };
  },
  securityAnimation?: SecurityAnimation;
}

export enum SecurityAnimation { ANIMATION_UNSPECIFIED,  FOIL_SHIMMER }
export interface CardRowTemplateInfo {
  threeItems?: {
    startItem: TemplateItem;
    middleItem: TemplateItem;
    endItem: TemplateItem;
  };
  // You can add twoItems or oneItem here later if needed
}

export interface TemplateItem {
  firstValue: {
    fields: TemplateField[];
  };
}

export interface TemplateField {
  /**
   * The path to the data field, 
   * e.g., "object.textModulesData['visits']"
   */
  fieldPath: string;
}

export interface PassObject {
  id: string;
  classId: string;
  genericType: string
  logo?: ImageResource;
  cardTitle: LocalizedString;
  subheader: LocalizedString;
  header: LocalizedString;
  textModulesData: TextModule[];
  barcode: Barcode;
  hexBackgroundColor: string;
  heroImage?: ImageResource;
}

export interface LocalizedString {
  defaultValue: {
    language: string;
    value: string;
  };
}

export interface ImageResource {
  sourceUri: {
    uri: string;
  };
  contentDescription: LocalizedString;
}

export interface TextModule {
  id: string;
  header: string;
  body: string;
}

export interface Barcode {
  type: 'QR_CODE' | 'AZTEC' | 'BARCODE_128' | 'PDF_417';
  value: string;
  alternateText?: string;
}
export interface CreatePassParams {
  userId: string,
    clubId: string,
    memberName: string,
    membershipType: string,
    visitCount: number,
    roundsThisYear: number,
    average: number,
    clubName: string,
    settings?: {
      secondaryColor?: string;
      accentColor?: string;
      logoUrl?: string;
    }
}
export class GoogleWalletService {
  private auth: GoogleAuth;
  private issuerId: string;
  private classid : string = 'v1';
  private baseUrl = 'https://walletobjects.googleapis.com/walletobjects/v1';
  private genericClassEnsured = false;

  constructor() {
    if(process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      this.auth = new GoogleAuth({scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']});
      this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || '';
      if(this.auth && this.issuerId) return;
    }
    
    throw new Error(
      'Google Wallet credentials not configured. Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_ISSUER_EMAIL, and GOOGLE_WALLET_PRIVATE_KEY environment variables.'
    );
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
  private async ensurePassClass(): Promise<PassClass> {
    const client = await this.auth.getClient();

    const classId = `${this.issuerId}.${this.classid}`;
    const passClass: PassClass = {
  "id": classId,
  "classTemplateInfo": {
    "cardTemplateOverride": {
      "cardRowTemplateInfos": [
        {
          "threeItems": {
            "startItem": {
              "firstValue": {
                "fields": [
                  {
                    "fieldPath": "object.textModulesData['visits']"
                  }
                ]
              }
            },
            "middleItem": {
              "firstValue": {
                "fields": [
                  {
                    "fieldPath": "object.textModulesData['rounds_this_year']"
                  }
                ]
              }
            },
            "endItem": {
              "firstValue": {
                "fields": [
                  {
                    "fieldPath": "object.textModulesData['average']"
                  }
                ]
              }
            }
          }
        }
      ]
    }
  },
};
  console.log('Ensuring pass class with ID:', classId);
  console.log('Pass class definition:', JSON.stringify(passClass, null, 2));
    if (this.genericClassEnsured) return passClass;

    try {
      const headers = await this.auth.getRequestHeaders();
      const response = await client.request({
        url: `${this.baseUrl}/genericClass`,
        method: 'POST',
        headers,
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
  async createPassObject(params: CreatePassParams): Promise<PassObject> {
    const { userId, clubId, memberName, membershipType, visitCount, roundsThisYear, average, clubName, settings } = params;
    const passObjectId = `${this.issuerId}.${clubId}${userId}`;
    const classId = `${this.issuerId}.${this.classid}`;

    await this.ensurePassClass();

    const passObject: PassObject = {
  "id": passObjectId,
  "classId": classId,
  "genericType": "GENERIC_TYPE_UNSPECIFIED",
  "logo": {
    "sourceUri": {
      "uri": settings?.logoUrl && this._isValidUrl(settings.logoUrl) ? settings.logoUrl : 'https://example.com/default-logo.png'
    },
    "contentDescription": {
      "defaultValue": {
        "language": "en-US",
        "value": `Logo for ${clubName}`
      }
    }
  },
  "cardTitle": {
    "defaultValue": {
      "language": "en-US",
      "value": `${clubName} Membership`
    }
  },
  "subheader": {
    "defaultValue": {
      "language": "en-US",
      "value": membershipType
    }
  },
  "header": {
    "defaultValue": {
      "language": "en-US",
      "value": memberName
    }
  },
  "textModulesData": [
    {
      "id": "visits",
      "header": "Visits",
      "body": visitCount.toString()
    },
    {
      "id": "rounds_this_year",
      "header": "Rounds this Year",
      "body": roundsThisYear.toString()
    },
    {
      "id": "average",
      "header": "Average",
      "body": average.toString()
    }
  ],
  "barcode": {
    "type": "QR_CODE",
    "value": `membership:${clubId}:${userId}`,
    "alternateText": ""
  },
  "hexBackgroundColor": settings?.secondaryColor && this.validateHexColor(settings.secondaryColor) ? settings.secondaryColor : '#dd10bb',
}
    

    return passObject;
  }

  /**
   * Generate JWT for pass object (for Add to Google Wallet button)
   */
  private async generateJwt(
    passObject: PassObject
  ): Promise<string> {
    await this.ensurePassClass();
    const payload = {
      iss: (await this.auth.getCredentials()).client_email,
      iat: Math.floor(Date.now() / 1000),
      aud: 'google',
      origins:[env.CLIENT_ORIGIN],
      typ: 'savetowallet',
      payload: {
        genericObjects: [passObject],
      },
    };
    console.log('Generating JWT with payload:', JSON.stringify(payload, null, 2));
    const creds =  await this.auth.getCredentials() as JWTInput;
    const privateKey = creds.private_key;
    if (!privateKey) {
      throw new Error('Google Wallet credentials are missing private key or client email');
    }
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256'
    });

    return token;
  }

  /**
   * Generate Add to Google Wallet link
   */
  async generateAddToWalletLink(passSettings: CreatePassParams): Promise<string> {
    const passObject = await this.createPassObject(passSettings);
    const jwtToken = await this.generateJwt(passObject);
    return `https://pay.google.com/gp/v/save/${jwtToken}`;
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
  
  get generateAddToWalletLink() {
    return getGoogleWalletService().generateAddToWalletLink.bind(getGoogleWalletService());
  },
};
