import { createHash } from 'crypto';

const PWNED_PASSWORDS_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const PWNED_PASSWORDS_TIMEOUT_MS = 3500;
const SEQUENTIAL_RUN_LENGTH = 4;

export type PasswordValidationResult = {
  isValid: boolean;
  error?: string;
};

function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

function hasSequentialCharacters(password: string, runLength: number): boolean {
  if (password.length < runLength) {
    return false;
  }

  const normalized = password.toLowerCase();
  let ascendingRun = 1;
  let descendingRun = 1;

  for (let i = 1; i < normalized.length; i += 1) {
    const prevCode = normalized.charCodeAt(i - 1);
    const currCode = normalized.charCodeAt(i);

    const isAlphaNumeric =
      (prevCode >= 48 && prevCode <= 57 && currCode >= 48 && currCode <= 57)
      || (prevCode >= 97 && prevCode <= 122 && currCode >= 97 && currCode <= 122);

    if (!isAlphaNumeric) {
      ascendingRun = 1;
      descendingRun = 1;
      continue;
    }

    if (currCode - prevCode === 1) {
      ascendingRun += 1;
    } else {
      ascendingRun = 1;
    }

    if (currCode - prevCode === -1) {
      descendingRun += 1;
    } else {
      descendingRun = 1;
    }

    if (ascendingRun >= runLength || descendingRun >= runLength) {
      return true;
    }
  }

  return false;
}

async function checkPwnedPassword(password: string): Promise<{ isPwned: boolean; breachCount: number; unavailable: boolean }> {
  if (process.env.NODE_ENV === 'test') {
    return { isPwned: false, breachCount: 0, unavailable: true };
  }

  const hash = sha1Upper(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PWNED_PASSWORDS_TIMEOUT_MS);

  try {
    const response = await fetch(`${PWNED_PASSWORDS_RANGE_URL}${prefix}`, {
      method: 'GET',
      headers: {
        'Add-Padding': 'true',
        'User-Agent': 'shootingmatch.app password security check',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { isPwned: false, breachCount: 0, unavailable: true };
    }

    const text = await response.text();
    const lines = text.split(/\r?\n/);
    const matchedLine = lines.find(line => {
      const [lineSuffix] = line.split(':');
      return (lineSuffix || '').trim().toUpperCase() === suffix;
    });

    const breachCount = matchedLine
      ? Number.parseInt((matchedLine.split(':')[1] || '0').trim(), 10) || 0
      : 0;

    return {
      isPwned: breachCount > 0,
      breachCount,
      unavailable: false,
    };
  } catch {
    return { isPwned: false, breachCount: 0, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function validatePasswordSecurity(password: string): Promise<PasswordValidationResult> {
  const pwnedResult = await checkPwnedPassword(password);
  if (!pwnedResult.unavailable) {
    if (pwnedResult.isPwned) {
      return {
        isValid: false,
        error: `This password has appeared in known data breaches (${pwnedResult.breachCount.toLocaleString()} times). Please choose a different password.`,
      };
    }

    return { isValid: true };
  }

  if (hasSequentialCharacters(password, SEQUENTIAL_RUN_LENGTH)) {
    return {
      isValid: false,
      error: 'Password cannot contain sequential characters (for example, 1234 or abcd).',
    };
  }

  return { isValid: true };
}
