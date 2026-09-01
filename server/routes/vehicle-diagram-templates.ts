import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import path from "path";
import fs from "fs";
import { validateAfterUpload } from "../utils/security/fileUploadSecurity";
import { getRelativePath } from "../services/document-paths";
import type { RouteDeps } from "./deps";

// Moved verbatim out of server/routes.ts (registerRoutes) - see git history for context.
export function registerVehicleDiagramTemplateRoutes(app: Express, deps: RouteDeps): void {
  const { upload, diagramUpload, uploadsDir, requireAuth } = deps;


  // VEHICLE DIAGRAM TEMPLATE ROUTES
  
  // Get all vehicle diagram templates
  app.get("/api/vehicle-diagram-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const templates = await storage.getAllVehicleDiagramTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching vehicle diagram templates:", error);
      res.status(500).json({ message: "Error fetching vehicle diagram templates" });
    }
  });

  // Get vehicle diagram template by ID
  app.get("/api/vehicle-diagram-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching vehicle diagram template:", error);
      res.status(500).json({ message: "Error fetching vehicle diagram template" });
    }
  });

  // Find matching vehicle diagram for a vehicle
  app.get("/api/vehicle-diagram-templates/match/:vehicleId", requireAuth, async (req: Request, res: Response) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      const vehicle = await storage.getVehicle(vehicleId);
      
      if (!vehicle) {
        return res.status(404).json({ message: "Vehicle not found" });
      }
      
      // Extract year from production date if available
      let year: number | undefined;
      if (vehicle.productionDate) {
        const match = vehicle.productionDate.match(/(\d{4})/);
        if (match) {
          year = parseInt(match[1]);
        }
      }
      
      console.log(`Looking for diagram template for vehicle ${vehicleId}:`, {
        brand: vehicle.brand,
        model: vehicle.model,
        year: year
      });
      
      const template = await storage.getVehicleDiagramTemplateByVehicle(
        vehicle.brand,
        vehicle.model,
        year
      );
      
      if (!template) {
        console.log(`No matching diagram template found for vehicle ${vehicleId}`);
        return res.status(404).json({ message: "No matching diagram template found" });
      }
      
      console.log(`Found matching diagram template ${template.id} for vehicle ${vehicleId}`);
      res.json(template);
    } catch (error) {
      console.error("Error finding matching diagram template:", error);
      res.status(500).json({ message: "Error finding matching diagram template" });
    }
  });

  // Create vehicle diagram template (with file upload)
  app.post("/api/vehicle-diagram-templates", requireAuth, diagramUpload.single('diagram'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Diagram image is required" });
      }
      
      // Post-upload validation - verify file content is actually an image
      const fileValidation = await validateAfterUpload(
        req.file.path,
        req.file.originalname,
        req.file.mimetype,
        'image'
      );
      if (!fileValidation.valid) {
        return res.status(400).json({ message: fileValidation.error });
      }
      
      const user = req.user;
      
      // Multer already saved the file to disk - just get the relative path
      const diagramPath = getRelativePath(req.file.path);
      console.log(`✅ Uploaded vehicle diagram to filesystem:`);
      console.log(`   Absolute path: ${req.file.path}`);
      console.log(`   Relative path: ${diagramPath}`);
      console.log(`   Uploads dir: ${uploadsDir}`);
      console.log(`   File exists: ${fs.existsSync(req.file.path)}`);
      
      const templateData = {
        make: req.body.make,
        model: req.body.model,
        yearFrom: req.body.yearFrom ? parseInt(req.body.yearFrom) : null,
        yearTo: req.body.yearTo ? parseInt(req.body.yearTo) : null,
        diagramPath: diagramPath, // Filesystem path (works everywhere)
        objectStorageKey: null, // Not using object storage anymore
        description: req.body.description || null,
        createdBy: user ? user.username : null,
        updatedBy: user ? user.username : null,
      };
      
      const created = await storage.createVehicleDiagramTemplate(templateData);
      
      res.status(201).json(created);
    } catch (error) {
      console.error("Error creating vehicle diagram template:", error);
      res.status(500).json({ message: "Error creating vehicle diagram template" });
    }
  });

  // Update vehicle diagram template
  app.patch("/api/vehicle-diagram-templates/:id", requireAuth, diagramUpload.single('diagram'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as Express.User | undefined;
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      let diagramPath = template.diagramPath; // Keep existing path by default
      
      // If a new diagram file was uploaded, handle it
      if (req.file) {
        // Post-upload validation - verify file content is actually an image
        const fileValidation = await validateAfterUpload(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          'image'
        );
        if (!fileValidation.valid) {
          return res.status(400).json({ message: fileValidation.error });
        }
        
        const uploadsDir = path.join(process.cwd(), 'uploads');
        const diagramsDir = path.join(uploadsDir, 'vehicle-diagrams');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(diagramsDir)) {
          fs.mkdirSync(diagramsDir, { recursive: true });
        }
        
        // Delete old diagram file if it exists
        if (template.diagramPath) {
          try {
            const oldFilePath = path.join(process.cwd(), template.diagramPath);
            if (fs.existsSync(oldFilePath)) {
              await fs.promises.unlink(oldFilePath);
              console.log(`✅ Deleted old diagram: ${template.diagramPath}`);
            }
          } catch (err) {
            console.error("Error deleting old diagram file:", err);
          }
        }
        
        // Move new file to diagrams directory
        const newFileName = `${req.body.make}-${req.body.model}-${Date.now()}${path.extname(req.file.originalname)}`;
        const newFilePath = path.join(diagramsDir, newFileName);
        await fs.promises.rename(req.file.path, newFilePath);
        diagramPath = `uploads/vehicle-diagrams/${newFileName}`;
      }
      
      const updateData = {
        make: req.body.make,
        model: req.body.model,
        yearFrom: req.body.yearFrom ? parseInt(req.body.yearFrom) : null,
        yearTo: req.body.yearTo ? parseInt(req.body.yearTo) : null,
        diagramPath: diagramPath,
        description: req.body.description || null,
        updatedBy: user ? user.username : null,
      };
      
      const updated = await storage.updateVehicleDiagramTemplate(id, updateData);
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating vehicle diagram template:", error);
      res.status(500).json({ message: "Error updating vehicle diagram template" });
    }
  });

  // Delete vehicle diagram template
  app.delete("/api/vehicle-diagram-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      // First, unlink this template from any damage checks that reference it
      await storage.unlinkDiagramTemplateFromDamageChecks(id);
      
      // Delete the diagram file from filesystem
      if (template.diagramPath) {
        try {
          const filePath = path.join(process.cwd(), template.diagramPath);
          if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
            console.log(`✅ Deleted vehicle diagram: ${template.diagramPath}`);
          }
        } catch (err) {
          console.error("Error deleting diagram file:", err);
        }
      }
      
      const deleted = await storage.deleteVehicleDiagramTemplate(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vehicle diagram template:", error);
      res.status(500).json({ message: "Error deleting vehicle diagram template" });
    }
  });

  // Serve vehicle diagram template image
  app.get("/api/vehicle-diagram-templates/:id/image", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const template = await storage.getVehicleDiagramTemplate(id);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      if (!template.diagramPath) {
        console.log(`❌ Template ${id} has no diagramPath`);
        return res.status(404).json({ message: "No diagram image available" });
      }
      
      const filePath = path.join(process.cwd(), template.diagramPath);
      console.log(`📁 Serving diagram template ${id}:`);
      console.log(`   Stored path: ${template.diagramPath}`);
      console.log(`   Resolved path: ${filePath}`);
      console.log(`   File exists: ${fs.existsSync(filePath)}`);
      console.log(`   Current working dir: ${process.cwd()}`);
      console.log(`   Uploads dir: ${uploadsDir}`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`❌ File not found at: ${filePath}`);
        return res.status(404).json({ message: "Diagram image not found" });
      }
      
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving diagram template image:", error);
      res.status(500).json({ message: "Error serving diagram image" });
    }
  });
}
