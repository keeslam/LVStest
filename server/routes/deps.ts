import type multer from "multer";
import type { ObjectStorageService } from "../objectStorage";
import type { setupAuth } from "../auth";

// Values created inside registerRoutes (server/routes.ts) that the split-out
// route modules still need. Passed explicitly instead of closing over them.
export interface RouteDeps {
  upload: multer.Multer;
  backupUpload: multer.Multer;
  diagramUpload: multer.Multer;
  fuelReceiptUpload: multer.Multer;
  objectStorageService: ObjectStorageService;
  objectStorage: ObjectStorageService;
  uploadsDir: string;
  requireAuth: ReturnType<typeof setupAuth>["requireAuth"];
}
