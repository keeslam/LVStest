import { apiRequest, getCsrfToken, throwIfResNotOk, fetchWithTimeout } from "./queryClient";

/**
 * B-37 - "Onderhoud afronden" is ONE request. What the workshop hands over (the
 * completion date, the APK date, the odometer reading, the APK file) goes to
 * `POST /api/reservations/:id/complete-maintenance`, which writes it all in one
 * transaction. The dialog used to make three calls with three different rights
 * (`POST /api/documents`, `PATCH /api/vehicles/:id`, then the completion), so a
 * failure halfway left the upload and the vehicle changes behind.
 */
export interface CompleteMaintenanceFields {
  completionDate: string;
  maintenanceCategory: string;
  notes: string;
  /** yyyy-MM-dd; left out when the field is empty. */
  apkDate?: string;
  /** Whole kilometres above zero; left out when the field is empty. */
  currentMileage?: number;
}

/** A 25 MB file on a slow connection needs more than the 30 s every other request gets. */
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Sends the completion. With a file it is multipart (field `apkFile`, after the
 * text fields); without one it is the JSON body the endpoint has always taken.
 * Errors are the same `Error` either way - `message` plus every field the server
 * sent (`code`, `current`, `given`, ...) - so the caller has one error path.
 */
export async function submitMaintenanceCompletion(
  blockId: number,
  fields: CompleteMaintenanceFields,
  apkFile: File | null,
): Promise<Response> {
  const url = `/api/reservations/${blockId}/complete-maintenance`;
  if (!apkFile) {
    return apiRequest("POST", url, fields);
  }

  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) body.append(key, String(value));
  }
  body.append("apkFile", apkFile);

  const headers: Record<string, string> = {};
  const csrfToken = getCsrfToken();
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  // No Content-Type: the browser sets the multipart boundary itself.
  const res = await fetchWithTimeout(url, { method: "POST", headers, body, credentials: "include" }, UPLOAD_TIMEOUT_MS);
  await throwIfResNotOk(res);
  return res;
}
