# Rapportenscherm herontwerp — deel 4: berekende velden en totaalregel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In de rapportbouwer maak je berekende velden (rekensom met + − × ÷ en haakjes, of een als-dan regel) die je kunt tonen, filteren, sorteren, groeperen en optellen, en een totaalregel onder de tabel (Som, Gemiddelde, Aantal) die ook op de afdruk en in de CSV staat.

**Architecture:** Een berekend veld wordt opgeslagen als boomstructuur in `configuration.calculatedFields`. Een gedeelde module (`shared/report-formula.ts`) zet de invoer van de gebruiker (tokens) om in die boom, valideert hem (alleen bekende velden, geen kringen, maximale diepte) en berekent een voorbeeldwaarde. De server bouwt per boom een geparametriseerde SQL-expressie (deling via `NULLIF`, per regel vóór groeperen). De totaalregel wordt in de browser berekend over alle opgehaalde regels.

**Tech Stack:** Express + Drizzle (`executeReport`), React, kit `ReportTable` (`totals`), print kit.

**Spec:** `docs/superpowers/specs/2026-10-25-rapporten-scherm-herontwerp-design.md`, "Deel 4" + "Keuzes van mij" (per regel vóór groeperen; berekend veld mag eerder berekend veld gebruiken; geen kringen; totaalregel bij procent alleen Gemiddelde).

## Global Constraints

- Formules nooit als tekst in SQL: alleen whitelisted velden (incl. `via`), getallen als gebonden parameters, operatoren uit een vaste lijst.
- Delen door nul ⇒ leeg (NULL), nooit een fout.
- Rechten: een berekend veld gebruikt velden met dezelfde rechtenregels (bron, gekoppelde bron, km alleen beheerder); de server controleert alle velden in alle formules.
- Grenzen: maximaal 20 berekende velden per rapport, diepte ≤ 10, tekst in als-dan ≤ 100 tekens.
- Soorten: **Bedrag**, **Getal**, **Procent** (rekensom), **Tekst** of het soort van de gekozen velden (als-dan).
- Knopnamen: **Berekend veld toevoegen**, **Rekensom**, **Als-dan regel**, **Naam**, **Formule**, **Soort**, **Voorbeeld**, **Als**, **dan**, **anders**, **is gelijk aan**, **is niet gelijk aan**, **groter dan**, **kleiner dan**, **is leeg**, **Totaalregel**, **Som**, **Gemiddelde**, **Aantal**. 7 talen.
- Oude rapporten zonder `calculatedFields`/`totals` werken ongewijzigd.

## Review Focus

1. Formule die een veld gebruikt dat later uit het rapport is gehaald (bron uitgevinkt) ⇒ duidelijke melding, geen 500 (Task 2, 3).
2. Deel door een veld dat 0 of leeg is ⇒ lege cel; Som/Gemiddelde slaan lege cellen over (Task 2, 4).
3. Kring: veld A gebruikt B, B gebruikt A ⇒ geweigerd bij opslaan én uitvoeren (Task 1, 2).
4. Groeperen op een als-dan veld en Aantal tellen ⇒ zelfde totaal als zonder groeperen (Task 2).
5. Totaalregel op afdruk "Alleen deze pagina" ⇒ totaal van de afgedrukte regels, met label "Totaal (deze pagina)" (Task 4).

---

### Task 1: Gedeelde formule-module

**Files:**
- Create: `shared/report-formula.ts`, `shared/report-formula.test.ts`
- Modify: `shared/report-builder-config.ts` (`ReportConfiguration.calculatedFields?: CalculatedField[]`, `totals?: Record<string, "SUM" | "AVG" | "COUNT">`; `ReportColumn`/`ReportFilter`/`ReportGrouping` krijgen optioneel `calc?: string` (id van een berekend veld) in plaats van `table`/`field`)

**Interfaces:**
- Produces:
  - `type FormulaNode = { kind: "field"; table: string; field: string; via?: string } | { kind: "calc"; id: string } | { kind: "number"; value: number } | { kind: "op"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode }`
  - `type IfThenRule = { when: { ref: FormulaNode; test: "eq" | "neq" | "gt" | "lt" | "empty"; value?: string | number }; then: { text: string } | { ref: FormulaNode }; otherwise: { text: string } | { ref: FormulaNode } }`
  - `interface CalculatedField { id: string; name: string; kind: "formula" | "ifThen"; type: "money" | "number" | "percent" | "text"; formula?: FormulaNode; rule?: IfThenRule }`
  - `type FormulaToken = { t: "field"; table; field; via? } | { t: "calc"; id } | { t: "number"; value } | { t: "op"; op } | { t: "(" } | { t: ")" }`
  - `parseFormula(tokens: FormulaToken[]): { ok: true; node: FormulaNode } | { ok: false; error: "EMPTY" | "UNBALANCED" | "MISSING_OPERAND" | "MISSING_OPERATOR" }` (gewone voorrang: × ÷ vóór + −, links-associatief)
  - `formulaTokens(node): FormulaToken[]` (terug naar tokens voor bewerken; haakjes alleen waar nodig)
  - `validateCalculatedFields(fields, isKnownField: (ref) => boolean): { ok: true } | { ok: false; error: "UNKNOWN_FIELD" | "CYCLE" | "TOO_DEEP" | "TOO_MANY" | "BAD_RULE"; id: string }`
  - `evaluateFormula(node, row: (ref) => number | null, calcs): number | null` (voor het voorbeeld in de bouwer; deling door 0 ⇒ null)
  - `referencedFields(fields): FormulaNode[]` (alle veld-refs, voor rechtencheck)

- [ ] **Step 1: Write failing tests** (`shared/report-formula.test.ts`): `parseFormula([Omzet, −, Kosten])` ⇒ op −; `[a, +, b, ×, c]` ⇒ a + (b × c); `[(, a, +, b, ), ×, c]` ⇒ (a + b) × c; `[a, +]` ⇒ `MISSING_OPERAND`; `[(, a]` ⇒ `UNBALANCED`; `[a, b]` ⇒ `MISSING_OPERATOR`; `formulaTokens(parseFormula(x))` round-trip voor de drie geldige gevallen; `evaluateFormula(a ÷ b)` met b = 0 ⇒ null; kring A→B→A ⇒ `CYCLE`; 21 velden ⇒ `TOO_MANY`; onbekend veld ⇒ `UNKNOWN_FIELD`.
- [ ] **Step 2: Run** `npx vitest run shared/report-formula.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; tsc schoon.
- [ ] **Step 5: Commit** `feat(rapporten): shared formula model for calculated report fields`.

### Task 2: Server — berekende velden uitvoeren

**Files:**
- Modify: `server/database-storage.ts` `executeReport` (per berekend veld een SQL-expressie: veld ⇒ zelfde ident als gewone kolommen (incl. `via`/join), getal ⇒ parameter, `/` ⇒ `a / NULLIF(b, 0)`, rekenen in `numeric`; als-dan ⇒ `CASE WHEN … THEN … ELSE … END` met tekst als parameter; `calc`-verwijzing ⇒ expressie van dat veld (recursief, na validatie); kolom/filter/groep/berekening (`aggregation`) met `calc` gebruiken die expressie; result-key `calc.<id>`; NOT_GROUPED/DUPLICATE houden rekening met `calc`)
- Modify: `server/routes/reports.ts` (validatie via `validateCalculatedFields` bij execute/POST/PUT ⇒ 400 `REPORT_CALC_INVALID` met `{ error, id }`; rechtencheck over `referencedFields` (bron, `via`, km))
- Test: `server/__tests__/report-builder-calc.test.ts`

- [ ] **Step 1: Write failing tests**: kosten-bron, berekend veld "Incl. btw" = `amount × 1.21` ⇒ kolom `calc.inclVat` = bedrag × 1,21 per regel; "Per dag" = `amount ÷ 0` ⇒ null; als-dan "Hoog" = als `amount` groter dan 500 dan "Hoog" anders "Normaal" ⇒ tekst; groeperen op "Hoog" + Aantal op `id` ⇒ som = aantal regels; Som op `calc.inclVat` ⇒ som van de rijwaarden; filter `calc.inclVat greater_than 100`; kring ⇒ 400 `REPORT_CALC_INVALID` `CYCLE`; formule met `vehicles.currentMileage via vehicle` voor niet-beheerder ⇒ 403; tekst met `'; DROP` ⇒ als tekst teruggegeven (parameter), geen fout.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/report-builder-calc.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run server/__tests__/report-builder-*.test.ts server/__tests__/report-routes-guards.test.ts` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): calculated fields run on the server, per row before grouping`.

### Task 3: Bouwer — berekend veld maken en gebruiken

**Files:**
- Create: `client/src/pages/reports/calculated-field-dialog.tsx` (dialoog `dialog-calculated-field`: **Naam**, keuze **Rekensom** / **Als-dan regel**, **Soort**; rekensom: formulebalk met tokens, knoppen per veld (incl. gekoppelde en eerdere berekende velden), getal-invoer, + − × ÷ ( ) en wissen; foutmelding uit `parseFormula`; **Voorbeeld** met de eerste regel van de laatste uitvoer of "Voer het rapport uit voor een voorbeeld."; als-dan: velden **Als** (veld) + test + waarde, **dan** / **anders** (tekst of veld); bewerken van een bestaand berekend veld)
- Modify: `client/src/pages/reports/report-builder.tsx` (knop **Berekend veld toevoegen** `button-add-calculated-field`; lijst berekende velden met bewerken/verwijderen; berekend veld als kolom/filter/groep/berekening kiesbaar; verwijderen geweigerd met melding als een ander berekend veld het gebruikt; opslaan/uitvoeren sturen `calculatedFields`), `report-builder-output.ts` (label = naam; weergave volgens soort: bedrag €, procent %, getal nl-NL), `saved-report-view.tsx`, locales (7)
- Test: `client/src/pages/reports/__tests__/calculated-fields.test.tsx`

- [ ] **Step 1: Write failing tests**: knoppen Bedrag, ×, 1,21 ⇒ formulebalk toont "Bedrag × 1,21"; opslaan berekend veld "Incl. btw" en als kolom toevoegen ⇒ execute-body bevat `calculatedFields[0].formula` en kolom `{ calc: id }`; `[Bedrag, +]` ⇒ melding "Er mist een veld of getal."; als-dan met tekst "Hoog"/"Normaal" ⇒ `rule` in body; verwijderen van een veld dat door een ander wordt gebruikt ⇒ melding, niet verwijderd; resultaatcel met soort bedrag toont "€ 121,00".
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports` + locale-parity + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): make calculated fields in the report builder`.

### Task 4: Totaalregel

**Files:**
- Modify: `client/src/pages/reports/report-builder.tsx` (per kolom keuze **Totaalregel**: geen / **Som** / **Gemiddelde** / **Aantal**; bij procent alleen **Gemiddelde**; bij tekst alleen **Aantal**; opgeslagen in `configuration.totals` met result-key), resultatendialoog en `saved-report-view.tsx` (`ReportTable` `totals`), `report-builder-output.ts` (`computeTotals(rows, columns, totals)` — lege cellen overgeslagen), CSV (laatste regel "Totaal"), print (tabel-`totals`; bij "Alleen deze pagina"/"Alleen aangevinkte" totaal over die regels met label "Totaal (deze pagina)"), locales (7)
- Test: `client/src/pages/reports/__tests__/report-totals.test.tsx`

- [ ] **Step 1: Write failing tests**: `computeTotals` Som over [10, null, 5] ⇒ 15, Gemiddelde ⇒ 7,5, Aantal ⇒ 2; totaalregel zichtbaar onder de tabel; CSV laatste regel begint met "Totaal"; afdruk "Alle regels" toont het totaal van alle regels; "Alleen deze pagina" toont "Totaal (deze pagina)" met het paginatotaal; procentkolom biedt alleen **Gemiddelde**.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run client/src/pages/reports client/src/components/reports client/src/__tests__/locale-parity.test.tsx` + tsc — Expected: PASS.
- [ ] **Step 5: Commit** `feat(rapporten): totals row under builder reports, on paper and in CSV`.

## Controller rulings

(leeg)
