import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * De gebruikershandleiding uit `docs/gebruikershandleiding/` leesbaar in de app:
 * hoofdstukkenlijst links, de gerenderde markdown rechts. Gebruikt door de
 * dialoog "Handleiding" in het gebruikersmenu en door de pagina /handleiding.
 *
 * De server (`GET /api/manual`, `/api/manual/:chapter`) levert alleen bestanden
 * uit die map; hier worden de relatieve afbeeldings- en hoofdstuklinks uit de
 * markdown omgezet naar app-paden en wordt de HTML door DOMPurify gehaald.
 */

export interface ManualChapter {
  slug: string;
  title: string;
}

interface ManualChapterContent extends ManualChapter {
  markdown: string;
}

const IMAGE_BASE = "/api/manual/afbeeldingen/";
const CHAPTER_HREF = /^\/handleiding\/([0-9]{2}-[a-z0-9-]+)$/;

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

interface ManualReaderProps {
  /** Hoofdstuk dat open moet staan; zonder waarde het eerste hoofdstuk. */
  chapter?: string;
  /** Wordt aangeroepen als de lezer een ander hoofdstuk kiest (lijst of link in de tekst). */
  onChapterChange?: (slug: string) => void;
  className?: string;
}

export function ManualReader({ chapter, onChapterChange, className }: ManualReaderProps) {
  const { t } = useTranslation("nav");
  const [internal, setInternal] = useState<string | undefined>(chapter);
  const contentRef = useRef<HTMLDivElement>(null);

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

  const html = useMemo(() => (current.data ? renderManualMarkdown(current.data.markdown) : ""), [current.data]);

  const choose = (next: string) => {
    setInternal(next);
    onChapterChange?.(next);
  };

  // Een hoofdstuklink in de tekst wisselt van hoofdstuk, zonder paginalading.
  const onContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.("a");
    const match = anchor?.getAttribute("href")?.match(CHAPTER_HREF);
    if (!match) return;
    event.preventDefault();
    choose(match[1]);
  };

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [slug]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-4 md:flex-row", className)} data-testid="manual-reader">
      <nav
        className="md:w-64 md:shrink-0 rounded-md border border-gray-200 bg-white p-2 md:overflow-y-auto"
        aria-label={t("manual.chapters")}
        data-testid="manual-chapters"
      >
        <p className="px-2 py-1 text-xs font-medium uppercase text-gray-500">{t("manual.chapters")}</p>
        {chapters.isLoading && <Loader2 className="m-2 h-4 w-4 animate-spin text-gray-400" />}
        {chapters.isError && <p className="px-2 py-1 text-sm text-red-600">{t("manual.loadError")}</p>}
        <ul className="space-y-0.5">
          {chapters.data?.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => choose(item.slug)}
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
