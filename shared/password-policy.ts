/**
 * D12: the one password rule for staff accounts. Used by the server routes
 * (POST /api/users, PATCH /api/users/:id, change-password, /api/register) and
 * by the profile and users dialogs, so the form says what the server checks.
 *
 * Existing passwords keep working; the rule only applies to a new one.
 * Customer-portal passwords have their own, shorter rule (outside D12).
 */
export const PASSWORD_MIN_LENGTH = 10;

export type PasswordPolicyIssue = "tooShort" | "needsLower" | "needsUpper" | "needsDigit";

/** Every rule the value breaks, in a fixed order; empty means the password is acceptable. */
export function passwordPolicyIssues(password: unknown): PasswordPolicyIssue[] {
  const value = typeof password === "string" ? password : "";
  const issues: PasswordPolicyIssue[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) issues.push("tooShort");
  if (!/[a-z]/.test(value)) issues.push("needsLower");
  if (!/[A-Z]/.test(value)) issues.push("needsUpper");
  if (!/[0-9]/.test(value)) issues.push("needsDigit");
  return issues;
}

/**
 * The 400 body of every server route that refuses a weak password. Routes send
 * it AFTER their 403 checks, so a refusal for lack of rights is never turned
 * into a hint about the password. The client maps `code`, never the message.
 */
export function passwordTooWeakBody(issues: PasswordPolicyIssue[]) {
  return {
    message: "Password does not meet the password rule",
    code: "PASSWORD_TOO_WEAK" as const,
    field: "password" as const,
    issues,
  };
}
