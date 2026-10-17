/**
 * De gebruikershandleiding in de app: `GET /api/manual` (hoofdstukkenlijst),
 * `GET /api/manual/:chapter` (de markdown van één hoofdstuk) en
 * `GET /api/manual/afbeeldingen/:file` (een schermafbeelding).
 *
 * Alleen `docs/gebruikershandleiding/` wordt gelezen. Een hoofdstuknaam moet
 * voldoen aan `NN-naam` (alleen kleine letters, cijfers en koppeltekens) en het
 * opgeloste pad moet binnen de map liggen; alles daarbuiten is 404. Zo kan geen
 * `../` of een absoluut pad een ander bestand van de server ophalen.
 *
 * De map staat buiten `dist/`, dus de Dockerfile kopieert haar mee; `MANUAL_DIR`
 * kan haar elders aanwijzen.
 */
import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import type { RouteDeps } from "./deps";

export const CHAPTER_NAME = /^[0-9]{2}-[a-z0-9-]+$/;
const IMAGE_NAME = /^[a-z0-9-]+\.(png|jpg|jpeg|gif|webp|svg)$/;
const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export interface ManualChapter {
  slug: string;
  title: string;
}

export function getManualDir(): string {
  return path.resolve(process.env.MANUAL_DIR || path.join(process.cwd(), "docs", "gebruikershandleiding"));
}

/** Resolves `relative` inside the manual dir, or null when it would land outside it. */
export function resolveManualPath(relative: string): string | null {
  const root = getManualDir();
  const abs = path.resolve(root, relative);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

function titleOf(markdown: string, slug: string): string {
  const heading = markdown.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : slug;
}

export async function listChapters(): Promise<ManualChapter[]> {
  const root = getManualDir();
  const names = (await fs.readdir(root))
    .filter((name) => name.endsWith(".md") && CHAPTER_NAME.test(name.slice(0, -3)))
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const slug = name.slice(0, -3);
      const markdown = await fs.readFile(path.join(root, name), "utf8");
      return { slug, title: titleOf(markdown, slug) };
    }),
  );
}

export interface ManualSearchHit {
  slug: string;
  title: string;
  /** The nearest `##`/`###` heading above the hit, or "" in the chapter intro. */
  heading: string;
  /** One line of the chapter with the markdown markers removed, around the first match. */
  snippet: string;
}

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_HITS = 100;

/** Markdown markers out of one line, so a snippet reads as plain text. */
export function stripMarkdown(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*]\s+(\[[ x]\]\s*)?/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$|[.,;:)])/g, "$1")
    .replace(/\s*\|\s*/g, " | ")
    .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetAround(text: string, index: number, needle: string, width = 160): string {
  if (text.length <= width) return text;
  const start = Math.max(0, Math.min(index - Math.floor((width - needle.length) / 2), text.length - width));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Case-insensitive search over every chapter, one hit per matching line, in chapter order. */
export async function searchManual(query: string): Promise<{ query: string; hits: ManualSearchHit[]; truncated: boolean }> {
  const needle = query.trim().toLowerCase();
  if (needle.length < SEARCH_MIN_LENGTH) return { query, hits: [], truncated: false };
  const root = getManualDir();
  const hits: ManualSearchHit[] = [];
  let truncated = false;
  for (const chapter of await listChapters()) {
    const markdown = await fs.readFile(path.join(root, `${chapter.slug}.md`), "utf8");
    let heading = "";
    let separatorRow = false;
    for (const rawLine of markdown.split(/\r?\n/)) {
      if (/^#{2,6}\s+/.test(rawLine)) heading = stripMarkdown(rawLine);
      // A table's `|---|---|` row never is a hit.
      separatorRow = /^\s*\|?\s*:?-{3,}/.test(rawLine);
      if (separatorRow || /^#\s+/.test(rawLine)) continue;
      const text = stripMarkdown(rawLine);
      const index = text.toLowerCase().indexOf(needle);
      if (index < 0) continue;
      if (hits.length >= SEARCH_MAX_HITS) {
        truncated = true;
        return { query, hits, truncated };
      }
      hits.push({ slug: chapter.slug, title: chapter.title, heading, snippet: snippetAround(text, index, needle) });
    }
  }
  return { query, hits, truncated };
}

export function registerManualRoutes(app: Express, deps: Pick<RouteDeps, "requireAuth">): void {
  const { requireAuth } = deps;

  // Literal prefix before `/:chapter`, so "zoek" is never read as a chapter name.
  app.get("/api/manual/zoek", requireAuth, async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
    try {
      res.json(await searchManual(query));
    } catch (error) {
      console.error("Handleiding: zoeken mislukt", error);
      res.status(500).json({ message: "Zoeken in de handleiding is mislukt" });
    }
  });

  app.get("/api/manual", requireAuth, async (_req: Request, res: Response) => {
    try {
      res.json(await listChapters());
    } catch (error) {
      console.error("Handleiding: hoofdstukkenlijst mislukt", error);
      res.status(500).json({ message: "Handleiding niet beschikbaar" });
    }
  });

  // Literal prefix before `/:chapter`, so the image path does not match a chapter.
  app.get("/api/manual/afbeeldingen/:file", requireAuth, async (req: Request, res: Response) => {
    const file = String(req.params.file);
    const abs = IMAGE_NAME.test(file) ? resolveManualPath(path.join("afbeeldingen", file)) : null;
    if (!abs) return res.status(404).json({ message: "Afbeelding niet gevonden" });
    try {
      const data = await fs.readFile(abs);
      res.setHeader("Content-Type", IMAGE_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(data);
    } catch {
      res.status(404).json({ message: "Afbeelding niet gevonden" });
    }
  });

  app.get("/api/manual/:chapter", requireAuth, async (req: Request, res: Response) => {
    const slug = String(req.params.chapter);
    const abs = CHAPTER_NAME.test(slug) ? resolveManualPath(`${slug}.md`) : null;
    if (!abs) return res.status(404).json({ message: "Hoofdstuk niet gevonden" });
    try {
      const markdown = await fs.readFile(abs, "utf8");
      res.json({ slug, title: titleOf(markdown, slug), markdown });
    } catch {
      res.status(404).json({ message: "Hoofdstuk niet gevonden" });
    }
  });
}
