import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/**
 * De gebruikershandleiding uit `docs/gebruikershandleiding/` leesbaar in de app:
 * hoofdstukkenlijst links, de gerenderde markdown rechts. Gebruikt door de
 * dialoog "Handleiding" in het gebruikersmenu en door de pagina /handleiding.
 *
 * De server (`GET /api/manual`, `/api/manual/:chapter`, `/api/manual/zoek`)
 * levert alleen bestanden uit die map; hier worden de relatieve afbeeldings- en
 * hoofdstuklinks uit de markdown omgezet naar app-paden en wordt de HTML door
 * DOMPurify gehaald.
 *
 * Zoeken: het veld boven de hoofdstukkenlijst doorzoekt alle hoofdstukken
 * tegelijk (server, `/api/manual/zoek?q=`). Een treffer opent het hoofdstuk,
 * markeert het zoekwoord in de tekst en scrolt naar de eerste markering.
 */

export interface ManualChapter {
  slug: string;
  title: string;
}

interface ManualChapterContent extends ManualChapter {
  markdown: string;
}

export interface ManualSearchHit {
  slug: string;
  title: string;
  heading: string;
  snippet: string;
}

interface ManualSearchResult {
  query: string;
  hits: ManualSearchHit[];
  truncated: boolean;
}

const IMAGE_BASE = "/api/manual/afbeeldingen/";
const CHAPTER_HREF = /^\/handleiding\/([0-9]{2}-[a-z0-9-]+)$/;
export const SEARCH_MIN_LENGTH = 2;
const MARK_ATTR = "data-manual-hit";

/** `afbeeldingen/x.png` wordt de API-url; `03-klanten.md#6.1` wordt `/handleiding/03-klanten`. */
export function rewriteManualHtml(html: string): string {
  return html
    .replace(/(<img\b[^>]*\bsrc=")(?:\.\/)?afbeeldingen\//g, `$1${IMAGE_BASE}`)
    .replace(/(<a\b[^>]*\bhref=")(?:\.\/)?([0-9]{2}-[a-z0-9-]+)\.md(#[^"]*)?"/g, '$1/handleiding/$2"');
}

export function renderManualMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(rewriteManualHtml(html));
}

/** Haalt eerdere markeringen weg, zodat de tekst weer is zoals gerenderd. */
export function clearMarks(root: HTMLElement): void {
  root.querySelectorAll(`mark[${MARK_ATTR}]`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(root.ownerDocument.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

/** Zet `<mark>` om elk voorkomen van `term` (hoofdletterongevoelig) in de tekstknopen; geeft het aantal terug. */
export function applyMarks(root: HTMLElement, term: string): number {
  const needle = term.trim().toLowerCase();
  if (needle.length < SEARCH_MIN_LENGTH) return 0;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const textNodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest("script, style, mark")) continue;
    if ((node.textContent ?? "").toLowerCase().includes(needle)) textNodes.push(node as Text);
  }
  let count = 0;
  for (const text of textNodes) {
    const value = text.textContent ?? "";
    const lower = value.toLowerCase();
    const fragment = doc.createDocumentFragment();
    let from = 0;
    let index = lower.indexOf(needle);
    while (index >= 0) {
      if (index > from) fragment.appendChild(doc.createTextNode(value.slice(from, index)));
      const mark = doc.createElement("mark");
      mark.setAttribute(MARK_ATTR, "");
      mark.className = "rounded bg-yellow-200 px-0.5";
      mark.textContent = value.slice(index, index + needle.length);
      fragment.appendChild(mark);
      count += 1;
      from = index + needle.length;
      index = lower.indexOf(needle, from);
    }
    if (from < value.length) fragment.appendChild(doc.createTextNode(value.slice(from)));
    text.parentNode?.replaceChild(fragment, text);
  }
  return count;
}

interface ManualReaderProps {
  /** Hoofdstuk dat open moet staan; zonder waarde het eerste hoofdstuk. */
  chapter?: string;
  /** Wordt aangeroepen als de lezer een ander hoofdstuk kiest (lijst, link in de tekst of zoektreffer). */
  onChapterChange?: (slug: string) => void;
  className?: string;
}

export function ManualReader({ chapter, onChapterChange, className }: ManualReaderProps) {
  const { t } = useTranslation("nav");
  const [internal, setInternal] = useState<string | undefined>(chapter);
  const [query, setQuery] = useState("");
  /** Het zoekwoord dat in de tekst gemarkeerd wordt; staat pas na een klik op een treffer. */
  const [highlight, setHighlight] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searching = debouncedQuery.length >= SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (chapter) setInternal(chapter);
  }, [chapter]);

  const chapters = useQuery<ManualChapter[]>({ queryKey: ["/api/manual"], staleTime: 5 * 60 * 1000 });

  const slug = internal ?? chapters.data?.[0]?.slug;
  const current = useQuery<ManualChapterContent>({
    queryKey: [`/api/manual/${slug}`],
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });

  const results = useQuery<ManualSearchResult>({
    queryKey: [`/api/manual/zoek?q=${encodeURIComponent(debouncedQuery)}`],
    enabled: searching,
    staleTime: 5 * 60 * 1000,
  });

  const html = useMemo(() => (current.data ? renderManualMarkdown(current.data.markdown) : ""), [current.data]);

  const choose = (next: string) => {
    setInternal(next);
    onChapterChange?.(next);
  };

  const openHit = (hit: ManualSearchHit) => {
    setHighlight(debouncedQuery);
    choose(hit.slug);
  };

  const clearSearch = () => {
    setQuery("");
    setHighlight("");
  };

  // Een hoofdstuklink in de tekst wisselt van hoofdstuk, zonder paginalading.
  const onContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a");
    const match = anchor?.getAttribute("href")?.match(CHAPTER_HREF);
    if (!match) return;
    event.preventDefault();
    choose(match[1]);
  };

  // Na het renderen van een hoofdstuk: het zoekwoord markeren en naar de eerste
  // markering scrollen; zonder zoekwoord naar boven.
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const article = root.querySelector("article");
    if (article) {
      clearMarks(article);
      if (highlight && applyMarks(article, highlight) > 0) {
        const first = article.querySelector(`mark[${MARK_ATTR}]`);
        if (first && typeof (first as HTMLElement).scrollIntoView === "function") {
          (first as HTMLElement).scrollIntoView({ block: "center" });
          return;
        }
      }
    }
    root.scrollTop = 0;
  }, [slug, html, highlight]);

  const hitCount = results.data?.hits.length ?? 0;

  return (
    <div className={cn("flex min-h-0 flex-col gap-4 md:flex-row", className)} data-testid="manual-reader">
      <nav
        className="flex flex-col md:w-72 md:shrink-0 rounded-md border border-gray-200 bg-white p-2 md:overflow-y-auto"
        aria-label={t("manual.chapters")}
        data-testid="manual-chapters"
      >
        <label className="sr-only" htmlFor="manual-search">
          {t("manual.search.label")}
        </label>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
          <Input
            id="manual-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("manual.search.placeholder")}
            className="h-9 pl-8 pr-8"
            autoComplete="off"
            data-testid="manual-search"
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-1.5 top-1.5 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label={t("manual.search.clear")}
              data-testid="manual-search-clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {query.trim().length > 0 && !searching && (
          <p className="px-2 py-1 text-xs text-gray-500">{t("manual.search.tooShort")}</p>
        )}

        {searching ? (
          <div className="min-h-0 flex-1" data-testid="manual-search-results">
            {results.isLoading && (
              <p className="flex items-center gap-2 px-2 py-1 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("manual.search.searching")}
              </p>
            )}
            {results.isError && <p className="px-2 py-1 text-sm text-red-600">{t("manual.search.failed")}</p>}
            {results.data && (
              <>
                <p className="px-2 py-1 text-xs font-medium uppercase text-gray-500">
                  {hitCount === 0
                    ? t("manual.search.none", { query: results.data.query })
                    : t("manual.search.count", { count: hitCount })}
                </p>
                <ul className="space-y-0.5">
                  {results.data.hits.map((hit, index) => (
                    <li key={`${hit.slug}-${index}`}>
                      <button
                        type="button"
                        onClick={() => openHit(hit)}
                        className="block w-full rounded px-2 py-1.5 text-left hover:bg-gray-100"
                        data-testid={`manual-hit-${hit.slug}`}
                      >
                        <span className="block text-xs font-medium text-primary-700">
                          {hit.title}
                          {hit.heading ? ` › ${hit.heading}` : ""}
                        </span>
                        <span className="block text-sm text-gray-700">{hit.snippet}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {results.data.truncated && (
                  <p className="px-2 py-1 text-xs text-gray-500">{t("manual.search.truncated", { count: hitCount })}</p>
                )}
              </>
            )}
            <button
              type="button"
              onClick={clearSearch}
              className="mt-2 block w-full rounded px-2 py-1.5 text-left text-sm text-primary-700 hover:bg-gray-100"
              data-testid="manual-search-back"
            >
              {t("manual.search.backToChapters")}
            </button>
          </div>
        ) : (
          <>
            <p className="px-2 py-1 text-xs font-medium uppercase text-gray-500">{t("manual.chapters")}</p>
            {chapters.isLoading && <Loader2 className="m-2 h-4 w-4 animate-spin text-gray-400" />}
            {chapters.isError && <p className="px-2 py-1 text-sm text-red-600">{t("manual.loadError")}</p>}
            <ul className="space-y-0.5">
              {chapters.data?.map((item) => (
                <li key={item.slug}>
                  <button
                    type="button"
                    onClick={() => {
                      setHighlight("");
                      choose(item.slug);
                    }}
                    className={cn(
                      "block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100",
                      item.slug === slug ? "bg-primary-50 font-medium text-primary-700" : "text-gray-700",
                    )}
                    aria-current={item.slug === slug ? "page" : undefined}
                    data-testid={`manual-chapter-${item.slug}`}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div
        ref={contentRef}
        onClick={onContentClick}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-md border border-gray-200 bg-white p-4 md:p-6"
        data-testid="manual-content"
      >
        {current.isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("manual.loading")}
          </div>
        )}
        {current.isError && <p className="text-sm text-red-600">{t("manual.chapterNotFound")}</p>}
        {current.data && (
          <article
            className="prose prose-sm sm:prose-base max-w-none prose-img:rounded-md prose-img:border prose-img:border-gray-200 prose-a:text-primary-600"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
