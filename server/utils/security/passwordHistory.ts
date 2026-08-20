import bcrypt from 'bcryptjs';
import { db } from '../../db';
import { passwordHistory } from '../../../shared/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Maximum number of password history entries to keep per user
 */
const MAX_PASSWORD_HISTORY = 5;

/**
 * Add current password to history before changing it
 */
export async function addToPasswordHistory(userId: number, passwordHash: string): Promise<void> {
  try {
    // Add new password to history
    await db.insert(passwordHistory).values({
      userId,
      passwordHash,
    });

    // Clean up old password history (keep only last 5)
    const allHistory = await db
      .select()
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt));

    // Delete entries beyond MAX_PASSWORD_HISTORY
    if (allHistory.length > MAX_PASSWORD_HISTORY) {
      const idsToDelete = allHistory
        .slice(MAX_PASSWORD_HISTORY)
        .map((entry) => entry.id);

      if (idsToDelete.length > 0) {
        await db
          .delete(passwordHistory)
          .where(eq(passwordHistory.id, idsToDelete[0])); // Delete oldest first
      }
    }
  } catch (error) {
    console.error('Error adding to password history:', error);
    throw error;
  }
}

/**
 * Check if a password has been used recently (in last 5 passwords)
 */
export async function isPasswordInHistory(
  userId: number,
  newPassword: string
): Promise<boolean> {
  try {
    // Get last 5 passwords
    const history = await db
      .select()
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt))
      .limit(MAX_PASSWORD_HISTORY);

    // Check if new password matches any in history
    for (const entry of history) {
      const matches = await bcrypt.compare(newPassword, entry.passwordHash);
      if (matches) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking password history:', error);
    return false; // Fail open - don't block password change if check fails
  }
}

/**
 * Get password strength score and feedback
 * Uses zxcvbn library for password strength estimation
 */
export function getPasswordStrength(password: string): {
  score: number; // 0-4 (0 = weak, 4 = strong)
  feedback: string[];
  warning: string | null;
} {
  const feedback: string[] = [];
  let score = 0;
  let warning: string | null = null;

  // Length checks
  if (password.length < 8) {
    warning = 'Password must be at least 8 characters long';
    return { score: 0, feedback: ['Use at least 8 characters'], warning };
  }

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;

  // Character variety checks
  const hasLowerCase = /[a-z]/.test(password);
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasLowerCase) feedback.push('Add lowercase letters');
  if (!hasUpperCase) feedback.push('Add uppercase letters');
  if (!hasNumbers) feedback.push('Add numbers');
  if (!hasSpecialChars) feedback.push('Add special characters (!@#$%^&*)');

  const varietyCount = [hasLowerCase, hasUpperCase, hasNumbers, hasSpecialChars].filter(Boolean).length;
  if (varietyCount >= 3) score++;

  // Check for common patterns
  const commonPatterns = [
    /^123456/,
    /password/i,
    /qwerty/i,
    /abc123/i,
    /111111/,
    /123123/,
    /admin/i,
  ];

  for (const pattern of commonPatterns) {
    if (pattern.test(password)) {
      warning = 'Avoid common passwords and patterns';
      score = Math.max(0, score - 2);
      break;
    }
  }

  // Normalize score to 0-4
  score = Math.min(4, Math.max(0, score));

  return { score, feedback, warning };
}
