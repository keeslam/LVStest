/**
 * One place that writes a Dutch license plate with dashes (A-7-5, A-10-5;
 * audit 2026-10-09: "38XT12" on the maintenance calendar and in the document
 * library, "38-XT-12" elsewhere). Pure, so lib/utils.ts and lib/format-utils.ts
 * can both use it without importing each other.
 *
 * Removes dashes and spaces, then formats as XX-LL-00 or similar. A plate in a
 * non-standard format is returned as it is (upper-cased, dashes stripped).
 */
export function formatLicensePlate(licensePlate: string | null | undefined): string {
  if (!licensePlate) return '';
  // Remove any existing dashes or spaces
  const sanitized = licensePlate.replace(/[-\s]/g, '').toUpperCase();
  
  // Standard Dutch license plate formats
  const formats = [
    { pattern: /^([A-Z]{2})(\d{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-00-00
    { pattern: /^(\d{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-00-XX
    { pattern: /^(\d{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // 00-XX-00
    { pattern: /^([A-Z]{2})([A-Z]{2})(\d{2})$/, format: '$1-$2-$3' }, // XX-XX-00
    { pattern: /^([A-Z]{2})(\d{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // XX-00-XX
    { pattern: /^(\d{2})([A-Z]{2})([A-Z]{2})$/, format: '$1-$2-$3' }, // 00-XX-XX
    { pattern: /^([A-Z])(\d{3})([A-Z]{2})$/, format: '$1-$2-$3' }, // X-000-XX
    { pattern: /^([A-Z]{2})(\d{3})([A-Z])$/, format: '$1-$2-$3' }, // XX-000-X
    { pattern: /^([A-Z])(\d{2})([A-Z]{3})$/, format: '$1-$2-$3' }, // X-00-XXX
    { pattern: /^([A-Z]{3})(\d{2})([A-Z])$/, format: '$1-$2-$3' }, // XXX-00-X
    { pattern: /^(\d{1})([A-Z]{3})(\d{2})$/, format: '$1-$2-$3' }, // 0-XXX-00
    { pattern: /^(\d{2})([A-Z]{3})(\d{1})$/, format: '$1-$2-$3' }, // 00-XXX-0
    { pattern: /^(\d{1})([A-Z]{2})(\d{3})$/, format: '$1-$2-$3' }, // 0-XX-000 (sidecode 13)
    { pattern: /^(\d{3})([A-Z]{2})(\d{1})$/, format: '$1-$2-$3' }, // 000-XX-0 (sidecode 14)
  ];
  
  // Try to match and format the license plate
  for (const { pattern, format } of formats) {
    if (pattern.test(sanitized)) {
      return sanitized.replace(pattern, format);
    }
  }
  
  // Anything else made of three alternating letter/digit groups (e.g. 14XT284)
  // still reads better with dashes; other plates stay as they are.
  const groups = sanitized.match(/[A-Z]+|\d+/g);
  if (groups && groups.length === 3 && groups.join('') === sanitized) return groups.join('-');
  return sanitized;
}
