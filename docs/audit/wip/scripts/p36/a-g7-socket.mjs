// BUG-005 re-check against the phase-36 regression server (port 5003).
import { io } from "socket.io-client";
const base = "http://127.0.0.1:5003";
const events = [];
const socket = io(base, { transports: ["polling", "websocket"], withCredentials: false });
socket.onAny((name, ...args) => events.push({ name, sample: JSON.stringify(args).slice(0, 300) }));

let connected = false, connErr = null;
try {
  await new Promise((res, rej) => {
    socket.on("connect", res);
    socket.on("connect_error", (e) => rej(new Error("connect_error: " + e.message)));
    setTimeout(() => rej(new Error("timeout")), 8000);
  });
  connected = true;
} catch (e) { connErr = e.message; }
console.log("[005] connected without cookie:", connected, connErr ? "(" + connErr + ")" : "");

// trigger a broadcast with a logged-in admin
const jar = new Map();
const absorb = (r) => r.headers.getSetCookie().forEach((c) => { const [k, v] = c.split(";")[0].split("="); jar.set(k, v); });
const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "p36a_adm5", password: "admin123" }) });
absorb(login);
const me = await fetch(base + "/api/user", { headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
absorb(me);
const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const xsrf = decodeURIComponent(jar.get("XSRF-TOKEN") ?? "");
const plate = "P36A-SOCK-" + Date.now().toString().slice(-4);
const create = await fetch(base + "/api/vehicles", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": xsrf }, body: JSON.stringify({ licensePlate: plate, brand: "AUDIT-P36A", model: "Socket" }) });
console.log("[005] vehicle create status", create.status);
await new Promise((r) => setTimeout(r, 1800));
console.log("[005] events received by the anonymous socket:", events.length);
for (const e of events) console.log("  -", e.name, e.sample);
socket.close();

// authenticated socket for comparison
const s2 = io(base, { transports: ["polling", "websocket"], extraHeaders: { Cookie: cookie } });
const ev2 = [];
s2.onAny((n, ...a) => ev2.push({ n, s: JSON.stringify(a).slice(0, 300) }));
let ok2 = false;
try { await new Promise((res, rej) => { s2.on("connect", res); s2.on("connect_error", (e) => rej(new Error(e.message))); setTimeout(() => rej(new Error("timeout")), 8000); }); ok2 = true; } catch (e) { console.log("[005] authed connect_error:", e.message); }
console.log("[005] authenticated socket connected:", ok2);
const plate2 = "P36A-SOCK2-" + Date.now().toString().slice(-4);
await fetch(base + "/api/vehicles", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": decodeURIComponent(jar.get("XSRF-TOKEN") ?? "") }, body: JSON.stringify({ licensePlate: plate2, brand: "AUDIT-P36A", model: "Socket2" }) });
await new Promise((r) => setTimeout(r, 1800));
console.log("[005] events received by the AUTHENTICATED socket:", ev2.length);
for (const e of ev2) console.log("  -", e.n, e.s);
s2.close();
process.exit(0);
