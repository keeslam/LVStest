/**
 * Builds the Dutch user manual as one printable PDF.
 *
 *   node scripts/build-manual-pdf.cjs
 *
 * Reads docs/gebruikershandleiding/README.md and the eighteen chapters in the
 * order the README lists them, renders the Markdown to HTML with `marked`,
 * embeds the screenshots so the PDF stands on its own, and prints the result
 * with the Chrome installed on this machine (headless, --print-to-pdf).
 *
 * `marked` is not a project dependency: point MARKED_PATH at a folder where it
 * is installed (`npm install marked@12`), or install it next to this script.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'docs', 'gebruikershandleiding');
const OUT = path.join(DIR, 'Gebruikershandleiding-Car-Rental-Manager-v1.0.pdf');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const { marked } = require(process.env.MARKED_PATH ? path.join(process.env.MARKED_PATH, 'marked') : 'marked');

/** Chapters in the order the README's table of contents gives them. */
function chapterFiles() {
  const readme = fs.readFileSync(path.join(DIR, 'README.md'), 'utf8');
  const files = [...readme.matchAll(/\]\((\d{2}-[a-z0-9-]+\.md)\)/g)].map((m) => m[1]);
  const unique = [...new Set(files)];
  for (const f of unique) {
    if (!fs.existsSync(path.join(DIR, f))) throw new Error(`README verwijst naar ontbrekend hoofdstuk: ${f}`);
  }
  return unique;
}

/** Screenshots become data URIs so the PDF needs nothing next to it. */
function embedImages(html) {
  return html.replace(/<img([^>]*?)src="(afbeeldingen\/[^"]+)"([^>]*)>/g, (all, pre, src, post) => {
    const file = path.join(DIR, src);
    if (!fs.existsSync(file)) return all;
    const data = fs.readFileSync(file).toString('base64');
    return `<img${pre}src="data:image/png;base64,${data}"${post}>`;
  });
}

/** Links between chapters point at the chapter's anchor inside the one document. */
function rewriteChapterLinks(html) {
  return html.replace(/href="(\d{2}-[a-z0-9-]+)\.md(#[^"]*)?"/g, (_m, name) => `href="#${name}"`);
}

const CSS = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1f2933; }
  h1 { font-size: 20pt; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 4pt; margin-top: 0; }
  h2 { font-size: 14pt; color: #1e3a8a; margin-top: 18pt; break-after: avoid; }
  h3 { font-size: 11.5pt; color: #1e293b; margin-top: 12pt; break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  th { background: #eef2ff; }
  code { font-family: Consolas, monospace; font-size: 9pt; background: #f1f5f9; padding: 0 2pt; border-radius: 2pt; }
  pre { background: #f1f5f9; padding: 8pt; border-radius: 4pt; white-space: pre-wrap; font-size: 9pt; }
  blockquote { border-left: 3px solid #93c5fd; background: #f8fafc; margin: 8pt 0; padding: 4pt 10pt; color: #334155; }
  img { max-width: 100%; border: 1px solid #cbd5e1; border-radius: 4pt; margin: 6pt 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 12pt 0; }
  a { color: #1d4ed8; text-decoration: none; }
  .chapter { break-before: page; }
  .cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; }
  .cover h1 { font-size: 30pt; border: none; margin-bottom: 4pt; }
  .cover .sub { font-size: 16pt; color: #1e3a8a; margin: 0 0 30pt; }
  .cover .meta { font-size: 11pt; color: #475569; }
`;

function main() {
  const files = chapterFiles();
  const parts = [];

  parts.push(`
    <section class="cover">
      <h1>Car Rental Manager</h1>
      <p class="sub">Gebruikershandleiding<br>Voor nieuwe medewerkers</p>
      <p class="meta">Auto Lease LAM<br>Versie 1.0<br>13 september 2026</p>
    </section>`);

  // The README body without its own title and version block, which the cover replaces.
  const readme = fs
    .readFileSync(path.join(DIR, 'README.md'), 'utf8')
    .replace(/^# .*\r?\n/, '')
    .replace(/```[\s\S]*?```/, '');
  parts.push(`<section class="chapter" id="inleiding">${marked.parse(readme)}</section>`);

  for (const file of files) {
    const md = fs.readFileSync(path.join(DIR, file), 'utf8');
    const id = file.replace(/\.md$/, '');
    parts.push(`<section class="chapter" id="${id}">${marked.parse(md)}</section>`);
  }

  let html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
    <title>Gebruikershandleiding Car Rental Manager</title><style>${CSS}</style></head>
    <body>${parts.join('\n')}</body></html>`;
  html = rewriteChapterLinks(embedImages(html));

  const tmpHtml = path.join(os.tmpdir(), `handleiding-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, html, 'utf8');

  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${OUT}`,
    `file:///${tmpHtml.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore', timeout: 180000 });

  fs.unlinkSync(tmpHtml);
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`${files.length} hoofdstukken → ${path.relative(ROOT, OUT)} (${kb} kB)`);
}

main();
