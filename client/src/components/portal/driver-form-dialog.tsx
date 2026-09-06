import { useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableCombobox } from "@/components/ui/searchable-combobox";
import { COUNTRIES } from "@shared/countries";
import { useToast } from "@/hooks/use-toast";
import { capitalizeName } from "@/lib/format-utils";

const FIELDS = ["displayName", "firstName", "lastName", "email", "phone", "driverLicenseNumber", "licenseExpiry", "licenseOrigin", "preferredLanguage", "notes"] as const;
type Field = typeof FIELDS[number];
const LABEL_KEY: Record<Field, string> = {
  displayName: "fields.displayName", firstName: "fields.firstName", lastName: "fields.lastName", email: "fields.email",
  phone: "fields.phone", driverLicenseNumber: "fields.licenseNumber", licenseExpiry: "fields.licenseExpiry",
  licenseOrigin: "fields.licenseOrigin", preferredLanguage: "fields.preferredLanguage", notes: "fields.notes",
};
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }));
/** Name fields get the same automatic capitalisation as the staff forms ("jan van der berg" -> "Jan van der Berg"). */
const NAME_FIELDS: Field[] = ["displayName", "firstName", "lastName"];

/** Same fields as the staff driver form, minus status and primary-driver flag (staff only). */
export function DriverFormDialog({ driver, children }: { driver?: PortalDriverDto; children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Field, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, (driver?.[f] as string | null) ?? (f === "preferredLanguage" ? "nl" : "")])) as Record<Field, string>,
  );
  const [file, setFile] = useState<File | null>(null);
  const set = (f: Field, v: string) => setValues({ ...values, [f]: NAME_FIELDS.includes(f) ? capitalizeName(v) : v });

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
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portal", "/api/portal/drivers"] });
      setOpen(false);
    },
    onError: (e) => toast({ title: e instanceof PortalApiError ? e.message : t("errors.PORTAL_SERVER_ERROR"), variant: "destructive" }),
  });

  function submit(e: FormEvent) { e.preventDefault(); mutation.mutate(); }
  const text = (f: Field, type = "text", extra: Record<string, unknown> = {}) => (
    <div>
      <Label htmlFor={`drv-${f}`}>{t(LABEL_KEY[f])}</Label>
      <Input id={`drv-${f}`} type={type} required={f === "displayName"} value={values[f]} onChange={(e) => set(f, e.target.value)} data-testid={`input-driver-${f}`} {...extra} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("drivers.dialogTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {text("displayName")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {text("firstName")}
            {text("lastName")}
            {text("email", "email")}
            {text("phone", "tel")}
            {text("driverLicenseNumber")}
            {text("licenseExpiry", "date")}
            <div>
              <Label htmlFor="drv-licenseOrigin">{t(LABEL_KEY.licenseOrigin)}</Label>
              <SearchableCombobox options={COUNTRY_OPTIONS} value={values.licenseOrigin} onChange={(v) => set("licenseOrigin", v)}
                placeholder={t("drivers.selectCountry")} searchPlaceholder={t("drivers.searchCountries")} emptyMessage={t("drivers.noCountries")} recentValues={["Netherlands", "Belgium", "Germany", "Poland"]} />
            </div>
            <div>
              <Label htmlFor="drv-preferredLanguage">{t(LABEL_KEY.preferredLanguage)}</Label>
              <select id="drv-preferredLanguage" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={values.preferredLanguage} onChange={(e) => set("preferredLanguage", e.target.value)} data-testid="select-driver-language">
                <option value="nl">{t("languages.nl")}</option>
                <option value="en">{t("languages.en")}</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="drv-notes">{t(LABEL_KEY.notes)}</Label>
            <Textarea id="drv-notes" rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-driver-notes" />
          </div>
          <div>
            <Label htmlFor="drv-file">{t("actions.uploadLicense")}</Label>
            <Input id="drv-file" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="submit" disabled={mutation.isPending}>{t("actions.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
