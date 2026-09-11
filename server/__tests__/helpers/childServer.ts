/**
 * Spawns the real server (`server/index.ts`) as a child process, so the
 * "does the process survive?" assertions of FIX-A can be made without the
 * vitest worker being the thing under test (remediation plan §8.2).
 *
 * The child listens on an ephemeral high port derived from the runner's pid,
 * so parallel runs never collide and never touch the 5000/5001/5002 servers.
 */
import { spawn } from "child_process";
import type { ChildProcessByStdio } from "child_process";
import type { Readable } from "stream";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export interface ChildServer {
  port: number;
  child: ChildProcessByStdio<null, Readable, Readable>;
  stderr: string[];
  stdout: string[];
  /** true while the child has neither exited nor been signalled. */
  alive(): boolean;
  stop(): Promise<void>;
}

export function ephemeralPort(): number {
  // 40000-49999, derived from the pid: stable within a run, unique across runs.
  return 40000 + (process.pid % 10000);
}

export async function startChildServer(options: { port?: number; timeoutMs?: number } = {}): Promise<ChildServer> {
  const port = options.port ?? ephemeralPort();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const child = spawn(process.execPath, [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), "server/index.ts"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      // production skips the Vite dev-server boot, which would otherwise add
      // half a minute to every run and is irrelevant to the API under test.
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET || "child-server-test-secret",
      DEFAULT_ADMIN_PASSWORD: "child-server-test-admin-pw",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const stdout: string[] = [];
  const stderr: string[] = [];
  child.stdout.on("data", (b) => stdout.push(String(b)));
  child.stderr.on("data", (b) => stderr.push(String(b)));

  const server: ChildServer = {
    port,
    child,
    stdout,
    stderr,
    alive: () => child.exitCode === null && child.signalCode === null,
    stop: () =>
      new Promise<void>((resolve) => {
        if (!server.alive()) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already gone */ } resolve(); }, 8_000).unref?.();
      }),
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!server.alive()) {
      throw new Error(`child server exited during boot (code ${child.exitCode}):\n${stderr.join("")}\n${stdout.join("")}`);
    }
    const res = await get(port, "/health").catch(() => null);
    if (res) return server;
    await sleep(400);
  }
  await server.stop();
  throw new Error(`child server did not answer /health within ${timeoutMs}ms:\n${stderr.join("")}\n${stdout.join("")}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RawResponse {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
  json(): any;
}

/** Plain-http request; deliberately not supertest, the server is a real one. */
export function rawRequest(
  port: number,
  method: string,
  requestPath: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path: requestPath, headers: options.headers },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: data,
            headers: res.headers,
            json: () => { try { return JSON.parse(data); } catch { return undefined; } },
          }));
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export function get(port: number, requestPath: string): Promise<RawResponse> {
  return rawRequest(port, "GET", requestPath);
}

/** Collects Set-Cookie name=value pairs into a Cookie header value. */
export function collectCookies(existing: string, res: RawResponse): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split(";").map((p) => p.trim()).filter(Boolean)) {
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const setCookie = res.headers["set-cookie"] ?? [];
  for (const raw of setCookie) {
    const first = String(raw).split(";")[0];
    const i = first.indexOf("=");
    if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}
