import { createHash } from 'crypto';
import { GoogleAuth, JWTInput } from 'google-auth-library';
import { google, walletobjects_v1 } from 'googleapis';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

const WALLET_SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';
const DEFAULT_LOGO_URL =
  'https://developers.google.com/static/wallet/site-assets/images/pass-builder/pass_google_logo.jpg';
const DEFAULT_HERO_URL =
  'https://developers.google.com/static/wallet/site-assets/images/pass-builder/google-io-hero-demo-only.jpg';

export interface PassObject {
  id: string;
  classId: string;
  genericType: string;
  logo?: {
    sourceUri?: { uri?: string };
    contentDescription?: {
      defaultValue?: {
        language?: string;
        value?: string;
      };
    };
  };
  cardTitle: {
    defaultValue: {
      language: string;
      value: string;
    };
  };
  subheader: {
    defaultValue: {
      language: string;
      value: string;
    };
  };
  header: {
    defaultValue: {
      language: string;
      value: string;
    };
  };
  textModulesData: Array<{
    id: string;
    header: string;
    body: string;
  }>;
  barcode: {
    type: 'QR_CODE' | 'AZTEC' | 'BARCODE_128' | 'PDF_417';
    value: string;
    alternateText?: string;
  };
  hexBackgroundColor: string;
  heroImage?: {
    sourceUri?: { uri?: string };
  };
  state?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
}

export interface CreatePassParams {
  userId: string;
  clubId: string;
  memberName: string;
  membershipType: string;
  visitCount: number;
  roundsThisYear: number;
  average: number;
  clubName: string;
  settings?: {
    secondaryColor?: string;
    accentColor?: string;
    logoUrl?: string;
  };
}

export interface IssueMembershipPassResult {
  id: string;
  addToWalletLink: string;
}

export class GoogleWalletService {
  private auth?: GoogleAuth;
  private walletClient?: walletobjects_v1.Walletobjects;
  private issuerId: string;
  private walletEnabled: boolean;
  private classIdCache = new Set<string>();

  constructor() {
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || '';

    const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.GOOGLE_WALLET_ISSUER_EMAIL;

    this.walletEnabled = Boolean(
      this.isValidIssuerId(this.issuerId) && (keyFile || (privateKey && clientEmail))
    );
    if (!this.walletEnabled) {
      return;
    }

    this.auth = new GoogleAuth({
      scopes: [WALLET_SCOPE],
      ...(keyFile
        ? { keyFile }
        : {
            credentials: {
              client_email: clientEmail,
              private_key: privateKey,
            },
          }),
    });
    this.walletClient = google.walletobjects({ version: 'v1', auth: this.auth });
  }

  validateHexColor(color: string): boolean {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  async issueMembershipPass(params: CreatePassParams): Promise<IssueMembershipPassResult | null> {
    const classId = this.buildClassId('v1-membership');
    const objectId = this.buildObjectId(params.clubId, params.userId);
    const qrValue = `membership:${params.clubId}:${params.userId}`;

    const passObject = this.buildPassObject({
      ...params,
      classId,
      objectId,
    });

    if (!this.walletEnabled) {
      return null;
    }

    try {
      await this.ensurePassClass(classId, params.clubId);
      await this.upsertPassObject(passObject);
      const addToWalletJwt = await this.generateJwt(passObject);

      return {
        id: passObject.id,
        addToWalletLink: this.generateSaveLink(addToWalletJwt),
      };
    } catch (error) {
      console.warn('Google Wallet issue failed;', {
        clubId: params.clubId,
        userId: params.userId,
        classId,
        objectId,
        error: this.extractErrorMessage(error),
      });

      return null;
    }
  }

  async createPassObject(params: CreatePassParams): Promise<PassObject> {
    return this.buildPassObject({
      ...params,
      classId: this.buildClassId(params.clubId),
      objectId: this.buildObjectId(params.clubId, params.userId),
    });
  }

  async generateAddToWalletLink(passSettings: CreatePassParams): Promise<string> {
    const passResult = await this.issueMembershipPass(passSettings);
    if (!passResult) {
      throw new Error('Failed to generate Add to Google Wallet link.');
    }
    return passResult.addToWalletLink;
  }

  private buildPassObject(
    params: CreatePassParams & { classId: string; objectId: string }
  ): PassObject {
    const logoUrl = this.resolveLogoUrl(params.settings?.logoUrl);
    return {
      id: params.objectId,
      classId: params.classId,
      genericType: 'GENERIC_TYPE_UNSPECIFIED',
      state: 'ACTIVE',
      logo: {
        sourceUri: {
          uri: logoUrl,
        },
        contentDescription: {
          defaultValue: {
            language: 'en-US',
            value: `Logo for ${params.clubName}`,
          },
        },
      },
      cardTitle: {
        defaultValue: {
          language: 'en-US',
          value: `${params.clubName} Membership`,
        },
      },
      subheader: {
        defaultValue: {
          language: 'en-US',
          value: params.membershipType,
        },
      },
      header: {
        defaultValue: {
          language: 'en-US',
          value: params.memberName,
        },
      },
      textModulesData: [
        {
          id: 'visits',
          header: 'Visits',
          body: params.visitCount.toString(),
        },
        {
          id: 'rounds_this_year',
          header: 'Rounds This Year',
          body: params.roundsThisYear.toString(),
        },
        {
          id: 'average',
          header: 'Average',
          body: params.average.toFixed(1),
        },
      ],
      barcode: {
        type: 'QR_CODE',
        value: `membership:${params.clubId}:${params.userId}`,
        alternateText: `${params.clubName} Member`,
      },
      hexBackgroundColor:
        params.settings?.secondaryColor && this.validateHexColor(params.settings.secondaryColor)
          ? params.settings.secondaryColor
          : '#374151',

    };
  }

  private async ensurePassClass(classId: string, clubId: string): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Google Wallet API client is not configured.');
    }

    if (this.classIdCache.has(classId)) {
      return;
    }

    try {
      await this.walletClient.genericclass.get({ resourceId: classId });
      this.classIdCache.add(classId);
      return;
    } catch (error) {
      const status = this.extractHttpStatus(error);
      if (status !== 404) {
        throw new Error(`Failed to query Google Wallet class (${classId}): ${this.extractErrorMessage(error)}`);
      }
    }

    const newClass: walletobjects_v1.Schema$GenericClass = {
      id: classId,
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              threeItems: {
                startItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['visits']" }],
                  },
                },
                middleItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['rounds_this_year']" }],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [{ fieldPath: "object.textModulesData['average']" }],
                  },
                },
              },
            },
          ],
        },
      },
    };

    try {
      await this.walletClient.genericclass.insert({ requestBody: newClass });
    } catch (error) {
      const status = this.extractHttpStatus(error);
      if (status !== 409) {
        throw new Error(`Failed to create Google Wallet class (${classId}): ${this.extractErrorMessage(error)}`);
      }
    }

    this.classIdCache.add(classId);

    await prisma.passTemplate.upsert({
      where: { clubId },
      create: {
        clubId,
        googleClassId: classId,
        googleIssuerId: this.issuerId,
      },
      update: {
        googleClassId: classId,
        googleIssuerId: this.issuerId,
      },
    });
  }

  private async upsertPassObject(passObject: PassObject): Promise<void> {
    if (!this.walletClient) {
      throw new Error('Google Wallet API client is not configured.');
    }

    try {
      await this.walletClient.genericobject.get({ resourceId: passObject.id });
      await this.walletClient.genericobject.patch({
        resourceId: passObject.id,
        requestBody: passObject,
      });
      return;
    } catch (error) {
      const status = this.extractHttpStatus(error);
      if (status !== 404) {
        throw new Error(
          `Failed to query Google Wallet object (${passObject.id}): ${this.extractErrorMessage(error)}`
        );
      }
    }

    try {
      await this.walletClient.genericobject.insert({ requestBody: passObject });
    } catch (error) {
      const status = this.extractHttpStatus(error);
      if (status !== 409) {
        throw new Error(
          `Failed to create Google Wallet object (${passObject.id}): ${this.extractErrorMessage(error)}`
        );
      }
      await this.walletClient.genericobject.patch({
        resourceId: passObject.id,
        requestBody: passObject,
      });
    }
  }

  private async generateJwt(passObject: PassObject): Promise<string> {
    if (!this.auth) {
      throw new Error('Google Wallet auth is not configured.');
    }

    const creds = (await this.auth.getCredentials()) as JWTInput;
    const clientEmail = creds.client_email || process.env.GOOGLE_WALLET_ISSUER_EMAIL;
    const privateKey = (creds.private_key || process.env.GOOGLE_WALLET_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
      throw new Error('Google Wallet credentials are missing client email or private key.');
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: clientEmail,
      aud: 'google',
      typ: 'savetowallet',
      iat: now,
      exp: now + 3600,
      origins: this.resolveOrigins(),
      payload: {
        genericObjects: [passObject],
      },
    };

    return jwt.sign(claims, privateKey, { algorithm: 'RS256' });
  }

  private generateSaveLink(token: string): string {
    return `https://pay.google.com/gp/v/save/${token}`;
  }

  private resolveOrigins(): string[] {
    const raw = process.env.GOOGLE_WALLET_ORIGINS ?? process.env.CLIENT_ORIGIN ?? '';
    if (!raw.trim()) {
      return [];
    }
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => this.isLikelyOrigin(origin));
  }

  private resolveLogoUrl(urlString?: string): string {
    if (urlString && this.isLikelyHttpsUrl(urlString)) {
      return urlString;
    }
    return DEFAULT_LOGO_URL;
  }

  private isLikelyHttpsUrl(urlString: string): boolean {
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isLikelyOrigin(urlString: string): boolean {
    try {
      const parsed = new URL(urlString);
      return parsed.protocol === 'https:' || parsed.hostname === 'localhost';
    } catch {
      return false;
    }
  }

  private isValidIssuerId(value: string): boolean {
    return /^\d{5,}$/.test(value);
  }

  private buildClassId(classId: string): string {
    const suffix = this.safeIdentifier(classId);
    return `${this.issuerId}.${suffix}`;
  }

  private buildObjectId(clubId: string, userId: string): string {
    const suffix = this.safeIdentifier(`${clubId}-${userId}`);
    return `${this.issuerId}.${suffix}`;
  }

  private safeIdentifier(input: string): string {
    const normalized = input.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (normalized.length >= 8 && normalized.length <= 44) {
      return normalized;
    }
    const digest = createHash('sha256').update(input).digest('hex').slice(0, 24);
    return `${digest}`;
  }

  private extractHttpStatus(error: unknown): number | undefined {
    const asAny = error as { code?: number; status?: number; response?: { status?: number } };
    return asAny?.code ?? asAny?.status ?? asAny?.response?.status;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

let serviceInstance: GoogleWalletService | null = null;

export function getGoogleWalletService(): GoogleWalletService {
  if (!serviceInstance) {
    serviceInstance = new GoogleWalletService();
  }
  return serviceInstance;
}

export const googleWalletService = {
  get generateAddToWalletLink() {
    return getGoogleWalletService().generateAddToWalletLink.bind(getGoogleWalletService());
  },
  get issueMembershipPass() {
    return getGoogleWalletService().issueMembershipPass.bind(getGoogleWalletService());
  },
};
