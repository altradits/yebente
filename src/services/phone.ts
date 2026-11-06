/**
 * Phone number utilities for the supported mobile-money countries.
 * These are national numbering rules (country code plus subscriber
 * digits), not any company's API: Kenya (+254, 9 subscriber digits
 * starting with 7 or 1) and Ethiopia (+251, 9 subscriber digits
 * starting with 9 or 7). Wire format is E.164 digits without '+'.
 */

/* ------------------------------------------------------------------ */
/* Kenya (+254)                                                          */
/* ------------------------------------------------------------------ */

/**
 * Extracts 9 subscriber digits from any Kenyan phone input (07...,
 * 01..., 2547..., +2547...). Strips the country prefix and the trunk
 * zero so +254 0 is never created.
 */
export function extractKenyanSubscriberDigits(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254')) {
    clean = clean.slice(3);
  }
  while (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  return clean.slice(0, 9);
}

/**
 * Validates Kenyan mobile subscriber numbers: 2547XX/2541XX in full
 * form, 07XX/01XX in national form, or 9 bare subscriber digits.
 */
export function isValidKenyanPhone(phone: string): boolean {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return ['7', '1'].includes(clean[3]);
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return ['7', '1'].includes(clean[1]);
  }
  if (clean.length === 9) {
    return ['7', '1'].includes(clean[0]);
  }
  return false;
}

/**
 * Formats a Kenyan phone number to E.164 digits (2547XXXXXXXX).
 */
export function formatKenyanPhone(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return clean;
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return `254${clean.slice(1)}`;
  }
  if (clean.length === 9) {
    return `254${clean}`;
  }
  return clean;
}

/**
 * Formats a Kenyan phone number for display (+254 7XX XXX XXX).
 */
export function formatKenyanDisplayPhone(phone: string): string {
  const formatted = formatKenyanPhone(phone);
  if (formatted.length === 12 && formatted.startsWith('254')) {
    return `+254 ${formatted.slice(3, 6)} ${formatted.slice(6, 9)} ${formatted.slice(9)}`;
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/* ------------------------------------------------------------------ */
/* Ethiopia (+251)                                                       */
/* ------------------------------------------------------------------ */

/**
 * Extracts 9 subscriber digits from any Ethiopian phone input (09...,
 * 07..., 2519..., +2519...).
 */
export function extractEthiopianSubscriberDigits(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('251')) {
    clean = clean.slice(3);
  }
  while (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  return clean.slice(0, 9);
}

/**
 * Validates Ethiopian mobile subscriber numbers (9XX / 7XX ranges).
 */
export function isValidEthiopianPhone(phone: string): boolean {
  const digits = extractEthiopianSubscriberDigits(phone);
  return digits.length === 9 && ['9', '7'].includes(digits[0]);
}

/**
 * Formats to standard wire format: 2519XXXXXXXX or 2517XXXXXXXX.
 */
export function formatEthiopianPhone(phone: string): string {
  const digits = extractEthiopianSubscriberDigits(phone);
  return digits ? `251${digits}` : '';
}

/**
 * Formats to user-friendly display: +251 911 234 567.
 */
export function formatEthiopianDisplayPhone(phone: string): string {
  const digits = extractEthiopianSubscriberDigits(phone);
  if (!digits) return '';
  if (digits.length <= 3) return `+251 ${digits}`;
  if (digits.length <= 6) return `+251 ${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `+251 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}
