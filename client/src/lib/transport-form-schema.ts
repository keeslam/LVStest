import { z } from "zod";

/**
 * Form schema of the transport dialog. Built with the translator so its
 * messages follow the language (they used to be hard-coded English: "Please
 * select a vehicle", A-8-4).
 */
export const makeTransportFormSchema = (t: (key: string) => string) => z.object({
  // Required unless isExternalVehicle — enforced below via superRefine, since which
  // one is required depends on that other field.
  vehicleId: z.string().optional(),
  isExternalVehicle: z.boolean().default(false),
  externalLicensePlate: z.string().optional(),
  externalBrand: z.string().optional(),
  externalModel: z.string().optional(),
  externalColor: z.string().optional(),
  externalOwnerName: z.string().optional(),
  externalOwnerPhone: z.string().optional(),
  spareRequired: z.boolean().default(false),
  // Empty string = TBD (spare required but not yet picked) — a valid, intentional
  // state, not a validation error.
  relatedVehicleId: z.string().optional(),
  transportType: z.enum(["swap", "tow", "repossession", "delivery", "other"], {
    required_error: t("transportDialog.validation.transportTypeRequired"),
  }),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled"),
  scheduledDate: z.string().min(1, t("transportDialog.validation.scheduledDateRequired")),
  completedDate: z.string().optional(),
  originAddress: z.string().optional(),
  originCity: z.string().optional(),
  destinationAddress: z.string().optional(),
  destinationCity: z.string().optional(),
  distanceKm: z.union([z.string(), z.number()]).optional(),
  tollCost: z.union([z.string(), z.number()]).optional(),
  isBreakdownOrMaintenance: z.boolean().default(false),
  billable: z.boolean().default(false),
  customerId: z.string().optional(),
  billableAmount: z.union([z.string(), z.number()]).optional(),
  invoiced: z.boolean().default(false),
  driverName: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.isExternalVehicle) {
    if (!data.externalLicensePlate || data.externalLicensePlate.trim() === '') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["externalLicensePlate"], message: t("transportDialog.validation.licensePlateRequired") });
    }
  } else if (!data.vehicleId || data.vehicleId.trim() === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vehicleId"], message: t("transportDialog.validation.vehicleRequired") });
  }
});

export type TransportFormData = z.infer<ReturnType<typeof makeTransportFormSchema>>;
