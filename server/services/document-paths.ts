import path from "path";
import fs from "fs";
import { getUploadsDir } from "../../shared/paths";

// Helper function to convert absolute paths to relative paths - works for any deployment
export function getRelativePath(absolutePath: string): string {
  const uploadsDir = getUploadsDir();
  // Make path relative to uploads directory for portability
  return path.relative(process.cwd(), absolutePath);
}


/**
 * Resolves a document.filePath (which may be stored as absolute, cwd-relative,
 * or uploads-dir-relative depending on which code path created it) to an
 * absolute path that exists on disk. Returns null if no resolution exists.
 * Refuses to resolve any path that escapes the uploads directory.
 */
export function resolveDocumentFilePath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const uploadsDir = getUploadsDir();
  const candidates: string[] = [];
  if (path.isAbsolute(filePath)) {
    candidates.push(filePath);
  } else {
    candidates.push(path.join(process.cwd(), filePath));
    candidates.push(path.join(uploadsDir, filePath));
    // Some paths are stored with a leading "uploads/" — try stripping it too.
    if (filePath.startsWith("uploads/") || filePath.startsWith("uploads\\")) {
      candidates.push(path.join(uploadsDir, filePath.slice("uploads/".length)));
    }
  }
  const uploadsResolved = path.resolve(uploadsDir);
  for (const c of candidates) {
    try {
      const resolved = path.resolve(c);
      // Stay within uploads dir to avoid any traversal mishaps.
      if (!resolved.startsWith(uploadsResolved + path.sep) && resolved !== uploadsResolved) {
        continue;
      }
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // ignore
    }
  }
  return null;
}

