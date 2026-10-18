/**
 * A browser and operating system name from a User-Agent header, for "logged-in devices" in the portal
 * (Kees, 2026-10-18). Only the common families; anything else is null and shown as "unknown". The
 * order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
 */
export function describeUserAgent(ua: string | null | undefined): { browser: string | null; os: string | null } {
  const s = ua ?? "";
  const browser = /Edg(e|A|iOS)?\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Opera"
    : /SamsungBrowser\//.test(s) ? "Samsung Internet"
    : /Firefox\/|FxiOS\//.test(s) ? "Firefox"
    : /Chrome\/|CriOS\//.test(s) ? "Chrome"
    : /Safari\//.test(s) && /Version\//.test(s) ? "Safari"
    : null;
  const os = /iPhone|iPad|iPod/.test(s) ? "iOS"
    : /Android/.test(s) ? "Android"
    : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "macOS"
    : /CrOS/.test(s) ? "ChromeOS"
    : /Linux/.test(s) ? "Linux"
    : null;
  return { browser, os };
}
