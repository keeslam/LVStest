export interface DiagramTemplateLike {
  make?: string | null;
  model?: string | null;
  description?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
}

export interface DiagramTemplateFilter {
  /** Free text: make, model or description. */
  q?: string;
  /** One make, compared without case; empty = every make. */
  make?: string;
  /** A build year the diagram must cover; an open start or end covers it. */
  year?: number | null;
}

/** Kees 2026-10-24: search and filter the vehicle diagram templates. */
export function filterDiagramTemplates<T extends DiagramTemplateLike>(templates: readonly T[], filter: DiagramTemplateFilter): T[] {
  const q = (filter.q ?? "").trim().toLowerCase();
  const make = (filter.make ?? "").trim().toLowerCase();
  const year = filter.year ?? null;
  return templates.filter((t) => {
    if (make && (t.make ?? "").trim().toLowerCase() !== make) return false;
    if (q && ![t.make, t.model, t.description, `${t.make ?? ""} ${t.model ?? ""}`].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
    if (year !== null && Number.isFinite(year)) {
      if (t.yearFrom && year < t.yearFrom) return false;
      if (t.yearTo && year > t.yearTo) return false;
    }
    return true;
  });
}

/** The makes in use, each once, sorted A-Z (first spelling wins). */
export function diagramMakes(templates: readonly DiagramTemplateLike[]): string[] {
  const seen = new Map<string, string>();
  for (const t of templates) {
    const make = (t.make ?? "").trim();
    if (make && !seen.has(make.toLowerCase())) seen.set(make.toLowerCase(), make);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "nl"));
}
