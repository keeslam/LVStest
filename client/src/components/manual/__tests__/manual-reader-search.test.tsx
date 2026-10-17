/**
 * Zoeken in de handleiding: het veld boven de hoofdstukkenlijst vraagt
 * `/api/manual/zoek?q=` aan, toont per treffer hoofdstuk, paragraaf en een
 * stukje tekst; een klik op een treffer opent dat hoofdstuk en markeert het
 * zoekwoord in de tekst. Wissen brengt de hoofdstukkenlijst terug.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ManualReader, applyMarks, clearMarks } from "@/components/manual/manual-reader";

const chapters = [
  { slug: "03-klanten", title: "3. Klanten" },
  { slug: "06-transport", title: "6. Transport" },
];
const markdownOf: Record<string, string> = {
  "03-klanten": "# 3. Klanten\n\nKlik op **Voertuig blokkeren** om een auto te blokkeren.",
  "06-transport": "# 6. Transport\n\nEen **transport** is elke verplaatsing.\n\n## 6.7 Het transportrapport\n\nKlik op **Afdrukken / rapport genereren**.",
};

function mount(requests: string[]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        queryFn: async ({ queryKey }) => {
          const url = String(queryKey[0]);
          requests.push(url);
          if (url === "/api/manual") return chapters;
          if (url.startsWith("/api/manual/zoek?q=")) {
            const query = decodeURIComponent(url.slice("/api/manual/zoek?q=".length));
            if (query.toLowerCase() !== "transportrapport") return { query, hits: [], truncated: false };
            return {
              query,
              truncated: false,
              hits: [{ slug: "06-transport", title: "6. Transport", heading: "6.7 Het transportrapport", snippet: "Klik op Afdrukken / rapport genereren." }],
            };
          }
          if (url.startsWith("/api/manual/")) {
            const slug = url.slice("/api/manual/".length);
            return { slug, title: chapters.find((c) => c.slug === slug)?.title, markdown: markdownOf[slug] };
          }
          return [];
        },
      },
    },
  });
  const onChapterChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ManualReader onChapterChange={onChapterChange} />
    </QueryClientProvider>,
  );
  return { onChapterChange };
}

describe("ManualReader — zoeken", () => {
  it("shows the hits, opens the chapter of a hit and marks the word in the text", async () => {
    const requests: string[] = [];
    const { onChapterChange } = mount(requests);
    await screen.findByTestId("manual-chapter-03-klanten");
    expect(await screen.findByTestId("manual-content")).toHaveTextContent("Voertuig blokkeren");

    await userEvent.type(screen.getByTestId("manual-search"), "transportrapport");
    const results = await screen.findByTestId("manual-search-results");
    await waitFor(() => expect(requests).toContain("/api/manual/zoek?q=transportrapport"));
    expect(results).toHaveTextContent("1 treffer");
    expect(results).toHaveTextContent("6. Transport › 6.7 Het transportrapport");
    expect(results).toHaveTextContent("Klik op Afdrukken / rapport genereren.");
    // While searching the chapter list makes way for the results.
    expect(screen.queryByTestId("manual-chapter-03-klanten")).not.toBeInTheDocument();

    await userEvent.click(within(results).getByTestId("manual-hit-06-transport"));
    expect(onChapterChange).toHaveBeenCalledWith("06-transport");
    const content = screen.getByTestId("manual-content");
    await waitFor(() => expect(content).toHaveTextContent("Het transportrapport"));
    await waitFor(() => expect(content.querySelectorAll("mark[data-manual-hit]").length).toBe(1));
    expect(content.querySelector("mark[data-manual-hit]")).toHaveTextContent("transportrapport");

    // Clearing the search brings the chapter list back and removes the marks.
    await userEvent.click(screen.getByTestId("manual-search-back"));
    expect(await screen.findByTestId("manual-chapter-06-transport")).toBeInTheDocument();
    await waitFor(() => expect(content.querySelectorAll("mark[data-manual-hit]").length).toBe(0));
    expect(content).toHaveTextContent("Het transportrapport");
  });

  it("asks for two characters and reports when nothing matches", async () => {
    const requests: string[] = [];
    mount(requests);
    await screen.findByTestId("manual-chapter-03-klanten");
    await userEvent.type(screen.getByTestId("manual-search"), "t");
    expect(await screen.findByText("Typ minstens twee tekens.")).toBeInTheDocument();
    expect(requests.some((url) => url.startsWith("/api/manual/zoek"))).toBe(false);

    await userEvent.type(screen.getByTestId("manual-search"), "ransportrap");
    expect(await screen.findByText('Niets gevonden voor "transportrap".')).toBeInTheDocument();
  });
});

describe("applyMarks / clearMarks", () => {
  it("wraps every case-insensitive match in a mark and clearMarks restores the text", () => {
    const root = document.createElement("article");
    root.innerHTML = "<p>Een <strong>Transport</strong> is een transport.</p>";
    expect(applyMarks(root, "transport")).toBe(2);
    expect(root.querySelectorAll("mark[data-manual-hit]").length).toBe(2);
    expect(root.textContent).toBe("Een Transport is een transport.");
    clearMarks(root);
    expect(root.querySelectorAll("mark").length).toBe(0);
    expect(root.innerHTML).toBe("<p>Een <strong>Transport</strong> is een transport.</p>");
    expect(applyMarks(root, "x")).toBe(0);
  });
});
