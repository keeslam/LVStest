import { UserPermission as P } from "../../shared/schema";

export interface DialogEntry {
  /** Page the opener is on. */
  page: string;
  /** data-testid of the control that opens the dialog. */
  opener: string;
  /** Permissions that show the opener; roles without them are skipped. An empty array means the opener is gated by role (admin only) rather than a permission — `can()`'s admin bypass then decides it. */
  anyOf: string[];
  /** Source file that renders the dialog root; this is what the coverage report counts. */
  source: string;
  name: string;
  /** data-testid of a menu trigger to click before `opener`, when the opener lives inside a dropdown menu. */
  via?: string;
  /** data-testid of a close/cancel control, when the dialog blocks Escape on purpose (a form guarding against losing input). */
  close?: string;
}

export const DIALOGS: DialogEntry[] = [
  // isAdmin-gated in vehicles/index.tsx (role === UserRole.ADMIN), not
  // MANAGE_VEHICLES (manager and maintenance also hold that permission but do
  // not see this button) — anyOf: [] so can() only passes for admin.
  { page: "/vehicles", opener: "button-open-recycle-bin", anyOf: [], source: "client/src/components/vehicles/deleted-vehicles-dialog.tsx", name: "prullenbak voertuigen" },
  { page: "/expenses", opener: "button-invoice-inbox", anyOf: [P.MANAGE_EXPENSES], source: "client/src/components/expenses/invoice-inbox-dialog.tsx", name: "ontvangen facturen" },
];

/** Dialogs that need a record in a certain state; a Layer B story opens them. */
export const LAYER_B_SOURCES: string[] = [];
