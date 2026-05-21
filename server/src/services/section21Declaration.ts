import { prisma } from '../prisma';


export type Section21DeclarationResponse = {
  id: string;
  status: DeclarationStatus;
  fullLegalName: string;
  signedDate: Date;
  nextDueDate: Date;
  createdAt: Date;
};

export type Section21DeclarationDetail = Section21DeclarationResponse & {
  signedTimestamp: Date;
  ipAddress: string;
  userAgent: string;
  declarationText: string;
};

export type DeclarationStatus = 'SIGNED' | 'EXPIRED' | 'PENDING_RENEWAL' | 'NOT_DECLARED';

export type Section21DeclarationConfirmations = {
  section1: boolean;
  section1_2: boolean;
  section1_3: boolean;
  section2: boolean;
  section3: boolean;
};

export function deriveDeclarationStatusFromDueDate(
  nextDueDate: Date,
  now: Date = new Date(),
): DeclarationStatus {
  if (now > nextDueDate) {
    return 'EXPIRED';
  }

  if (now >= new Date(nextDueDate.getTime() - 90 * 24 * 60 * 60 * 1000)) {
    return 'PENDING_RENEWAL';
  }

  return 'SIGNED';
}

function resolveDeclarationText(text: string | null | undefined): string {
  if (typeof text === 'string' && text.trim().length > 0) {
    return text;
  }
  return generateDeclarationText();
}

/**
 * Generate the full declaration text as signed by the user
 */
export function generateDeclarationText(): string {
  return `SECTION 1: SECTION 21 FIREARMS ACT 1968 DECLARATION

Important Legal Declaration Under Section 21 of the Firearms Act 1968

It is an offence for a person who is prohibited by Section 21 of the Firearms Act 1968 to have a firearm or ammunition in his or her possession. By checking the boxes below, you are making a legally binding declaration regarding your eligibility to handle firearms.

☑ I declare that I am not a person prohibited from possessing a firearm or ammunition under Section 21 of the Firearms Act 1968.

☑ I declare that I have never been sentenced to a term of imprisonment, youth custody, or corrective training of three years or more (which carries a lifetime prohibition).

☑ I declare that I have not, within the last five years, been sentenced to a term of imprisonment, youth custody, or corrective training of three months or more but less than three years, nor have I received a suspended sentence of three months or more within the last five years.

SECTION 2: CERTIFICATE HISTORY & APPLICATIONS

☑ I declare that I have never had an application for a Firearm Certificate (FAC) or Shotgun Certificate (SGC) refused, nor have I ever had an FAC or SGC revoked.

(Note: If you cannot tick this box, please stop and contact the Club Secretary directly to discuss your circumstances.)

SECTION 3: POLICE DATA SHARING CONSENT

☑ I understand and agree that the Club is required by Home Office regulations to submit my full details (including Name, Date of Birth, and Address) to the relevant Police Firearms Licensing Department for background vetting prior to me being permitted to handle any firearms or ammunition. I consent to this data being shared for this purpose.

SECTION 4: FINAL DIGITAL SIGNATURE

Applicant Confirmation

By typing my name below and clicking "Submit", I confirm that all information provided in this application is true, accurate, and complete to the best of my knowledge. I understand that providing false information on this form is a serious criminal offence.`;
}

/**
 * Submit a new Section 21 declaration for a user
 */
export async function submitDeclaration(
  userId: string,
  fullLegalName: string,
  confirmations: Section21DeclarationConfirmations,
  ipAddress: string,
  userAgent: string,
): Promise<Section21DeclarationResponse> {
  const now = new Date();
  const nextDueDate = new Date(now);
  nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);

  const declaration = await prisma.$transaction(async tx => {
    const createdDeclaration = await tx.section21Declaration.create({
      data: {
        userId,
        allCheckboxesSigned:
          confirmations.section1
          && confirmations.section1_2
          && confirmations.section1_3
          && confirmations.section2
          && confirmations.section3,
        fullLegalName,
        signedDate: now,
        signedTimestamp: now,
        ipAddress,
        userAgent,
        declarationText: generateDeclarationText(),
        nextDueDate,
      },
    });

    // Keep denormalized user field in sync with declaration creation.
    await tx.user.update({
      where: { id: userId },
      data: { section21DeclarationSignedAt: now },
    });

    return createdDeclaration;
  });

  return {
    id: declaration.id,
    status: deriveDeclarationStatusFromDueDate(declaration.nextDueDate),
    fullLegalName: declaration.fullLegalName,
    signedDate: declaration.signedDate,
    nextDueDate: declaration.nextDueDate,
    createdAt: declaration.createdAt,
  };
}

/**
 * Get the user's current (most recent) declaration
 */
export async function getCurrentDeclaration(
  userId: string,
): Promise<Section21DeclarationDetail | null> {
  const declaration = await prisma.section21Declaration.findFirst({
    where: { userId },
    orderBy: { signedDate: 'desc' },
  });

  if (!declaration) {
    return null;
  }

  return {
    id: declaration.id,
    status: deriveDeclarationStatusFromDueDate(declaration.nextDueDate),
    fullLegalName: declaration.fullLegalName,
    signedDate: declaration.signedDate,
    signedTimestamp: declaration.signedTimestamp,
    ipAddress: declaration.ipAddress,
    userAgent: declaration.userAgent,
    declarationText: resolveDeclarationText(declaration.declarationText),
    nextDueDate: declaration.nextDueDate,
    createdAt: declaration.createdAt,
  };
}

/**
 * Get paginated declaration history for a user
 */
export async function getDeclarationHistory(
  userId: string,
  limit: number = 10,
  offset: number = 0,
): Promise<{
  declarations: Section21DeclarationResponse[];
  total: number;
}> {
  const [declarations, total] = await Promise.all([
    prisma.section21Declaration.findMany({
      where: { userId },
      orderBy: { signedDate: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        fullLegalName: true,
        signedDate: true,
        nextDueDate: true,
        createdAt: true,
      },
    }),
    prisma.section21Declaration.count({ where: { userId } }),
  ]);

  return {
    declarations: declarations.map(declaration => ({
      ...declaration,
      status: deriveDeclarationStatusFromDueDate(declaration.nextDueDate),
    })),
    total,
  };
}

/**
 * Check if a user has a declaration that's due for renewal
 */
export async function checkIfRenewalDue(userId: string): Promise<boolean> {
  const current = await getCurrentDeclaration(userId);

  if (!current) {
    return false;
  }

  const now = new Date();
  return now >= current.nextDueDate;
}

/**
 * Get the overall declaration status for a user
 */
export async function getDeclarationStatus(userId: string): Promise<DeclarationStatus> {
  const current = await getCurrentDeclaration(userId);

  if (!current) {
    return 'NOT_DECLARED';
  }

  return current.status;
}

/**
 * Get declaration with masked IP for admin view
 */
export async function getDeclarationForAdminView(
  userId: string,
): Promise<(Section21DeclarationDetail & { maskedIpAddress: string }) | null> {
  const declaration = await getCurrentDeclaration(userId);

  if (!declaration) {
    return null;
  }

  const parts = declaration.ipAddress.split('.');
  const maskedIp = parts.length === 4
    ? `${parts[0]}.${parts[1]}.${parts[2]}.xxx`
    : declaration.ipAddress; // Fallback for IPv6 or unusual formats

  return {
    ...declaration,
    maskedIpAddress: maskedIp,
  };
}
