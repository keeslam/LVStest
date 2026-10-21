/**
 * Round 2 punt 12 (Kees, 2026-10-21) — dismissed notifications for the whole team.
 *
 * They used to be localStorage timestamps, so every colleague and every PC saw the
 * same reminders again (and the zone and missing-invoice keys were not even read back
 * after a reload). They now live on the server (/api/notification-dismissals); the
 * rules are in shared/notification-dismissal.ts. `fingerprint` is the date the notice
 * is about, so an "until the date changes" dismissal ends when that date changes.
 */
import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { dismissalHolds, dismissalUntil, type DismissalLike, type DismissalMode } from "@shared/notification-dismissal";

const KEY = ["/api/notification-dismissals"];

export function useDismissedNotifications() {
  const { data = [] } = useQuery<DismissalLike[]>({ queryKey: KEY });

  const isDismissed = useCallback(
    (key: string, fingerprint?: string | null) => dismissalHolds(data.find((d) => d.key === key), new Date(), fingerprint),
    [data],
  );

  const save = useMutation({
    mutationFn: async ({ key, mode, fingerprint }: { key: string; mode: DismissalMode; fingerprint?: string | null }) => {
      await apiRequest("POST", "/api/notification-dismissals", { key, mode, fingerprint: fingerprint ?? null });
    },
    // Gone from the list at once, for this screen; the refetch brings the team's state.
    onMutate: ({ key, mode, fingerprint }) => {
      queryClient.setQueryData<DismissalLike[]>(KEY, (prev = []) => [
        ...prev.filter((d) => d.key !== key),
        { key, mode, until: dismissalUntil(mode, new Date())?.toISOString() ?? null, fingerprint: mode === "until_change" ? fingerprint ?? "" : null },
      ]);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const dismiss = useCallback(
    (key: string, mode: DismissalMode = "week", fingerprint?: string | null) => save.mutate({ key, mode, fingerprint }),
    [save],
  );

  return { isDismissed, dismiss };
}

/** Puts a notice back for everyone (after an APK or warranty service). Never throws. */
export async function clearDismissal(key: string): Promise<void> {
  try {
    await apiRequest("DELETE", `/api/notification-dismissals/${encodeURIComponent(key)}`);
  } catch {
    // Nothing to put back, or offline: the notice simply stays dismissed for its time.
  }
  queryClient.invalidateQueries({ queryKey: KEY });
}
