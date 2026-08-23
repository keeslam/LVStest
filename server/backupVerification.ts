// server/backupVerification.ts
//
// A backup that has not been read back is not a backup. These checks run
// immediately after a backup is written; anything that fails here is recorded
// as a failed run rather than a success, which is what the 10-byte database
// backups in the deployment should have done.
import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
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

/**
 * A tar archive with zero entries is not zero bytes: archiver('tar', { gzip:
 * true }) still writes the two 512-byte all-zero end-of-archive blocks, i.e.
 * exactly 1024 decompressed bytes. A byte-count-only floor of 0 therefore
 * accepts an empty archive, which is exactly the "10-byte backup" failure
 * this module exists to catch, reproduced on the files side.
 */
const EMPTY_TAR_BYTES = 1024;

/** Recursively count regular files under dir (directories themselves don't count). */
function countFilesRecursive(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let entryStat;
    try {
      entryStat = statSync(full);
    } catch {
      continue; // dangling symlink or removed mid-walk — not our problem to solve here
    }
    if (entryStat.isDirectory()) {
      count += countFilesRecursive(full);
    } else if (entryStat.isFile()) {
      count += 1;
    }
  }
  return count;
}

export async function verifyFilesBackup(filePath: string, expectedChecksum: string, sourceDir: string, fileCount: number): Promise<VerificationResult> {
  if (!existsSync(filePath)) return { ok: false, reason: `backup file missing: ${filePath}` };

  let stats: { bytes: number; tail: string };
  try {
    stats = await gunzipStats(filePath);
  } catch (error) {
    return { ok: false, reason: `gzip is corrupt or truncated: ${error instanceof Error ? error.message : String(error)}` };
  }

  // Primary check: the manifest's own count of what should be in the
  // archive. This also catches the case where addDirectoryToArchive's
  // directory walk silently failed (EACCES, unmounted volume, etc.) and
  // swallowed the error, producing a zero-entry archive with no thrown
  // error — the source-directory probe below can't see that.
  if (fileCount > 0 && stats.bytes <= EMPTY_TAR_BYTES) {
    return { ok: false, bytes: stats.bytes, reason: `archive contains no entries while ${fileCount} files were expected` };
  }

  // Secondary check: an independent read of the source directory, in case
  // the manifest's fileCount itself is wrong or stale.
  const sourceFileCount = countFilesRecursive(sourceDir);
  if (sourceFileCount > 0 && stats.bytes <= EMPTY_TAR_BYTES) {
    return { ok: false, bytes: stats.bytes, reason: `archive is empty (tar end-of-archive marker only) while ${sourceDir} contains ${sourceFileCount} files` };
  }

  const actual = await checksumOf(filePath);
  if (actual !== expectedChecksum) {
    return { ok: false, bytes: stats.bytes, reason: `checksum mismatch: recorded ${expectedChecksum}, file is ${actual}` };
  }
  return { ok: true, bytes: stats.bytes };
}
