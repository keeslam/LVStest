import { z } from "zod";
import { UserRole } from "@shared/schema";
import { passwordPolicyIssues } from "@shared/password-policy";

type Translate = (key: string) => string;

/**
 * Schema of the users dialog form (add and edit). Built per render so the
 * messages follow the language switch (A-17-6: they used to be English).
 *
 * The password is part of the schema for a NEW account, so a blank form reports
 * the username and the password in one go instead of the password only after
 * the rest is valid. When editing, a blank password means "keep the current
 * one" (the server drops it, see PATCH /api/users/:id).
 */
export function makeUserFormSchema(t: Translate, isEdit: boolean) {
  const m = (key: string) => t(`usersDialog.formErrors.${key}`);
  return z
    .object({
      username: z.string().trim().min(3, m("usernameTooShort")),
      password: z.string().optional(),
      email: z.string().email(m("emailInvalid")).or(z.literal("")).optional().nullable(),
      fullName: z.string().or(z.literal("")).optional().nullable(),
      role: z.string().default(UserRole.USER),
      permissions: z.array(z.string()).default([]),
      active: z.boolean().default(true),
      hidePrices: z.boolean().default(false),
    })
    .superRefine((data, ctx) => {
      if (!isEdit && (!data.password || data.password.trim() === "")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: t("usersDialog.passwordRequired") });
        return;
      }
      // D12: a non-blank new password (create, or a reset on edit) must follow
      // the shared rule; a blank one on edit still means "keep the current one".
      if (data.password && data.password.trim() !== "" && passwordPolicyIssues(data.password).length > 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: m("passwordPolicy") });
      }
    });
}

export type UserFormValues = z.infer<ReturnType<typeof makeUserFormSchema>>;
