import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Car } from "lucide-react";
import type { PortalDriverDto, PortalReservationDto } from "@shared/portal-types";
import { portalFetch, portalQueryFn, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchListPicker } from "@/components/ui/search-list-picker";
import { COUNTRIES } from "@shared/countries";
import { useToast } from "@/hooks/use-toast";
import { capitalizeName, formatLicensePlate } from "@/lib/format-utils";
import { btnPrimary } from "./ui";

const FIELDS = ["displayName", "email", "phone", "firstName", "lastName", "driverLicenseNumber", "licenseExpiry", "licenseOrigin", "preferredLanguage", "notes"] as const;
type Field = typeof FIELDS[number];
type Values = Record<Field, string>;
/** Countries customers pick most; the full list follows in its own group. */
const COMMON_COUNTRIES = ["Netherlands", "Belgium", "Germany", "France", "Poland", "United Kingdom"] as const;
const OTHER_COUNTRIES = COUNTRIES.filter((c) => !(COMMON_COUNTRIES as readonly string[]).includes(c));
const NAME_FIELDS: Field[] = ["displayName", "firstName", "lastName"];

const emptyValues = (driver?: PortalDriverDto): Values =>
  Object.fromEntries(FIELDS.map((f) => [f, (driver?.[f] as string | null) ?? (f === "preferredLanguage" ? "nl" : f === "licenseOrigin" ? "Netherlands" : "")])) as Values;

/** Which reservations a new driver can be put on right away. */
const assignable = (r: PortalReservationDto) => r.status === "booked" || r.status === "picked_up";

/**
 * Add or edit a driver. Adding asks for the bare minimum (name plus an e-mail
 * address or phone number) and can put the driver on a car in the same go;
 * licence details and the rest sit under "Meer gegevens". Editing shows everything.
 */
export function DriverFormDialog({ driver, children, open: controlledOpen, onOpenChange, onSaved, assignReservationId }: {
  driver?: PortalDriverDto; children?: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void;
  /** Called with the saved driver; the dialog still closes itself. */
  onSaved?: (driver: PortalDriverDto) => void;
  /** Preselect a car to put the new driver on. */
  assignReservationId?: number;
}) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (o: boolean) => { if (onOpenChange) onOpenChange(o); else setUncontrolledOpen(o); };
  const isEdit = Boolean(driver);
  const [values, setValues] = useState<Values>(() => emptyValues(driver));
  const [more, setMore] = useState(isEdit);
  const [file, setFile] = useState<File | null>(null);
  const [assignTo, setAssignTo] = useState<number | null>(assignReservationId ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setValues(emptyValues(driver)); setMore(isEdit); setFile(null); setAssignTo(assignReservationId ?? null); setError(null); } }, [open, driver, isEdit, assignReservationId]);
  const set = (f: Field, v: string) => { setError(null); setValues((cur) => ({ ...cur, [f]: NAME_FIELDS.includes(f) ? capitalizeName(v) : v })); };

  const { data: reservations = [] } = useQuery<PortalReservationDto[]>({ queryKey: ["portal", "/api/portal/reservations"], queryFn: portalQueryFn, enabled: open && !isEdit });
  const cars = reservations.filter(assignable).map((r) => ({
    id: r.id,
    label: r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model} · ${formatLicensePlate(r.vehicle.licensePlate)}` : `#${r.id}`,
    sub: r.driver ? t("drivers.currently", { name: r.driver.displayName }) : t("drivers.noDriverYet"),
    search: `${r.vehicle?.licensePlate ?? ""} ${r.driver?.displayName ?? ""} ${r.startDate}`,
  }));

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | null> = Object.fromEntries(FIELDS.map((f) => [f, values[f] === "" ? null : values[f]]));
      body.displayName = values.displayName;
      const saved = driver
        ? await portalFetch<PortalDriverDto>("PATCH", `/api/portal/drivers/${driver.id}`, body)
        : await portalFetch<PortalDriverDto>("POST", "/api/portal/drivers", body);
      if (file) {
        const form = new FormData();
        form.append("licenseFile", file);
        await portalFetch("POST", `/api/portal/drivers/${saved.id}/license`, form);
      }
      if (!driver && assignTo) await portalFetch("POST", `/api/portal/reservations/${assignTo}/driver`, { driverId: saved.id });
      return saved;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["portal"] });
      toast({ title: isEdit ? t("drivers.saved") : assignTo ? t("drivers.addedAndAssigned", { name: saved.displayName }) : t("drivers.added", { name: saved.displayName }) });
      onSaved?.(saved);
      setOpen(false);
    },
    onError: (e) => toast({ title: e instanceof PortalApiError ? e.message : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!values.email.trim() && !values.phone.trim()) { setError(t("drivers.contactRequired")); return; }
    mutation.mutate();
  }
  const text = (f: Field, type = "text", extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`drv-${f}`}>{t(f === "displayName" ? "fields.displayName" : f === "driverLicenseNumber" ? "fields.licenseNumber" : `fields.${f}`)}</Label>
      <Input id={`drv-${f}`} type={type} required={f === "displayName"} value={values[f]} onChange={(e) => set(f, e.target.value)} data-testid={`input-driver-${f}`} {...extra} />
    </div>
  );

  // Desktop: every open block gets its own column so nothing has to scroll.
  const showCars = !isEdit && cars.length > 0;
  const columns = 1 + (more ? 1 : 0) + (showCars ? 1 : 0);
  const width = columns === 3 ? "sm:max-w-3xl lg:max-w-5xl" : columns === 2 ? "sm:max-w-3xl" : "sm:max-w-lg";
  const grid = columns === 3 ? "md:grid-cols-2 lg:grid-cols-3" : columns === 2 ? "md:grid-cols-2" : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className={width} data-testid="portal-driver-form">
        <DialogHeader><DialogTitle>{isEdit ? t("drivers.editTitle", { name: driver?.displayName }) : t("drivers.addTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className={`grid items-start gap-3 ${grid}`}>
            <div className="space-y-4">
              <div className="space-y-3 rounded-xl border border-[#e6e8f0] p-4">
                {text("displayName", "text", { autoFocus: !isEdit, placeholder: t("drivers.namePlaceholder") })}
                {text("email", "email", { autoComplete: "off" })}
                {text("phone", "tel", { autoComplete: "off" })}
                <p className={`text-xs ${error ? "text-[#a32d2d]" : "text-[#64748b]"}`} data-testid="driver-contact-hint">{error ?? t("drivers.contactHint")}</p>
              </div>
              <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-[#cbd5e1] px-4 py-2.5 text-sm font-medium text-[#1a1d62] hover:bg-[#eef0fb]" aria-expanded={more} data-testid="button-driver-more">
                {t("drivers.moreDetails")}{more ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>

            {more && (
              <div className="space-y-3 rounded-xl border border-[#e6e8f0] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {text("firstName")}
                  {text("lastName")}
                  {text("driverLicenseNumber")}
                  {text("licenseExpiry", "date")}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="drv-licenseOrigin">{t("fields.licenseOrigin")}</Label>
                    <select id="drv-licenseOrigin" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={values.licenseOrigin} onChange={(e) => set("licenseOrigin", e.target.value)} data-testid="select-driver-country">
                      <optgroup label={t("drivers.commonCountries")}>{COMMON_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
                      <optgroup label={t("drivers.otherCountries")}>{OTHER_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="drv-preferredLanguage">{t("fields.preferredLanguage")}</Label>
                    <select id="drv-preferredLanguage" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={values.preferredLanguage} onChange={(e) => set("preferredLanguage", e.target.value)} data-testid="select-driver-language">
                      <option value="nl">{t("languages.nl")}</option>
                      <option value="en">{t("languages.en")}</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="drv-file">{t("actions.uploadLicense")}</Label>
                    <Input id="drv-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="drv-notes">{t("fields.notes")}</Label>
                  <Textarea id="drv-notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-driver-notes" />
                </div>
              </div>
            )}

            {showCars && (
              <div className="space-y-2 rounded-xl border border-[#e6e8f0] p-4">
                <Label className="flex items-center gap-2"><Car className="h-4 w-4 text-[#1a1d62]" />{t("drivers.assignNow")}</Label>
                <SearchListPicker items={cars} value={assignTo} onChange={setAssignTo} searchPlaceholder={t("drivers.searchCar")} emptyText={t("drivers.noCarFound")} changeLabel={t("actions.change")}
                  hintText={(shown, total) => t("drivers.moreShown", { shown, total })} searchFrom={6} maxShown={5} testId="driver-assign-picker" />
                <p className="text-xs text-[#64748b]">{t("drivers.assignHint")}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="submit" className={btnPrimary} disabled={mutation.isPending} data-testid="button-save-driver">
              {isEdit ? t("actions.save") : assignTo ? t("drivers.addAndAssign") : t("actions.addDriver")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
