import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import type { PortalDocumentDto } from "@shared/portal-types";
import type { PortalRequestTypeValue } from "@shared/portal-requests";
import { ReservationDialog } from "@/components/portal/reservation-dialog";
import { FineDialog } from "@/components/portal/fine-dialog";
import { RequestDialog } from "@/components/portal/request-dialog";
import { NewRequestDialog } from "@/components/portal/new-request-dialog";
import { DocumentDialog } from "@/components/portal/document-dialog";

export interface NewRequestPrefill { type?: PortalRequestTypeValue; reservationId?: number; fineId?: number }

/** Which detail dialog is open in the portal. One at a time; the list page stays underneath. */
type Open =
  | { kind: "reservation"; id: number }
  | { kind: "fine"; id: number }
  | { kind: "request"; id: number }
  | { kind: "newRequest"; prefill: NewRequestPrefill }
  | { kind: "document"; document: PortalDocumentDto }
  | null;

interface PortalDialogsApi {
  open: Open;
  openReservation: (id: number) => void;
  openFine: (id: number) => void;
  openRequest: (id: number) => void;
  openNewRequest: (prefill?: NewRequestPrefill) => void;
  openDocument: (document: PortalDocumentDto) => void;
  close: () => void;
}

const Ctx = createContext<PortalDialogsApi | undefined>(undefined);

/** Deep links (e.g. from e-mails) that open a dialog on top of their list page. */
const ROUTE_DIALOGS: Array<{ pattern: RegExp; base: string; make: (m: RegExpMatchArray, search: string) => Open }> = [
  { pattern: /^\/reserveringen\/(\d+)$/, base: "/reserveringen", make: (m) => ({ kind: "reservation", id: Number(m[1]) }) },
  { pattern: /^\/bekeuringen\/(\d+)$/, base: "/bekeuringen", make: (m) => ({ kind: "fine", id: Number(m[1]) }) },
  { pattern: /^\/aanvragen\/nieuw$/, base: "/aanvragen", make: (_m, search) => {
    const p = new URLSearchParams(search);
    return { kind: "newRequest", prefill: {
      type: (p.get("type") as PortalRequestTypeValue | null) ?? undefined,
      reservationId: p.get("reservationId") ? Number(p.get("reservationId")) : undefined,
      fineId: p.get("fineId") ? Number(p.get("fineId")) : undefined,
    } };
  } },
  { pattern: /^\/aanvragen\/(\d+)$/, base: "/aanvragen", make: (m) => ({ kind: "request", id: Number(m[1]) }) },
];

export function PortalDialogsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const [location, navigate] = useLocation();
  // The dialog was opened by the URL (deep link); closing it then also cleans the URL.
  const fromRoute = useRef(false);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    for (const r of ROUTE_DIALOGS) {
      const m = location.match(r.pattern);
      if (m) { fromRoute.current = true; setOpen(r.make(m, search)); return; }
    }
    // Browser back from a deep link: the URL is a list again, so the dialog goes.
    if (fromRoute.current) { fromRoute.current = false; setOpen(null); }
  }, [location]);

  const close = useCallback(() => {
    setOpen(null);
    if (fromRoute.current) {
      fromRoute.current = false;
      const r = ROUTE_DIALOGS.find((x) => x.pattern.test(location));
      if (r) navigate(r.base, { replace: true });
    }
  }, [location, navigate]);

  const api = useMemo<PortalDialogsApi>(() => ({
    open,
    openReservation: (id) => { fromRoute.current = false; setOpen({ kind: "reservation", id }); },
    openFine: (id) => { fromRoute.current = false; setOpen({ kind: "fine", id }); },
    openRequest: (id) => { fromRoute.current = false; setOpen({ kind: "request", id }); },
    openNewRequest: (prefill = {}) => { fromRoute.current = false; setOpen({ kind: "newRequest", prefill }); },
    openDocument: (document) => { fromRoute.current = false; setOpen({ kind: "document", document }); },
    close,
  }), [open, close]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <ReservationDialog id={open?.kind === "reservation" ? open.id : null} onClose={close} />
      <FineDialog id={open?.kind === "fine" ? open.id : null} onClose={close} />
      <RequestDialog id={open?.kind === "request" ? open.id : null} onClose={close} />
      <NewRequestDialog prefill={open?.kind === "newRequest" ? open.prefill : null} onClose={close} />
      <DocumentDialog document={open?.kind === "document" ? open.document : null} onClose={close} />
    </Ctx.Provider>
  );
}

export function usePortalDialogs(): PortalDialogsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePortalDialogs must be used within PortalDialogsProvider");
  return ctx;
}
