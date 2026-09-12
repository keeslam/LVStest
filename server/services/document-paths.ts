import path from "path";
import fs from "fs";
import {
  getUploadsDir,
  getUploadsRoot,
  isInsideUploads,
  assertWithinUploads,
} from "../../shared/paths";

/**
 * The portable form of an absolute path for storage in a *_path column.
 *
 * BUG-029/FIX-B: this used to be `path.relative(process.cwd(), absolutePath)`,
 * which is only the same thing as "relative to uploads" while UPLOADS_DIR
 * happens to be `cwd/uploads`. With UPLOADS_DIR set — the production shape —
 * it produced values like `..\audit-uploads\reports\x.pdf`: correct on the
 * machine that wrote them, meaningless anywhere else, and not resolvable by
 * the half of the code that joined them onto the uploads directory instead.
 *
 * New rows are stored relative to the uploads root with forward slashes.
 * Anything outside the uploads root still falls back to the old cwd-relative
 * form rather than throwing — `attached_assets/` header images are a
 * legitimate non-uploads path — and `resolveDocumentFilePath()` below still
 * resolves both shapes, so existing rows keep working untouched.
 */
export function getRelativePath(absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  if (isInsideUploads(resolved)) {
    return path.relative(getUploadsRoot(), resolved).split(path.sep).join("/");
  }
  return path.relative(process.cwd(), resolved);
}

/**
 * Resolves a document.filePath (which may be stored as absolute, cwd-relative,
 * or uploads-dir-relative depending on which code path created it) to an
 * absolute path that exists on disk. Returns null if no resolution exists.
 * Refuses to resolve any path that escapes the uploads directory.
 *
 * BUG-098: containment is checked on the *realised* path. Without
 * `fs.realpathSync()` a symlink sitting inside uploads/ and pointing outside
 * it — which a hostile files-restore archive could plant — passed the
 * lexical `startsWith` check and turned every scoped download route into an
 * arbitrary file read.
 */
export function resolveDocumentFilePath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const uploadsDir = getUploadsDir();
  const candidates: string[] = [];
  if (path.isAbsolute(filePath)) {
    candidates.push(filePath);
  } else {
    // Uploads-relative first: that is what getRelativePath() writes today.
    candidates.push(path.join(uploadsDir, filePath));
    // Legacy cwd-relative rows (including the `..\<uploads>\…` shape the old
    // getRelativePath produced under a non-default UPLOADS_DIR).
    candidates.push(path.join(process.cwd(), filePath));
    // Some paths are stored with a leading "uploads/" — try stripping it too.
    if (filePath.startsWith("uploads/") || filePath.startsWith("uploads\\")) {
      candidates.push(path.join(uploadsDir, filePath.slice("uploads/".length)));
    }
  }
  for (const c of candidates) {
    try {
      const resolved = path.resolve(c);
      // Stay within uploads dir to avoid any traversal mishaps.
      if (!isInsideUploads(resolved)) continue;
      if (!fs.existsSync(resolved)) continue;
      // Follow symlinks and re-check: a link inside uploads/ that points out
      // of it must not be served (BUG-098).
      let realised: string;
      try {
        realised = fs.realpathSync(resolved);
      } catch {
        continue;
      }
      if (!isInsideUploads(realised)) {
        console.error(
          `[paths] refusing ${filePath}: it resolves through a symlink to ${realised}, outside ${getUploadsRoot()}`
        );
        continue;
      }
      return realised;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * The delete/overwrite counterpart of `resolveDocumentFilePath()`: resolves a
 * stored path column for a filesystem operation whose target need not exist,
 * and returns null rather than a path outside the uploads root.
 *
 * BUG-070: the four template modules built `path.join(process.cwd(), <a
 * string straight out of the request body>)` and handed the result to
 * `fs.unlink` — an arbitrary file delete from a template-management
 * permission. Both halves are fixed: the path columns are no longer writable
 * from a request body (FIX-C), and every unlink now resolves through here.
 */
export function resolveStoredPathForWrite(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const candidates = path.isAbsolute(filePath)
    ? [filePath]
    : [path.join(getUploadsDir(), filePath), path.join(process.cwd(), filePath)];
  for (const c of candidates) {
    try {
      const resolved = assertWithinUploads(c, "stored file path");
      if (fs.existsSync(resolved)) {
        const realised = fs.realpathSync(resolved);
        if (!isInsideUploads(realised)) continue;
        return realised;
      }
      // Does not exist (yet): still a legal target, as long as it is contained.
      return resolved;
    } catch {
      continue;
    }
  }
  console.error(`[paths] refusing filesystem operation on a path outside the uploads directory: ${filePath}`);
  return null;
}

/**
 * `fs.unlink` that can only ever delete inside the uploads directory.
 * Returns true when a file was actually removed.
 */
export async function unlinkStoredFile(filePath: string | null | undefined): Promise<boolean> {
  const resolved = resolveStoredPathForWrite(filePath);
  if (!resolved) return false;
  try {
    await fs.promises.unlink(resolved);
    return true;
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.error(`[paths] could not delete ${resolved}:`, error?.message ?? error);
    }
    return false;
  }
}
