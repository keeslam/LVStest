CREATE TABLE "active_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "active_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text,
	"action" text NOT NULL,
	"resource_type" text,
	"resource_id" text,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"status" text DEFAULT 'success' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"storage_type" text DEFAULT 'object_storage' NOT NULL,
	"local_path" text,
	"enable_auto_backup" boolean DEFAULT true NOT NULL,
	"backup_schedule" text DEFAULT '0 2 * * *' NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "custom_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"link" text DEFAULT '',
	"icon" text DEFAULT 'Bell',
	"priority" text DEFAULT 'normal',
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"debtor_number" text,
	"first_name" text,
	"last_name" text,
	"company_name" text,
	"driver_name" text,
	"contact_person" text,
	"email" text,
	"email_for_mot" text,
	"email_for_invoices" text,
	"email_general" text,
	"phone" text,
	"driver_phone" text,
	"street_name" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"country" text DEFAULT 'Nederland',
	"driver_license_number" text,
	"chamber_of_commerce_number" text,
	"rsin" text,
	"vat_number" text,
	"status" text,
	"status_date" text,
	"status_by" text,
	"notes" text,
	"preferred_language" text DEFAULT 'nl' NOT NULL,
	"customer_type" text DEFAULT 'business' NOT NULL,
	"account_manager" text,
	"billing_address" text,
	"billing_city" text,
	"billing_postal_code" text,
	"corporate_discount" numeric,
	"payment_term_days" integer DEFAULT 30,
	"credit_limit" numeric,
	"primary_contact_name" text,
	"primary_contact_email" text,
	"primary_contact_phone" text,
	"secondary_contact_name" text,
	"secondary_contact_email" text,
	"secondary_contact_phone" text,
	"billing_contact_name" text,
	"billing_contact_email" text,
	"billing_contact_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "damage_check_pdf_section_presets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"category" text,
	"is_built_in" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_check_pdf_template_themes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"palette" jsonb NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_check_pdf_template_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"sections" jsonb NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "damage_check_pdf_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sections" jsonb NOT NULL,
	"page_margins" integer DEFAULT 15 NOT NULL,
	"page_orientation" text DEFAULT 'portrait',
	"page_size" text DEFAULT 'A4',
	"custom_page_width" integer,
	"custom_page_height" integer,
	"page_count" integer DEFAULT 1,
	"tags" text[],
	"category" text,
	"theme_id" integer,
	"background_image" text,
	"usage_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "damage_check_template_backgrounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"background_path" text NOT NULL,
	"preview_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_check_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_type" text,
	"build_year_from" text,
	"build_year_to" text,
	"background_path" text,
	"background_preview_path" text,
	"template_preview_path" text,
	"inspection_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"handover_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"header_text" text,
	"footer_text" text,
	"canvas_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"language" text DEFAULT 'nl' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "delivery_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"reservation_id" integer NOT NULL,
	"type" text NOT NULL,
	"delivery_address" text NOT NULL,
	"delivery_city" text,
	"delivery_postal_code" text,
	"delivery_latitude" numeric,
	"delivery_longitude" numeric,
	"pickup_address" text,
	"pickup_city" text,
	"pickup_postal_code" text,
	"pickup_latitude" numeric,
	"pickup_longitude" numeric,
	"scheduled_delivery_time" timestamp,
	"scheduled_pickup_time" timestamp,
	"estimated_delivery_time" timestamp,
	"estimated_pickup_time" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"delivery_completed_at" timestamp,
	"pickup_completed_at" timestamp,
	"assigned_staff_id" integer,
	"assigned_staff_name" text,
	"delivery_photo_path" text,
	"delivery_signature_path" text,
	"delivery_mileage" integer,
	"pickup_photo_path" text,
	"pickup_signature_path" text,
	"pickup_mileage" integer,
	"delivery_fee" numeric,
	"pickup_fee" numeric,
	"distance_km" numeric,
	"delivery_notes" text,
	"pickup_notes" text,
	"customer_instructions" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer,
	"reservation_id" integer,
	"document_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"upload_date" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"created_by" text,
	"updated_by" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"driver_license_number" text,
	"license_expiry" text,
	"license_origin" text,
	"license_document_id" integer,
	"license_file_path" text,
	"is_primary_driver" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"preferred_language" text DEFAULT 'nl',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"subject" text NOT NULL,
	"recipients" integer NOT NULL,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"emails_failed" integer DEFAULT 0 NOT NULL,
	"failure_reason" text,
	"vehicle_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text,
	"last_used" text
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"category" text NOT NULL,
	"amount" numeric NOT NULL,
	"date" text NOT NULL,
	"description" text,
	"receipt_url" text,
	"receipt_file" text,
	"receipt_file_path" text,
	"receipt_file_size" integer,
	"receipt_content_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "interactive_damage_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"reservation_id" integer,
	"check_type" text NOT NULL,
	"check_date" timestamp NOT NULL,
	"diagram_template_id" integer,
	"damage_markers" text,
	"drawing_paths" text,
	"diagram_with_annotations" text,
	"checklist_data" text,
	"notes" text,
	"mileage" integer,
	"fuel_level" text,
	"renter_signature" text,
	"customer_signature" text,
	"completed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"success" boolean NOT NULL,
	"failure_reason" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"background_path" text,
	"background_preview_path" text,
	"template_preview_path" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"fields" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer,
	"customer_id" integer,
	"driver_id" integer,
	"start_date" text NOT NULL,
	"end_date" text,
	"start_time" text,
	"end_time" text,
	"actual_pickup_date" text,
	"actual_return_date" text,
	"completion_date" text,
	"status" text DEFAULT 'booked' NOT NULL,
	"total_price" numeric,
	"notes" text,
	"damage_check_path" text,
	"contract_number" text,
	"type" text DEFAULT 'standard' NOT NULL,
	"replacement_for_reservation_id" integer,
	"placeholder_spare" boolean DEFAULT false NOT NULL,
	"spare_vehicle_status" text DEFAULT 'assigned',
	"maintenance_duration" integer,
	"maintenance_status" text,
	"maintenance_category" text,
	"spare_assignment_decision" text,
	"affected_rental_id" integer,
	"pickup_mileage" integer,
	"return_mileage" integer,
	"fuel_level_pickup" text,
	"fuel_level_return" text,
	"fuel_cost" numeric,
	"fuel_card_number" text,
	"fuel_notes" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_parent_id" integer,
	"recurring_frequency" text,
	"recurring_end_date" text,
	"recurring_day_of_week" integer,
	"recurring_day_of_month" integer,
	"delivery_required" boolean DEFAULT false NOT NULL,
	"delivery_address" text,
	"delivery_city" text,
	"delivery_postal_code" text,
	"delivery_fee" numeric,
	"delivery_status" text,
	"delivery_staff_id" integer,
	"delivery_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer,
	"deleted_at" timestamp,
	"deleted_by" text,
	"deleted_by_user_id" integer,
	CONSTRAINT "reservations_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"data_source" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"group_by" jsonb DEFAULT '[]'::jsonb,
	"order_by" jsonb DEFAULT '[]'::jsonb,
	"calculations" jsonb DEFAULT '[]'::jsonb,
	"visualization_type" text DEFAULT 'table',
	"chart_config" jsonb DEFAULT '{}'::jsonb,
	"is_scheduled" boolean DEFAULT false NOT NULL,
	"schedule_frequency" text,
	"schedule_day_of_week" integer,
	"schedule_day_of_month" integer,
	"schedule_time" text,
	"email_recipients" jsonb DEFAULT '[]'::jsonb,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"is_public" boolean DEFAULT false NOT NULL,
	"shared_with_users" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"created_by_user_id" integer,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_number_start" integer DEFAULT 1 NOT NULL,
	"contract_number_override" integer,
	"maintenance_excluded_statuses" text[] DEFAULT '{"not_for_rental"}',
	"show_apk_reminders" boolean DEFAULT true NOT NULL,
	"apk_reminder_days" integer DEFAULT 30 NOT NULL,
	"show_warranty_reminders" boolean DEFAULT true NOT NULL,
	"warranty_reminder_days" integer DEFAULT 30 NOT NULL,
	"show_maintenance_blocks" boolean DEFAULT true NOT NULL,
	"toll_rate_per_km" numeric DEFAULT '0.15' NOT NULL,
	"depot_address" text,
	"depot_city" text,
	"depot_postal_code" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "template_backgrounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"background_path" text NOT NULL,
	"preview_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_report_template_backgrounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"background_path" text NOT NULL,
	"preview_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transport_report_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"background_path" text,
	"background_preview_path" text,
	"template_preview_path" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"fields" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"full_name" text,
	"email" text,
	"role" text DEFAULT 'user' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"hide_prices" boolean DEFAULT false NOT NULL,
	"mileage_override_password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "vehicle_customer_blacklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "vehicle_diagram_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year_from" integer,
	"year_to" integer,
	"diagram_path" text,
	"object_storage_key" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "vehicle_transports" (
	"id" serial PRIMARY KEY NOT NULL,
	"vehicle_id" integer NOT NULL,
	"related_vehicle_id" integer,
	"reservation_id" integer,
	"customer_id" integer,
	"transport_type" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"origin_address" text,
	"origin_city" text,
	"destination_address" text,
	"destination_city" text,
	"distance_km" numeric,
	"toll_cost" numeric,
	"is_breakdown_or_maintenance" boolean DEFAULT false NOT NULL,
	"billable" boolean DEFAULT false NOT NULL,
	"billable_amount" numeric,
	"invoiced" boolean DEFAULT false NOT NULL,
	"invoiced_date" text,
	"scheduled_date" text NOT NULL,
	"completed_date" text,
	"driver_name" text,
	"reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_by_user_id" integer,
	"updated_by_user_id" integer
);
--> statement-breakpoint
CREATE TABLE "vehicle_waitlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"vehicle_id" integer,
	"vehicle_type" text,
	"preferred_start_date" text NOT NULL,
	"preferred_end_date" text,
	"duration" integer,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"contacted_at" timestamp,
	"fulfilled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_plate" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"vehicle_type" text,
	"chassis_number" text,
	"fuel" text,
	"ad_blue" boolean,
	"euro_zone" text,
	"euro_zone_end_date" text,
	"euro_zone_access" boolean,
	"euro_zone_paid_permit_access" boolean,
	"move_izi_registered" boolean,
	"move_izi_registration_date" text,
	"move_izi_expiration_date" text,
	"internal_appointments" text,
	"apk_date" text,
	"company" text,
	"company_date" text,
	"company_by" text,
	"registered_to" text,
	"registered_to_date" text,
	"registered_to_by" text,
	"production_date" text,
	"gps" boolean,
	"imei" text,
	"gps_swapped" boolean,
	"gps_activated" boolean,
	"monthly_price" numeric,
	"daily_price" numeric,
	"date_in" text,
	"date_out" text,
	"contract_number" text,
	"damage_check" boolean,
	"damage_check_date" text,
	"damage_check_attachment" text,
	"damage_check_attachment_date" text,
	"creation_date" text,
	"created_by" text,
	"updated_by" text,
	"departure_mileage" integer,
	"return_mileage" integer,
	"roadside_assistance" boolean,
	"spare_key" boolean,
	"spare_key_with_customer" boolean,
	"spare_key_customer_name" text,
	"remarks" text,
	"winter_tires" boolean,
	"tire_size" text,
	"wok_notification" boolean,
	"radio_code" text,
	"warranty_end_date" text,
	"seatcovers" boolean,
	"backupbeepers" boolean,
	"spare_tire" boolean,
	"tools_and_jack" boolean,
	"maintenance_status" text DEFAULT 'ok' NOT NULL,
	"maintenance_note" text,
	"current_mileage" integer,
	"last_service_date" text,
	"last_service_mileage" integer,
	"mileage_decreased_by" text,
	"mileage_decreased_at" timestamp,
	"previous_mileage" integer,
	"current_fuel_level" varchar,
	"fuel_refill_cost" numeric(10, 2),
	"fuel_refill_receipt" text,
	"fuel_refill_notes" text,
	"fuel_refill_date" timestamp,
	"recommended_oil" text,
	"availability_status" text DEFAULT 'available' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_license_plate_unique" UNIQUE("license_plate")
);
--> statement-breakpoint
ALTER TABLE "active_sessions" ADD CONSTRAINT "active_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_notifications" ADD CONSTRAINT "custom_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_check_pdf_template_versions" ADD CONSTRAINT "damage_check_pdf_template_versions_template_id_damage_check_pdf_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."damage_check_pdf_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_check_template_backgrounds" ADD CONSTRAINT "damage_check_template_backgrounds_template_id_damage_check_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."damage_check_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_assigned_staff_id_users_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_license_document_id_documents_id_fk" FOREIGN KEY ("license_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactive_damage_checks" ADD CONSTRAINT "interactive_damage_checks_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactive_damage_checks" ADD CONSTRAINT "interactive_damage_checks_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactive_damage_checks" ADD CONSTRAINT "interactive_damage_checks_diagram_template_id_vehicle_diagram_templates_id_fk" FOREIGN KEY ("diagram_template_id") REFERENCES "public"."vehicle_diagram_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_delivery_staff_id_users_id_fk" FOREIGN KEY ("delivery_staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_deleted_by_user_id_users_id_fk" FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_backgrounds" ADD CONSTRAINT "template_backgrounds_template_id_pdf_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pdf_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transport_report_template_backgrounds" ADD CONSTRAINT "transport_report_template_backgrounds_template_id_transport_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."transport_report_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_customer_blacklist" ADD CONSTRAINT "vehicle_customer_blacklist_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_customer_blacklist" ADD CONSTRAINT "vehicle_customer_blacklist_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_customer_blacklist" ADD CONSTRAINT "vehicle_customer_blacklist_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transports" ADD CONSTRAINT "vehicle_transports_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transports" ADD CONSTRAINT "vehicle_transports_related_vehicle_id_vehicles_id_fk" FOREIGN KEY ("related_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transports" ADD CONSTRAINT "vehicle_transports_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transports" ADD CONSTRAINT "vehicle_transports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transports" ADD CONSTRAINT "vehicle_transports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_transports" ADD CONSTRAINT "vehicle_transports_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_waitlist" ADD CONSTRAINT "vehicle_waitlist_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_waitlist" ADD CONSTRAINT "vehicle_waitlist_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "damage_check_templates_only_one_default" ON "damage_check_templates" USING btree ("is_default") WHERE "damage_check_templates"."is_default" = true;--> statement-breakpoint
CREATE INDEX "documents_vehicle_id_idx" ON "documents" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "documents_reservation_id_idx" ON "documents" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "expenses_vehicle_id_idx" ON "expenses" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "expenses_created_at_idx" ON "expenses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "interactive_damage_checks_reservation_id_check_type_unique" ON "interactive_damage_checks" USING btree ("reservation_id","check_type");--> statement-breakpoint
CREATE INDEX "reservations_vehicle_id_idx" ON "reservations" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "reservations_customer_id_idx" ON "reservations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservations_start_date_idx" ON "reservations" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "reservations_end_date_idx" ON "reservations" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "reservations_deleted_at_idx" ON "reservations" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "reservations_status_start_date_idx" ON "reservations" USING btree ("status","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_customer_blacklist_unique" ON "vehicle_customer_blacklist" USING btree ("vehicle_id","customer_id");--> statement-breakpoint
CREATE INDEX "vehicle_transports_vehicle_id_idx" ON "vehicle_transports" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_transports_status_idx" ON "vehicle_transports" USING btree ("status");