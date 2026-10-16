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

export function registerManualRoutes(app: Express, deps: Pick<RouteDeps, "requireAuth">): void {
  const { requireAuth } = deps;

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
