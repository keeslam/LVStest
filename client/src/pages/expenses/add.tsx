import { useLocation } from "wouter";
import { ExpenseAddDialog } from "@/components/expenses/expense-add-dialog";

/**
 * The old /expenses/add address (A-9-7). Recording an expense used to be a page
 * from the Kosten screen and a dialog from the dashboard; it is one dialog now
 * (ExpenseAddDialog). This route stays so old links, shared/page-access.ts and
 * `?vehicleId=` / `?category=` links keep working: it opens that dialog and
 * goes back to the Kosten list when the dialog closes.
 */
export default function ExpenseAdd() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const vehicleId = Number(params.get("vehicleId"));

  return (
    <ExpenseAddDialog
      open
      vehicleId={Number.isInteger(vehicleId) && vehicleId > 0 ? vehicleId : undefined}
      category={params.get("category")}
      onOpenChange={(open) => { if (!open) navigate("/expenses"); }}
    />
  );
}
