// Evidence check: can an unauthenticated client receive Socket.IO broadcasts?
// Connects without any cookie to the audit server, then triggers a mutation via a
// logged-in admin session (creates an AUDIT- vehicle) and reports what the socket saw.
import { io } from "socket.io-client";

const base = "http://localhost:5001";
const events = [];
const socket = io(base, { transports: ["polling", "websocket"], withCredentials: false });
socket.onAny((name, ...args) => events.push({ name, sample: JSON.stringify(args).slice(0, 300) }));

await new Promise((res, rej) => { socket.on("connect", res); socket.on("connect_error", rej); setTimeout(() => rej(new Error("timeout")), 8000); });
console.log("connected without cookie:", socket.connected, "id", socket.id);

// admin session to trigger a broadcast
const login = await fetch(base + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "admin123" }) });
const jar = new Map();
const absorb = (r) => r.headers.getSetCookie().forEach((c) => { const [k, v] = c.split(";")[0].split("="); jar.set(k, v); });
absorb(login);
const me = await fetch(base + "/api/user", { headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } });
absorb(me);
const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const xsrf = decodeURIComponent(jar.get("XSRF-TOKEN") ?? "");
console.log("cookies:", [...jar.keys()].join(","), "xsrf len", xsrf.length);
const plate = "AU-SOCK-" + Date.now().toString().slice(-4);
const create = await fetch(base + "/api/vehicles", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF-Token": xsrf }, body: JSON.stringify({ licensePlate: plate, brand: "AUDIT", model: "Socket" }) });
console.log("vehicle create status", create.status, (await create.text()).slice(0,200));
await new Promise((r) => setTimeout(r, 1500));
console.log("events received by the anonymous socket:", events.length);
for (const e of events) console.log(" -", e.name, e.sample);
socket.close();
