import http from "http";

const VEHICLE = (plate: string) => [{
  kenteken: plate, merk: "VOLKSWAGEN", handelsbenaming: "CRAFTER", voertuigsoort: "Bedrijfsauto",
  inrichting: "gesloten opbouw", eerste_kleur: "WIT", datum_eerste_toelating: "20220315",
  vervaldatum_apk: "20270315", catalogusprijs: "45000", europese_voertuigcategorie: "N1",
}];
const FUEL = (plate: string) => [{ kenteken: plate, brandstof_omschrijving: "Diesel", co2_uitstoot_gecombineerd: "198" }];

/** Answers the two RDW resources the application reads; unknown plates get []. */
export function startRdwStub(port: number): Promise<{ close(): Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const plate = (url.searchParams.get("kenteken") || "").toUpperCase();
    const known = /^E2E|^[A-Z0-9]{6}$/.test(plate) && !plate.startsWith("ZZ");
    let body: unknown = [];
    if (known && url.pathname.endsWith("/m9d7-ebf2.json")) body = VEHICLE(plate);
    if (known && url.pathname.endsWith("/8ys7-d773.json")) body = FUEL(plate);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve({ close: () => new Promise((done) => server.close(() => done())) }));
  });
}
