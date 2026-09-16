import type { Express, Request, Response } from "express";

/**
 * Answers every /api request that no route claimed with a JSON 404.
 *
 * Without this, such a request fell through to the single-page app's catch-all
 * and came back as `index.html` with status 200. The client then tried to read
 * the page as JSON and showed "Antwoord van de server is geen JSON". Because the
 * status was 200, the network tab looked healthy and the server log was silent;
 * the only place the failing address appeared was the browser console.
 *
 * Mount it after every API route and before the static files or the Vite dev
 * middleware, so it only ever sees requests nothing else wanted.
 */
export function mountApiNotFound(app: Express): void {
  app.use("/api", (req: Request, res: Response) => {
    const target = `${req.method} ${req.originalUrl}`;
    console.warn(`[api] onbekende route: ${target}`);
    res.status(404).json({ message: `Onbekende API-route: ${target}` });
  });
}
