import { z } from "zod";
import { PASSWORD_MIN_LENGTH, passwordPolicyIssues } from "@shared/password-policy";

export { PASSWORD_MIN_LENGTH };

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
        // D12: the shared policy, the same one the server applies.
        .min(PASSWORD_MIN_LENGTH, m("newTooShort"))
        .refine((v) => !passwordPolicyIssues(v).some((i) => i !== "tooShort"), m("newCharacters")),
      confirmPassword: z.string().min(1, m("confirmRequired")),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: m("mismatch"),
      path: ["confirmPassword"],
    });
}

export type PasswordChangeValues = z.infer<ReturnType<typeof makePasswordChangeSchema>>;
