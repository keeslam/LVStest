/**
 * Raw-TCP SMTP stub for the mail tests (remediation plan §8.5).
 *
 * `smtpStub.cjs` is `docs/audit/wip/scripts/p16-stub.cjs` verbatim: a plain TCP
 * server with ten switchable failure modes (`ok`, `silent`, `hang-ehlo`,
 * `drop`, `drop-data`, `data-hang`, `auth535`, `rcpt550`, `tls-required`,
 * `starttls-only`) that captures the full DATA body of every message.
 *
 * `withSmtpStub` starts it on an ephemeral port, points the application's
 * stored e-mail configuration at it for the duration, clears the transporter
 * cache on the way in and out, restores the previous settings and stops the
 * stub. Never point a mail test at a real server (§8.5).
 */
import os from "os";
import path from "path";
import { createRequire } from "module";
import { clearEmailConfigCache } from "../../utils/email-service";
import { storage } from "../../storage";

const require_ = createRequire(import.meta.url);
const stubModule = require_("./smtpStub.cjs") as {
  start(opts: { port?: number; mode?: string; logFile?: string }): Promise<SmtpStub>;
};

export interface CapturedMessage {
  mailFrom: string | null;
  rcptTo: string[];
  headerFrom: string | null;
  headerTo: string | null;
  subject: string | null;
  raw: string;
}

export interface SmtpStub {
  port: number;
  state: { mode: string; connections: number; messages: CapturedMessage[] };
  setMode(mode: string): void;
  dropAll(): void;
  stop(): Promise<void>;
}

/** The key the application reads its default SMTP configuration from. */
const EMAIL_SETTING_KEY = "email_config";

/**
 * An OS-assigned free port, found and released before the stub claims it. The
 * stub itself treats port 0 as "use the default 2525", so the wrapper has to
 * hand it a real number — and two test files must never collide on one.
 */
async function freePort(): Promise<number> {
  const net = await import("net");
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export interface StubOptions {
  /** Extra fields merged into the stored configuration (smtpSecure, …). */
  config?: Record<string, unknown>;
  /** Port to claim; 0 lets the OS pick, which is the default. */
  port?: number;
}

export async function withSmtpStub<T>(
  mode: string,
  fn: (stub: SmtpStub) => Promise<T>,
  options: StubOptions = {},
): Promise<T> {
  const stub = await stubModule.start({
    port: options.port ?? (await freePort()),
    mode,
    logFile: path.join(os.tmpdir(), `lvs-smtp-stub-${process.pid}.jsonl`),
  });

  const previous = await storage.getAppSettingByKey(EMAIL_SETTING_KEY);
  const value = JSON.stringify({
    fromEmail: "noreply@fixture-test.invalid",
    fromName: "FIXT Lam Groep",
    smtpHost: "127.0.0.1",
    smtpPort: String(stub.port),
    smtpUser: "fixture",
    smtpPassword: "fixture",
    smtpSecure: false,
    ...options.config,
  });

  try {
    if (previous) {
      await storage.updateAppSetting(previous.id, { value: value as any, category: "email" });
    } else {
      await storage.createAppSetting({
        key: EMAIL_SETTING_KEY,
        value,
        category: "email",
        description: "FIXT test SMTP configuration",
      } as any);
    }
    clearEmailConfigCache();
    return await fn(stub);
  } finally {
    clearEmailConfigCache();
    const current = await storage.getAppSettingByKey(EMAIL_SETTING_KEY);
    if (previous && current) {
      await storage.updateAppSetting(current.id, { value: previous.value as any, category: previous.category });
    } else if (!previous && current) {
      await storage.deleteAppSetting?.(current.id);
    }
    clearEmailConfigCache();
    await stub.stop();
  }
}

/**
 * The decoded body of a captured message. The stub reads the socket as latin1,
 * so the bytes are intact; this turns them back into text, honouring the
 * transfer encoding the mail declares (base64 since BUG-196).
 */
export function decodeBody(raw: string): string {
  const bytes = Buffer.from(raw, "latin1").toString("utf8");
  const parts = bytes.split(/\r\n\r\n/);
  const decoded: string[] = [bytes];
  for (let i = 0; i < parts.length - 1; i += 1) {
    const headers = parts[i];
    const body = parts[i + 1];
    if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
      const b64 = body.split(/\r\n--/)[0].replace(/[^A-Za-z0-9+/=]/g, "");
      if (b64.length > 0) decoded.push(Buffer.from(b64, "base64").toString("utf8"));
    } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) {
      const qp = body.split(/\r\n--/)[0];
      decoded.push(
        qp.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16))),
      );
    }
  }
  return decoded.join("\n");
}
