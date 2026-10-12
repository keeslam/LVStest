/**
 * "PEUGEOT PEUGEOT BOXER": some vehicles are stored with the brand repeated at the start of the model. A name
 * shown to a person leaves the second one out; the stored data stays as it is.
 */
export function vehicleName(brand: string | null | undefined, model: string | null | undefined): string {
  const b = (brand ?? "").trim();
  const m = (model ?? "").trim();
  if (!b) return m;
  if (!m) return b;
  return m.toLowerCase().startsWith(b.toLowerCase()) ? m : `${b} ${m}`;
}
