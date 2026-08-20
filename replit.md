# Car Rental Management System

## Overview
This is a comprehensive car rental management system offering full management of vehicles, customers, reservations, expenses, and documents. It features a dashboard for key metrics, calendar views for reservations, and extensive reporting. The system includes a damage check template editor, a simplified one-button backup system, auto-logout security, advanced reporting with a custom report builder, maintenance cost analysis, and a complete multi-driver management system. The project aims to provide a robust and user-friendly platform for efficient car rental operations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter
- **UI Components**: Shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS
- **Form Handling**: React Hook Form with Zod validation
- **Build Tool**: Vite

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication**: Passport.js (local strategy, session-based)
- **Database ORM**: Drizzle ORM
- **File Handling**: Multer (local storage)
- **PDF Generation**: pdf-lib
- **Session Storage**: PostgreSQL session store with connect-pg-simple

### Database Design
- **Primary Database**: PostgreSQL (Neon serverless)
- **Schema Management**: Safe migration system using `startup-migration.js`
- **Migration Safety**: 
  - **NEVER use `npm run db:push` in production** - it drops and recreates tables, causing complete data loss
  - Use `startup-migration.js` for safe schema changes - it runs automatically on deployment via `nixpacks.toml`
  - Safe migrations use `ALTER TABLE` to add columns without data loss
  - All deployments backfill data intelligently and add constraints safely
  - Deployment fails on any integrity issues (preventing unsafe states)
- **Core Tables**: users, vehicles, customers, reservations, expenses, documents, pdf_templates, custom_notifications, damage_check_templates, saved_reports, whatsapp_messages, drivers, settings
- **Relationships**: Foreign keys link reservations to vehicles/customers, expenses to vehicles, documents to vehicles. Multiple drivers per customer.

### Authentication & Authorization
- **Authentication**: Username/password with bcrypt hashing
- **Session Management**: Express sessions with PostgreSQL store
- **Role-Based Access**: Admin, Manager, User, Cleaner, Viewer, Accountant, Maintenance roles with granular permissions.
- **Protection**: Route-level authentication middleware, Rate Limiting, CSRF Protection, Account Lockout, Session Management.
- **Security Features**: Audit Logging, Password History, Security Headers (Helmet.js), Input Sanitization (DOMPurify).

### File Management
- **Upload Handling**: Local file system storage in `uploads` directory for documents, driver licenses, and vehicle diagrams.
- **Document Types**: Contracts, maintenance records, photos, receipts.
- **Vehicle Diagram Storage**: Filesystem storage in `uploads/vehicle-diagrams/` with a robust matching algorithm.
- **Template Background Storage**: Environment-aware storage (Object Storage on Replit, local filesystem elsewhere).

### Data Validation
- **Schema Validation**: Zod schemas (shared between frontend/backend).
- **Form Validation**: Client-side with server-side verification.
- **Type Safety**: Full TypeScript coverage.

### Key Features and Implementations
- **Damage Check Template Editor**: Customizable inspection templates (Dutch format) with vehicle diagram support, multi-column layouts, and JSON storage for inspection points.
- **Damage Check PDF Generation**: Automated PDF generation service from templates, integrating reservation and customer data, with multi-page support and intelligent template matching.
- **Reservation Damage Check Integration**: Direct damage check generation from reservation workflow, saving versioned documents linked to reservations and vehicles.
- **PDF Template Editor with Driver Data Support**: Template editor includes driver information fields for dynamic population in PDFs.
- **Backup System**: One-click database (SQL) and application code (tar.gz) download with recovery instructions.
- **Auto-Logout**: Inactivity detection logs users out after 2 minutes.
- **Custom Report Builder**: Drag-and-drop interface for creating custom reports.
- **WhatsApp Messaging Dashboard**: Foundation for customer conversations and sending capabilities.
- **Vehicle Delivery/Pickup Service**: Delivery options in reservations with fee calculation and tracking.
- **Maintenance Cost Analysis**: Dashboard with cost breakdown, charts, and trend analysis.
- **Maintenance History Tracking**: Comprehensive history section in vehicle details.
- **Multi-Driver Management**: Separate drivers table, association with customers, reservation assignment, and license upload.
- **Document Management**: Reservation-specific document uploads.
- **Fuel Management**: Pickup/return fuel levels, cost tracking, and fuel card fields.
- **Corporate Customer Features**: Business/individual types, billing contacts, corporate discounts.
- **Email Templates**: Multi-language support for customer communications and smart template selection based on document types.
- **Completed Rentals Management**: Calendar filtering to show only active rentals, with a separate dialog for viewing and managing completed rentals (revert/delete functionality).
- **English-Only Interface**: Internal staff interface is English-only.
- **Four-Tier Vehicle Availability System**: Comprehensive status tracking with four states: `available` (ready for rental), `needs_fixing` (in workshop/repairs), `not_for_rental` (owned but not rented), and `rented` (currently rented). Status is displayed throughout the system with color-coded badges (green for available, yellow for needs fixing, gray for not for rental, blue for rented). This allows clear tracking of vehicle ownership, operational status, and rental availability.
- **Automatic BV→Opnaam Registration Conversion**: When creating or editing a reservation with a BV-registered vehicle, the system automatically converts it to Opnaam (personal registration). This ensures legal compliance, as BV vehicles cannot be driven (no insurance/road tax). Conversion happens on both frontend and backend with user notification.
- **Contract Number Management**: Contract numbers are assigned at pickup time through the status-change dialog. When transitioning a reservation from "booked" to "picked_up", the contract number field is required and validated. Contract numbers are preserved when editing already-picked-up reservations, preventing data loss. Contract numbers are displayed in reservation forms, view dialogs, and integrated into PDF generation as {{contractNumber}} variable. The system includes database-level constraints to ensure data integrity. The `contract_number` column is **nullable** to allow reservation creation without contract numbers (assigned later during pickup). When a reservation is soft-deleted, its contract number is cleared (set to NULL) to free it up for reuse.
- **Safe Deployment System**: Production deployments run `startup-migration.js` automatically (configured in `nixpacks.toml`) to safely add new columns and backfill data without data loss. The system prevents unsafe deployments by failing if duplicates are detected or constraints cannot be added.
- **Vehicle-Customer Blacklist System**: Allows blocking specific customers from renting specific vehicles. Managed through Vehicle Details (Reservations tab) where staff can add/remove customers from a vehicle's blacklist with optional reason. Blacklist information is visible in Customer Details (Personal tab) showing blocked vehicles. When creating or editing reservations, blacklisted vehicles are automatically filtered from the vehicle dropdown when a customer is selected, and blacklisted customers are filtered from the customer dropdown when a vehicle is selected. This prevents any accidental booking of restricted vehicle-customer combinations.

## External Dependencies

### Database Services
- **Neon PostgreSQL**: Serverless PostgreSQL database.

### UI Component Libraries
- **Radix UI**: Headless component primitives.
- **Lucide React**: Icon library.
- **Recharts**: Charting library.
- **Date-fns**: Date manipulation utilities.

### Development Tools
- **Drizzle Kit**: Database schema management.
- **ESBuild**: Bundling for production.
- **TSX**: TypeScript execution for development.

### Third-Party APIs
- **RDW API**: Dutch vehicle registration authority.

### Deployment Infrastructure
- **PM2**: Process management.
- **Nginx**: Reverse proxy and static file serving.
- **Node.js 18+**: Runtime environment.