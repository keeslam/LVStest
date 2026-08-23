// server/backupVerification.ts
//
// A backup that has not been read back is not a backup. These checks run
// immediately after a backup is written; anything that fails here is recorded
// as a failed run rather than a success, which is what the 10-byte database
// backups in the deployment should have done.
import { createReadStream, existsSync, readdirSync } from 'fs';
import { createGunzip } from 'zlib';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';

export interface VerificationResult {
  ok: boolean;
  reason?: string;
  bytes?: number;
}

/** sha256 of a file on disk. */
async function checksumOf(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

/** Decompress fully, returning the byte count and a tail sample. */
async function gunzipStats(filePath: string, tailBytes = 4096): Promise<{ bytes: number; tail: string }> {
  let bytes = 0;
  let tail = Buffer.alloc(0);
  const gunzip = createGunzip();
  const source = createReadStream(filePath);
  source.pipe(gunzip);
  await new Promise<void>((resolve, reject) => {
    gunzip.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      tail = Buffer.concat([tail, chunk]).subarray(-tailBytes);
    });
    gunzip.on('end', resolve);
    gunzip.on('error', reject);
    source.on('error', reject);
  });
  return { bytes, tail: tail.toString('utf8') };
}

const MIN_DUMP_BYTES = 1024;

export async function verifyDatabaseBackup(filePath: string, expectedChecksum: string): Promise<VerificationResult> {
  if (!existsSync(filePath)) return { ok: false, reason: `backup file missing: ${filePath}` };

  let stats: { bytes: number; tail: string };
  try {
    stats = await gunzipStats(filePath);
  } catch (error) {
    return { ok: false, reason: `gzip is corrupt or truncated: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (stats.bytes < MIN_DUMP_BYTES) {
    return { ok: false, bytes: stats.bytes, reason: `dump is only ${stats.bytes} bytes decompressed — expected at least ${MIN_DUMP_BYTES}` };
  }
  if (!stats.tail.includes('PostgreSQL database dump complete')) {
    return { ok: false, bytes: stats.bytes, reason: 'dump does not end with pg_dump completion marker — it was truncated' };
  }

  const actual = await checksumOf(filePath);
  if (actual !== expectedChecksum) {
    return { ok: false, bytes: stats.bytes, reason: `checksum mismatch: recorded ${expectedChecksum}, file is ${actual}` };
  }
  return { ok: true, bytes: stats.bytes };
}

export async function verifyFilesBackup(filePath: string, expectedChecksum: string, sourceDir: string): Promise<VerificationResult> {
  if (!existsSync(filePath)) return { ok: false, reason: `backup file missing: ${filePath}` };

  let stats: { bytes: number; tail: string };
  try {
    stats = await gunzipStats(filePath);
  } catch (error) {
    return { ok: false, reason: `gzip is corrupt or truncated: ${error instanceof Error ? error.message : String(error)}` };
  }

  const sourceHasFiles = existsSync(sourceDir) && readdirSync(sourceDir).length > 0;
  if (sourceHasFiles && stats.bytes === 0) {
    return { ok: false, bytes: 0, reason: `archive is empty while ${sourceDir} contains files` };
  }

  const actual = await checksumOf(filePath);
  if (actual !== expectedChecksum) {
    return { ok: false, bytes: stats.bytes, reason: `checksum mismatch: recorded ${expectedChecksum}, file is ${actual}` };
  }
  return { ok: true, bytes: stats.bytes };
}
