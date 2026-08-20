/**
 * Document type classification.
 *
 * documentType is stored as free text and two conventions ended up in the data:
 * the generators write labels like "Damage Check (Pickup)", "Damage Check
 * (Unsigned)" and "Contract (Unsigned)", while some upload paths write the slug
 * "damage_check". Equality checks against a single spelling therefore silently
 * matched nothing — /api/documents/damage-checks always returned an empty list,
 * and the email dialog never grouped generated contracts or damage checks.
 *
 * Match on the shape of the value instead of one exact spelling.
 */

function normalize(documentType?: string | null): string {
  return (documentType ?? '').toLowerCase().replace(/[\s_-]+/g, '');
}

export function isDamageCheckDocument(documentType?: string | null): boolean {
  return normalize(documentType).startsWith('damagecheck');
}

export function isContractDocument(documentType?: string | null): boolean {
  return normalize(documentType).startsWith('contract');
}
