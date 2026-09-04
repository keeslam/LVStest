import { Writable } from "stream";
import path from "path/posix";
import { Client, type FileInfo } from "basic-ftp";
import type { CjibConfig } from "../../../shared/fines";

export interface RemoteFile { name: string; size: number; modifiedAt: string | null }

/** What the poller needs from the FTPS server; swapped for a fake in tests. */
export interface CjibFtpsClient {
  listInbox(config: CjibConfig): Promise<RemoteFile[]>;
  download(config: CjibConfig, name: string): Promise<Buffer>;
  moveToProcessed(config: CjibConfig, name: string): Promise<void>;
}

async function withClient<T>(config: CjibConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  if (!config.host) throw new Error("CJIB FTPS host is not configured");
  const client = new Client(30_000);
  try {
    await client.access({
      host: config.host, port: config.port, user: config.username, password: config.password,
      secure: config.secure === "implicit" ? "implicit" : true,
      secureOptions: { rejectUnauthorized: true },
    });
    return await fn(client);
  } finally {
    client.close();
  }
}

const toRemote = (f: FileInfo): RemoteFile => ({ name: f.name, size: f.size, modifiedAt: f.modifiedAt ? f.modifiedAt.toISOString() : null });

export const ftpsClient: CjibFtpsClient = {
  async listInbox(config) {
    return withClient(config, async (client) => {
      const entries = await client.list(config.inboxDir || "/");
      return entries.filter((e) => e.isFile).map(toRemote);
    });
  },
  async download(config, name) {
    return withClient(config, async (client) => {
      const chunks: Buffer[] = [];
      const sink = new Writable({ write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); } });
      await client.downloadTo(sink, path.join(config.inboxDir || "/", name));
      return Buffer.concat(chunks);
    });
  },
  async moveToProcessed(config, name) {
    if (!config.processedDir) return;
    return withClient(config, async (client) => {
      await client.ensureDir(config.processedDir);
      await client.rename(path.join(config.inboxDir || "/", name), path.join(config.processedDir, name));
    });
  },
};
