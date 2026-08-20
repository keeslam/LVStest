import { Request } from 'express';
import path from 'path';
import fs from 'fs';
import { fileTypeFromBuffer } from 'file-type';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  detectedMimeType?: string;
  detectedExtension?: string;
}

export interface FileTypeConfig {
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxSizeBytes: number;
  category: string;
}

const FILE_TYPE_CONFIGS: Record<string, FileTypeConfig> = {
  pdf: {
    allowedMimeTypes: ['application/pdf'],
    allowedExtensions: ['.pdf'],
    maxSizeBytes: 25 * 1024 * 1024,
    category: 'document'
  },
  image: {
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    category: 'image'
  },
  document: {
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ],
    allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    maxSizeBytes: 25 * 1024 * 1024,
    category: 'document'
  },
  backup: {
    allowedMimeTypes: [
      'application/x-sql',
      'application/sql',
      'text/plain',
      'application/gzip',
      'application/x-gzip',
      'application/x-tar',
      'application/x-compressed-tar'
    ],
    allowedExtensions: ['.sql', '.gz', '.tar.gz', '.tgz', '.sql.gz'],
    maxSizeBytes: 1000 * 1024 * 1024,
    category: 'backup'
  }
};

const DANGEROUS_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr',
  '.ps1', '.vbs', '.js', '.jse', '.ws', '.wsf',
  '.sh', '.bash', '.csh', '.ksh', '.zsh',
  '.php', '.phtml', '.php3', '.php4', '.php5',
  '.asp', '.aspx', '.cer', '.csr',
  '.jsp', '.jspx', '.jsf', '.faces',
  '.py', '.pyc', '.pyo', '.pyd',
  '.rb', '.rbw',
  '.pl', '.pm', '.cgi',
  '.htaccess', '.htpasswd',
  '.svn', '.git',
  '.html', '.htm', '.xhtml', '.shtml',
  '.svg'
];

export function isDangerousExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return DANGEROUS_EXTENSIONS.includes(ext);
}

export function sanitizeFilename(filename: string): string {
  let sanitized = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '');
  
  if (sanitized.length > 200) {
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    sanitized = name.substring(0, 200 - ext.length) + ext;
  }
  
  return sanitized || 'unnamed_file';
}

export async function validateFileBuffer(
  buffer: Buffer,
  declaredMimeType: string,
  filename: string,
  fileType: keyof typeof FILE_TYPE_CONFIGS = 'document'
): Promise<FileValidationResult> {
  const config = FILE_TYPE_CONFIGS[fileType];
  if (!config) {
    return { valid: false, error: 'Unknown file type category' };
  }

  if (buffer.length > config.maxSizeBytes) {
    return { 
      valid: false, 
      error: `File exceeds maximum size of ${Math.round(config.maxSizeBytes / 1024 / 1024)}MB` 
    };
  }

  const ext = path.extname(filename).toLowerCase();
  if (!config.allowedExtensions.some(allowed => 
    ext === allowed || filename.toLowerCase().endsWith(allowed)
  )) {
    return { 
      valid: false, 
      error: `File extension ${ext} is not allowed. Allowed: ${config.allowedExtensions.join(', ')}` 
    };
  }

  if (isDangerousExtension(filename)) {
    return { valid: false, error: 'This file type is not permitted for security reasons' };
  }

  try {
    const detected = await fileTypeFromBuffer(buffer);
    
    if (detected) {
      const detectedMime = detected.mime;
      const detectedExt = `.${detected.ext}`;
      
      const isPdfVariant = (mime: string) => mime.includes('pdf');
      const isImageVariant = (mime: string) => mime.startsWith('image/');
      const isTextVariant = (mime: string) => mime.startsWith('text/') || mime.includes('plain');
      const isArchiveVariant = (mime: string) => 
        mime.includes('gzip') || mime.includes('tar') || mime.includes('zip');

      let mimeMatches = false;
      
      if (isPdfVariant(declaredMimeType) && isPdfVariant(detectedMime)) {
        mimeMatches = true;
      } else if (isImageVariant(declaredMimeType) && isImageVariant(detectedMime)) {
        mimeMatches = true;
      } else if (isTextVariant(declaredMimeType) && isTextVariant(detectedMime)) {
        mimeMatches = true;
      } else if (isArchiveVariant(declaredMimeType) && isArchiveVariant(detectedMime)) {
        mimeMatches = true;
      } else if (config.allowedMimeTypes.includes(detectedMime)) {
        mimeMatches = true;
      }

      if (!mimeMatches) {
        return {
          valid: false,
          error: `File content does not match declared type. Expected ${declaredMimeType}, detected ${detectedMime}`,
          detectedMimeType: detectedMime,
          detectedExtension: detectedExt
        };
      }

      return { 
        valid: true, 
        detectedMimeType: detectedMime,
        detectedExtension: detectedExt
      };
    } else {
      const textBasedTypes = ['application/pdf', 'text/plain', 'application/sql', 'application/x-sql'];
      if (textBasedTypes.includes(declaredMimeType) || ext === '.sql') {
        if (declaredMimeType === 'application/pdf' || ext === '.pdf') {
          const isPdf = buffer.slice(0, 5).toString() === '%PDF-';
          if (!isPdf) {
            return { valid: false, error: 'File does not appear to be a valid PDF' };
          }
        }
        
        return { valid: true };
      }
      
      return { 
        valid: false, 
        error: 'Could not verify file type' 
      };
    }
  } catch (error) {
    console.error('File type detection error:', error);
    return { valid: false, error: 'Failed to validate file type' };
  }
}

export async function validateUploadedFile(
  filePath: string,
  declaredMimeType: string,
  originalFilename: string,
  fileType: keyof typeof FILE_TYPE_CONFIGS = 'document'
): Promise<FileValidationResult> {
  try {
    const buffer = fs.readFileSync(filePath);
    return validateFileBuffer(buffer, declaredMimeType, originalFilename, fileType);
  } catch (error) {
    console.error('Error reading file for validation:', error);
    return { valid: false, error: 'Failed to read file for validation' };
  }
}

export function createSecureMulterFilter(
  allowedTypes: keyof typeof FILE_TYPE_CONFIGS | (keyof typeof FILE_TYPE_CONFIGS)[]
) {
  const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
  
  return (req: Request, file: Express.Multer.File, callback: Function) => {
    const filename = file.originalname.toLowerCase();
    const declaredMime = file.mimetype;
    
    if (isDangerousExtension(filename)) {
      return callback(new Error('This file type is not permitted for security reasons'), false);
    }

    let allowed = false;
    for (const type of types) {
      const config = FILE_TYPE_CONFIGS[type];
      if (!config) continue;
      
      const ext = path.extname(filename);
      const extAllowed = config.allowedExtensions.some(allowedExt => 
        ext === allowedExt || filename.endsWith(allowedExt)
      );
      
      const mimeAllowed = config.allowedMimeTypes.some(allowedMime => 
        declaredMime === allowedMime || 
        declaredMime.includes(allowedMime.split('/')[1]) ||
        (allowedMime.includes('pdf') && declaredMime.includes('pdf'))
      );
      
      if (extAllowed && (mimeAllowed || declaredMime === 'application/octet-stream')) {
        allowed = true;
        break;
      }
    }
    
    if (!allowed) {
      const allExtensions = types
        .map(t => FILE_TYPE_CONFIGS[t]?.allowedExtensions || [])
        .flat()
        .filter((v, i, a) => a.indexOf(v) === i);
      
      return callback(
        new Error(`Only ${allExtensions.join(', ')} files are allowed`),
        false
      );
    }
    
    callback(null, true);
  };
}

export async function validateAfterUpload(
  filePath: string,
  originalFilename: string,
  declaredMimeType: string,
  fileType: keyof typeof FILE_TYPE_CONFIGS = 'document'
): Promise<FileValidationResult> {
  const result = await validateUploadedFile(filePath, declaredMimeType, originalFilename, fileType);
  
  if (!result.valid) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error('Failed to delete invalid file:', error);
    }
  }
  
  return result;
}

export { FILE_TYPE_CONFIGS };
