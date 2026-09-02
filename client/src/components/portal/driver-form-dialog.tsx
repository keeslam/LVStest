import { useState, type ReactNode, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { PortalDriverDto } from "@shared/portal-types";
import { portalFetch, PortalApiError } from "@/lib/portal-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const FIELDS = ["displayName", "firstName", "lastName", "email", "phone", "driverLicenseNumber", "licenseExpiry"] as const;
type Field = typeof FIELDS[number];
const LABEL_KEY: Record<Field, string> = {
  displayName: "fields.displayName", firstName: "fields.firstName", lastName: "fields.lastName", email: "fields.email",
  phone: "fields.phone", driverLicenseNumber: "fields.licenseNumber", licenseExpiry: "fields.licenseExpiry",
};

export function DriverFormDialog({ driver, children }: { driver?: PortalDriverDto; children: ReactNode }) {
  const { t } = useTranslation("portal");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Field, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, (driver?.[f] as string | null) ?? ""])) as Record<Field, string>,
  );
  const [file, setFile] = useState<File | null>(null);

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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("drivers.dialogTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f}>
              <Label htmlFor={`drv-${f}`}>{t(LABEL_KEY[f])}</Label>
              <Input id={`drv-${f}`} type={f === "licenseExpiry" ? "date" : f === "email" ? "email" : "text"} required={f === "displayName"}
                value={values[f]} onChange={(e) => setValues({ ...values, [f]: e.target.value })} />
            </div>
          ))}
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
