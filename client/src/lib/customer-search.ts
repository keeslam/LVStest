/** The customer fields the customer list searches. */
export interface SearchableCustomer {
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  debtorNumber?: string | null;
  companyName?: string | null;
  chamberOfCommerceNumber?: string | null;
}

const compact = (v: string) => v.toLowerCase().replace(/[\s.\-]/g, "");

/**
 * B-63: the customer search matches name, e-mail, phone and city as before, plus
 * debtor number, company name, KvK number and the names of the customer's drivers.
 * Numbers also match without spaces, dots or dashes ("1234 5678" finds "12345678").
 */
export function customerMatchesSearch(customer: SearchableCustomer, query: string, driverNames: readonly string[] = []): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const text = [customer.name, customer.email, customer.phone, customer.city, customer.debtorNumber, customer.companyName, customer.chamberOfCommerceNumber, ...driverNames];
  if (text.some((v) => v && v.toLowerCase().includes(q))) return true;
  const qc = compact(q);
  if (!qc) return false;
  return [customer.phone, customer.debtorNumber, customer.chamberOfCommerceNumber].some((v) => v && compact(v).includes(qc));
}
