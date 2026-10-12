/**
 * The company details an admin account sees and edits in the portal ("Mijn account" > Bedrijf).
 * Contact and address fields change at once; the company name only through a request staff approve,
 * because it ends up on contracts and invoices. Chamber of commerce and VAT numbers are not shown.
 */
export const COMPANY_DETAIL_FIELDS = [
  'contactPerson', 'phone',
  'address', 'postalCode', 'city', 'country',
  'billingAddress', 'billingPostalCode', 'billingCity',
] as const;
export type CompanyDetailField = typeof COMPANY_DETAIL_FIELDS[number];

export interface PortalCompanyDetails extends Record<CompanyDetailField, string | null> {
  /** Read-only here: changes go through a name-change request. */
  companyName: string | null;
  /** The open name-change request, if the customer already asked. */
  pendingNameChange: { requestId: number; newName: string } | null;
}
