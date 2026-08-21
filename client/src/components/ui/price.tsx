import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/format-utils";

/**
 * Renders a money amount, or a masked placeholder for users with the
 * admin-set "Hide Prices" flag. Use this instead of calling
 * formatCurrency() directly wherever a price/amount is shown to the user.
 */
export function Price({ value, className }: { value: number | string | null | undefined; className?: string }) {
  const { user } = useAuth();
  if (user?.hidePrices) {
    return <span className={className} data-testid="price-hidden">•••</span>;
  }
  const numeric = typeof value === "string" ? parseFloat(value) : value;
  return <span className={className}>{numeric != null && !isNaN(numeric) ? formatCurrency(numeric) : "-"}</span>;
}

/** Non-component version for places that need a plain string (e.g. building an HTML print template). */
export function useHidePrices(): boolean {
  const { user } = useAuth();
  return !!user?.hidePrices;
}
