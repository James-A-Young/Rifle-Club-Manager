import { Firearm, SimpleFirearm } from '../types/club';

type FirearmIdentity = Pick<SimpleFirearm, 'friendlyName' | 'make' | 'model' | 'caliber'>;

type HistoryFirearmIdentity = {
  friendlyName?: string | null;
  make?: string | null;
  model?: string | null;
  caliber?: string | null;
};

export function formatFirearmName(firearm: FirearmIdentity): string {
  const friendlyName = firearm.friendlyName?.trim();
  if (friendlyName) {
    return friendlyName;
  }
  return `${firearm.make} ${firearm.model} (${firearm.caliber})`;
}

export function formatFirearmOptionLabel(firearm: FirearmIdentity): string {
  return formatFirearmName(firearm);
}

export function formatHistoryFirearmName(firearm?: HistoryFirearmIdentity | null): string | null {
  if (!firearm) {
    return null;
  }

  const friendlyName = firearm.friendlyName?.trim();
  if (friendlyName) {
    return friendlyName;
  }

  if (firearm.make && firearm.model && firearm.caliber) {
    return `${firearm.make} ${firearm.model} (${firearm.caliber})`;
  }

  return null;
}

export function formatFirearmWithSerial(serial: string | null | undefined, firearm: HistoryFirearmIdentity): string {
  const name = formatHistoryFirearmName(firearm);
  if (serial && name) {
    return `${serial} (${name})`;
  }
  if (serial) {
    return serial;
  }
  return name ?? 'N/A';
}

export function formatSummaryFirearm(serial: string | null | undefined, firearm?: HistoryFirearmIdentity | null): string {
  const name = formatHistoryFirearmName(firearm);
  if (name && serial) {
    return `${name} [${serial}]`;
  }
  if (name) {
    return name;
  }
  return serial ?? 'Unknown';
}

export function toFirearmPayload(data: {
  friendlyName?: string | null;
  make: string;
  model: string;
  caliber: string;
  serialNumber: string;
}): {
  friendlyName?: string | null;
  make: string;
  model: string;
  caliber: string;
  serialNumber: string;
} {
  const friendlyName = data.friendlyName?.trim() ?? '';
  return {
    ...data,
    friendlyName: friendlyName.length > 0 ? friendlyName : null,
  };
}

export type FirearmFormData = Pick<Firearm, 'friendlyName' | 'make' | 'model' | 'caliber' | 'serialNumber'>;
