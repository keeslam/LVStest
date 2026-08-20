import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Strip HTML tags and dangerous characters from a string using DOMPurify (a
 * real HTML parser) instead of hand-rolled regexes, which are notoriously easy
 * to bypass with malformed or nested markup. ALLOWED_TAGS/ALLOWED_ATTR: []
 * strips every tag and attribute, keeping only the text content — matching
 * this app's "no rich text anywhere" policy.
 */
function stripHtml(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/**
 * Sanitize string values to prevent XSS attacks
 */
function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    return stripHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  return value;
}

/**
 * Middleware to sanitize request body, query, and params
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }

  if (req.query) {
    req.query = sanitizeValue(req.query);
  }

  if (req.params) {
    req.params = sanitizeValue(req.params);
  }

  next();
}

/**
 * Sanitize HTML content while preserving safe tags (for rich text editors)
 */
export function sanitizeHtml(html: string): string {
  // Strips all HTML to prevent XSS. If rich text is ever needed, pass an
  // ALLOWED_TAGS allowlist to DOMPurify.sanitize() instead of an empty one.
  return stripHtml(html);
}

/**
 * Validate and sanitize file uploads
 */
export function validateFileUpload(
  file: Express.Multer.File,
  options: {
    maxSize?: number; // in bytes
    allowedMimeTypes?: string[];
    allowedExtensions?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedMimeTypes = [],
    allowedExtensions = [],
  } = options;

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`,
    };
  }

  // Check MIME type
  if (allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `File type '${file.mimetype}' is not allowed`,
    };
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      return {
        valid: false,
        error: `File extension '.${ext}' is not allowed`,
      };
    }
  }

  // Additional validation: Check if file name contains suspicious characters
  const dangerousChars = /[<>:"|?*\x00-\x1f]/g;
  if (dangerousChars.test(file.originalname)) {
    return {
      valid: false,
      error: 'File name contains invalid characters',
    };
  }

  return { valid: true };
}
