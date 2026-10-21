/**
 * Kees 2026-10-21: template backgrounds and their previews are stored relative to the
 * uploads root ("templates/x.png"; older rows may carry "uploads/" or a leading slash),
 * and the server serves that root under /uploads. The editors built "/templates/x.png",
 * which the app answered with its own page, so every preview showed as a broken image.
 */
export function uploadUrl(storedPath: string): string {
  const clean = storedPath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^uploads\//, "");
  return `/uploads/${clean}`;
}
