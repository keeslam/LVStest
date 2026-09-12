/**
 * Text handling shared by every PDF generator.
 *
 * FIX-N (BUG-162): pdf-lib's standard fonts encode WinAnsi (cp1252) only, and
 * `drawText` throws on the first character outside it. Both contract renderers
 * wrapped each field in its own try/catch, so a customer called "Şahin",
 * "Jérôme 🎉" or an address containing "→" did not lose that character — it
 * lost **the entire field**. Contracts printed with no tenant name at all, and
 * nothing in the response said so.
 *
 * Every value now goes through `sanitizeForWinAnsi()` before it reaches
 * pdf-lib: accents that exist in WinAnsi are preserved exactly (ø, Å, ë, é),
 * accents that do not are transliterated to their base letter (ş → s, ğ → g,
 * ı → i, ő → o), typography is mapped to ASCII (→ becomes ->), and anything
 * left — emoji, CJK — is dropped with a single warning rather than taking the
 * field with it.
 *
 * FIX-N (BUG-178): no generator wrapped or clipped, so a 500-character address
 * ran off the right edge of the page and was lost in print. `wrapTextToWidth()`
 * breaks a value into lines that fit the field's box; the caller decides how
 * many lines it has room for.
 */

/** WinAnsi (cp1252) is Latin-1 plus a handful of glyphs in 0x80–0x9F. */
const WINANSI_EXTRA = new Set([
  "€", "‚", "ƒ", "„", "…", "†", "‡",
  "ˆ", "‰", "Š", "‹", "Œ", "Ž", "‘",
  "’", "“", "”", "•", "–", "—", "˜",
  "™", "š", "›", "œ", "ž", "Ÿ",
]);

function isWinAnsi(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0x09 || code === 0x0a || code === 0x0d) return true;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WINANSI_EXTRA.has(char);
}

/** Symbols with an obvious ASCII spelling. */
const SYMBOL_MAP: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  " ": " ", // figure space
  " ": " ", // thin space
  " ": " ", // narrow no-break space
  "​": "", // zero-width space
  "‌": "",
  "‍": "",
  "﻿": "",
};

/** Letters whose NFD decomposition does not reach a WinAnsi character. */
const LETTER_MAP: Record<string, string> = {
  "ı": "i", // ı
  "İ": "I", // İ
  "Ł": "L", // Ł
  "ł": "l", // ł
  "Đ": "D", // Đ
  "đ": "d", // đ
  "Ð": "D",
  "Ħ": "H",
  "ħ": "h",
  "Ŧ": "T",
  "ŧ": "t",
  "ß": "ss",
  "Ĳ": "IJ",
  "ĳ": "ij",
  "ŉ": "'n",
};

let warnedOnce = false;

/**
 * Returns a string pdf-lib's standard fonts can encode, preserving as much of
 * the original as WinAnsi allows. Never throws, never returns undefined.
 */
export function sanitizeForWinAnsi(value: unknown, context = "field"): string {
  if (value === null || value === undefined) return "";
  const input = typeof value === "string" ? value : String(value);
  if (input === "") return "";

  let out = "";
  let dropped = 0;

  for (const char of input) {
    if (isWinAnsi(char)) {
      // Control characters other than tab/newline/return are not printable.
      const code = char.codePointAt(0) ?? 0;
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
      out += char;
      continue;
    }
    const symbol = SYMBOL_MAP[char];
    if (symbol !== undefined) {
      out += symbol;
      continue;
    }
    const letter = LETTER_MAP[char];
    if (letter !== undefined) {
      out += letter;
      continue;
    }
    // Strip the combining marks and see whether the base letter is encodable:
    // this is what keeps "Şahin" readable as "Sahin" instead of vanishing.
    const decomposed = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
    let mapped = "";
    for (const piece of decomposed) {
      if (isWinAnsi(piece)) mapped += piece;
      else if (LETTER_MAP[piece] !== undefined) mapped += LETTER_MAP[piece];
    }
    if (mapped !== "") {
      out += mapped;
      continue;
    }
    dropped += 1;
  }

  if (dropped > 0) {
    // One line, not one per character — a name with an emoji should not be
    // able to flood the log.
    console.warn(
      `[pdf] ${dropped} character(s) in ${context} cannot be printed with the standard PDF fonts and were left out.`,
    );
    warnedOnce = true;
  }
  return out;
}

/** Test seam: whether a sanitize call has reported dropped characters. */
export function didWarnAboutUnprintableCharacters(): boolean {
  return warnedOnce;
}

export interface FontLike {
  widthOfTextAtSize(text: string, size: number): number;
}

/**
 * Breaks `text` into lines no wider than `maxWidth` points at `size`.
 * Words longer than the box (a 60-character chassis number, a URL) are split
 * mid-word rather than allowed to run off the page. When the result needs more
 * than `maxLines`, the last line is ellipsised — the value is never silently
 * printed outside its box (BUG-178).
 */
export function wrapTextToWidth(
  text: string,
  font: FontLike,
  size: number,
  maxWidth: number,
  maxLines = 1,
): string[] {
  const safeWidth = Number.isFinite(maxWidth) && maxWidth > 0 ? maxWidth : 0;
  const normalised = text.replace(/\r\n?/g, "\n");
  if (safeWidth === 0) return [normalised];

  const widthOf = (s: string) => {
    try {
      return font.widthOfTextAtSize(s, size);
    } catch {
      return s.length * size * 0.5;
    }
  };

  const lines: string[] = [];
  for (const paragraph of normalised.split("\n")) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/).filter((w) => w !== "")) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (widthOf(candidate) <= safeWidth) {
        current = candidate;
        continue;
      }
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      // The word itself may be wider than the box: hard-split it.
      let chunk = "";
      for (const char of word) {
        if (widthOf(chunk + char) > safeWidth && chunk !== "") {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk += char;
        }
      }
      current = chunk;
    }
    lines.push(current);
  }

  if (maxLines > 0 && lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1] ?? "";
    while (last.length > 1 && widthOf(`${last}...`) > safeWidth) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines;
}
