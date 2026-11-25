/** Checks on what patients and staff type. */

const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

/** Reads a text field from a submitted form, trimmed and capped. */
export function text(form: FormData, name: string, maxLength = 200): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** Reads a whole number from a form, or null when it is missing or out of range. */
export function wholeNumber(form: FormData, name: string, min: number, max: number): number | null {
  const raw = text(form, name, 12);
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

/**
 * Normalizes an Egyptian mobile number to 01XXXXXXXXX. Accepts Arabic
 * digits, spaces, and a +20 or 0020 prefix. Returns null for anything else.
 */
export function egyptianMobile(input: string): string | null {
  let digits = [...input].map((char) => (arabicDigits.includes(char) ? String(arabicDigits.indexOf(char)) : char)).join('');
  digits = digits.replace(/[\s\-()]/g, '').replace(/^(\+|00)/, '');
  if (digits.startsWith('20')) digits = `0${digits.slice(2)}`;
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

/** The number in the form WhatsApp links need: 201XXXXXXXXX. */
export function whatsappNumber(mobile: string): string {
  return `2${mobile}`;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
