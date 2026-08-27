#!/usr/bin/env node
/**
 * Prints candidate hardcoded UI strings + line numbers for one file, to speed
 * up manual i18n conversion. Read-only: never edits files. Deliberately dumb
 * regex matching over JSX/TSX; every hit still needs a human to decide
 * whether it is real UI copy or something that must stay literal (a
 * data-testid, a CSS class, a brand name, backend-error interpolation, etc).
 *
 * Usage: node scripts/find-hardcoded-strings.cjs <file.tsx> [file2.tsx ...]
 */
const fs = require('fs');

const SKIP_ATTR_NAMES = new Set([
  'data-testid', 'className', 'href', 'src', 'id', 'key', 'name', 'type',
  'variant', 'size', 'value', 'htmlFor', 'rel', 'target', 'method',
]);

const SKIP_LINE_PATTERNS = [
  /^import\s/, /^export\s/, /from ['"]/, /^\s*\/\//, /^\s*\*/,
  /console\.(log|error|warn)/, /data-testid=/,
];

const LOOKS_LIKE_CODE = (s) =>
  /^[a-z][a-zA-Z0-9]*$/.test(s) ||              // bare identifier
  /^[A-Z_]+$/.test(s) ||                        // CONST_NAME
  /^[0-9.,\-+% ]*$/.test(s) ||                  // numbers/punctuation only
  /^(px|rem|em|ms|s|km|kg|%)$/.test(s) ||        // units
  /^https?:\/\//.test(s) ||                     // URL
  /^\/api\//.test(s) ||                         // API path
  /^\{.*\}$/.test(s);                           // pure JS expression

function scanFile(path) {
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  const hits = [];

  lines.forEach((line, idx) => {
    if (SKIP_LINE_PATTERNS.some((p) => p.test(line))) return;

    // JSX text content: >Some Text<
    const jsxTextRe = />([^<>{}\n]{2,120})</g;
    let m;
    while ((m = jsxTextRe.exec(line))) {
      const text = m[1].trim();
      if (text && /[A-Za-z]{2,}/.test(text) && !LOOKS_LIKE_CODE(text)) {
        hits.push({ line: idx + 1, kind: 'jsx-text', text });
      }
    }

    // Common attributes that hold user-facing copy
    const attrRe = /\b(placeholder|title|alt|aria-label)=["']([^"']{2,120})["']/g;
    while ((m = attrRe.exec(line))) {
      hits.push({ line: idx + 1, kind: `attr:${m[1]}`, text: m[2] });
    }

    // toast({ title: "...", description: "..." }) style object literals
    const toastRe = /\b(title|description|message)\s*:\s*["']([^"']{2,160})["']/g;
    while ((m = toastRe.exec(line))) {
      const text = m[2];
      if (!LOOKS_LIKE_CODE(text)) {
        hits.push({ line: idx + 1, kind: `prop:${m[1]}`, text });
      }
    }
  });

  return hits;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/find-hardcoded-strings.cjs <file.tsx> [...]');
  process.exit(1);
}

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`Skipping missing file: ${file}`);
    continue;
  }
  if (file.includes('useTranslation') || fs.readFileSync(file, 'utf8').includes('useTranslation(')) {
    // Already converted, at least partially — still show remaining hits so a
    // second pass can catch stragglers, just note it.
    console.log(`\n=== ${file} (already has useTranslation — checking for stragglers) ===`);
  } else {
    console.log(`\n=== ${file} ===`);
  }
  const hits = scanFile(file);
  if (hits.length === 0) {
    console.log('  (no candidates found)');
    continue;
  }
  for (const h of hits) {
    console.log(`  L${h.line} [${h.kind}] ${JSON.stringify(h.text)}`);
  }
}
