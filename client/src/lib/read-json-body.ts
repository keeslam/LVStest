/**
 * Reads a response body as JSON without falling over an empty one.
 *
 * `await res.json()` throws "Unexpected end of JSON input" when the body has no
 * bytes, and that is exactly what a route does when it answers
 * `res.json(undefined)` — a 200 with nothing in it. That took both calendars
 * down: they read an app setting that had never been stored.
 *
 * An empty body means "no data", so it reads as `null`. A body that is present
 * but not JSON is a real defect and still throws, now naming the URL so the
 * failing endpoint is obvious from the message alone.
 */
export async function readJsonBody<T>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    const where = res.url ? ` (${res.url})` : "";
    const preview = text.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(`Antwoord van de server is geen JSON${where}: ${preview}`);
  }
}
