import { z } from "zod";

/**
 * Same minimum POST /api/users/change-password enforces (server/routes/users.ts).
 * The policy itself (D12) is the owner's decision; this file only makes the
 * form say, and check, what the server already requires.
 */
export const PASSWORD_MIN_LENGTH = 8;

type Translate = (key: string) => string;

/**
 * Schema of the profile dialog's "Wachtwoord" tab. Built per render so the
 * messages follow the language switch.
 *
 * The confirm field is only "required" when it is empty: a short confirmation
 * such as "abc" is a mismatch, never a "please confirm" (A-1-4).
 */
export function makePasswordChangeSchema(t: Translate) {
  const m = (key: string) => t(`profileDialog.passwordErrors.${key}`);
  return z
    .object({
      currentPassword: z.string().min(1, m("currentRequired")),
      newPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, m("newTooShort"))
        .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v), m("newCharacters")),
      confirmPassword: z.string().min(1, m("confirmRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: m("mismatch"),
      path: ["confirmPassword"],
    });
}

export type PasswordChangeValues = z.infer<ReturnType<typeof makePasswordChangeSchema>>;
