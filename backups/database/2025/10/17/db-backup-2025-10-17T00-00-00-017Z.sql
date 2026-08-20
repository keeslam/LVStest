--
-- PostgreSQL database dump
--

-- Dumped from database version 16.9 (165f042)
-- Dumped by pg_dump version 16.9

-- Started on 2025-10-17 00:00:00 UTC

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.vehicle_waitlist DROP CONSTRAINT IF EXISTS vehicle_waitlist_vehicle_id_vehicles_id_fk;
ALTER TABLE IF EXISTS ONLY public.vehicle_waitlist DROP CONSTRAINT IF EXISTS vehicle_waitlist_customer_id_customers_id_fk;
ALTER TABLE IF EXISTS ONLY public.reservations DROP CONSTRAINT IF EXISTS reservations_updated_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.reservations DROP CONSTRAINT IF EXISTS reservations_driver_id_drivers_id_fk;
ALTER TABLE IF EXISTS ONLY public.reservations DROP CONSTRAINT IF EXISTS reservations_deleted_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.reservations DROP CONSTRAINT IF EXISTS reservations_created_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.extension_requests DROP CONSTRAINT IF EXISTS extension_requests_vehicle_id_vehicles_id_fk;
ALTER TABLE IF EXISTS ONLY public.extension_requests DROP CONSTRAINT IF EXISTS extension_requests_reviewed_by_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.extension_requests DROP CONSTRAINT IF EXISTS extension_requests_reservation_id_reservations_id_fk;
ALTER TABLE IF EXISTS ONLY public.extension_requests DROP CONSTRAINT IF EXISTS extension_requests_customer_id_customers_id_fk;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_updated_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_created_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_updated_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_license_document_id_documents_id_fk;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_customer_id_customers_id_fk;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_created_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_updated_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_created_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_updated_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_created_by_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.customer_users DROP CONSTRAINT IF EXISTS customer_users_customer_id_customers_id_fk;
ALTER TABLE IF EXISTS ONLY public.custom_notifications DROP CONSTRAINT IF EXISTS custom_notifications_user_id_users_id_fk;
DROP INDEX IF EXISTS public."IDX_session_expire";
ALTER TABLE IF EXISTS ONLY public.vehicles DROP CONSTRAINT IF EXISTS vehicles_pkey;
ALTER TABLE IF EXISTS ONLY public.vehicles DROP CONSTRAINT IF EXISTS vehicles_license_plate_unique;
ALTER TABLE IF EXISTS ONLY public.vehicle_waitlist DROP CONSTRAINT IF EXISTS vehicle_waitlist_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_username_unique;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.session DROP CONSTRAINT IF EXISTS session_pkey;
ALTER TABLE IF EXISTS ONLY public.reservations DROP CONSTRAINT IF EXISTS reservations_pkey;
ALTER TABLE IF EXISTS ONLY public.pdf_templates DROP CONSTRAINT IF EXISTS pdf_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.extension_requests DROP CONSTRAINT IF EXISTS extension_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.expenses DROP CONSTRAINT IF EXISTS expenses_pkey;
ALTER TABLE IF EXISTS ONLY public.email_templates DROP CONSTRAINT IF EXISTS email_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.email_logs DROP CONSTRAINT IF EXISTS email_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.drivers DROP CONSTRAINT IF EXISTS drivers_pkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE IF EXISTS ONLY public.customers DROP CONSTRAINT IF EXISTS customers_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_users DROP CONSTRAINT IF EXISTS customer_users_pkey;
ALTER TABLE IF EXISTS ONLY public.customer_users DROP CONSTRAINT IF EXISTS customer_users_email_unique;
ALTER TABLE IF EXISTS ONLY public.customer_users DROP CONSTRAINT IF EXISTS customer_users_customer_id_unique;
ALTER TABLE IF EXISTS ONLY public.custom_notifications DROP CONSTRAINT IF EXISTS custom_notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.backup_settings DROP CONSTRAINT IF EXISTS backup_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings DROP CONSTRAINT IF EXISTS app_settings_key_unique;
ALTER TABLE IF EXISTS public.vehicles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.vehicle_waitlist ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.reservations ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.pdf_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.extension_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.expenses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.email_templates ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.email_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.drivers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.documents ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customers ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.customer_users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.custom_notifications ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.backup_settings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.app_settings ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.vehicles_id_seq;
DROP TABLE IF EXISTS public.vehicles;
DROP SEQUENCE IF EXISTS public.vehicle_waitlist_id_seq;
DROP TABLE IF EXISTS public.vehicle_waitlist;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.session;
DROP SEQUENCE IF EXISTS public.reservations_id_seq;
DROP TABLE IF EXISTS public.reservations;
DROP SEQUENCE IF EXISTS public.pdf_templates_id_seq;
DROP TABLE IF EXISTS public.pdf_templates;
DROP SEQUENCE IF EXISTS public.extension_requests_id_seq;
DROP TABLE IF EXISTS public.extension_requests;
DROP SEQUENCE IF EXISTS public.expenses_id_seq;
DROP TABLE IF EXISTS public.expenses;
DROP SEQUENCE IF EXISTS public.email_templates_id_seq;
DROP TABLE IF EXISTS public.email_templates;
DROP SEQUENCE IF EXISTS public.email_logs_id_seq;
DROP TABLE IF EXISTS public.email_logs;
DROP SEQUENCE IF EXISTS public.drivers_id_seq;
DROP TABLE IF EXISTS public.drivers;
DROP SEQUENCE IF EXISTS public.documents_id_seq;
DROP TABLE IF EXISTS public.documents;
DROP SEQUENCE IF EXISTS public.customers_id_seq;
DROP TABLE IF EXISTS public.customers;
DROP SEQUENCE IF EXISTS public.customer_users_id_seq;
DROP TABLE IF EXISTS public.customer_users;
DROP SEQUENCE IF EXISTS public.custom_notifications_id_seq;
DROP TABLE IF EXISTS public.custom_notifications;
DROP SEQUENCE IF EXISTS public.backup_settings_id_seq;
DROP TABLE IF EXISTS public.backup_settings;
DROP SEQUENCE IF EXISTS public.app_settings_id_seq;
DROP TABLE IF EXISTS public.app_settings;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 215 (class 1259 OID 327680)
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text
);


--
-- TOC entry 216 (class 1259 OID 327689)
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3588 (class 0 OID 0)
-- Dependencies: 216
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- TOC entry 217 (class 1259 OID 327690)
-- Name: backup_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_settings (
    id integer NOT NULL,
    storage_type text DEFAULT 'object_storage'::text NOT NULL,
    local_path text,
    enable_auto_backup boolean DEFAULT true NOT NULL,
    backup_schedule text DEFAULT '0 2 * * *'::text NOT NULL,
    retention_days integer DEFAULT 30 NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text
);


--
-- TOC entry 218 (class 1259 OID 327702)
-- Name: backup_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3589 (class 0 OID 0)
-- Dependencies: 218
-- Name: backup_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.backup_settings_id_seq OWNED BY public.backup_settings.id;


--
-- TOC entry 219 (class 1259 OID 327704)
-- Name: custom_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.custom_notifications (
    id integer NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    date text NOT NULL,
    type text DEFAULT 'custom'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    link text DEFAULT ''::text,
    icon text DEFAULT 'Bell'::text,
    priority text DEFAULT 'normal'::text,
    user_id integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 220 (class 1259 OID 327716)
-- Name: custom_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.custom_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3590 (class 0 OID 0)
-- Dependencies: 220
-- Name: custom_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.custom_notifications_id_seq OWNED BY public.custom_notifications.id;


--
-- TOC entry 221 (class 1259 OID 327717)
-- Name: customer_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_users (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    portal_enabled boolean DEFAULT true NOT NULL,
    last_login timestamp without time zone,
    password_reset_token text,
    password_reset_expires timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text
);


--
-- TOC entry 222 (class 1259 OID 327725)
-- Name: customer_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3591 (class 0 OID 0)
-- Dependencies: 222
-- Name: customer_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_users_id_seq OWNED BY public.customer_users.id;


--
-- TOC entry 223 (class 1259 OID 327726)
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id integer NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    address text,
    city text,
    postal_code text,
    country text DEFAULT 'Nederland'::text,
    driver_license_number text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    debtor_number text,
    first_name text,
    last_name text,
    company_name text,
    driver_name text,
    contact_person text,
    email_for_mot text,
    email_for_invoices text,
    email_general text,
    driver_phone text,
    street_name text,
    chamber_of_commerce_number text,
    rsin text,
    vat_number text,
    status text,
    status_date text,
    created_by text,
    updated_by text,
    created_by_user_id integer,
    updated_by_user_id integer,
    status_by text,
    preferred_language text DEFAULT 'nl'::text NOT NULL,
    customer_type text DEFAULT 'business'::text NOT NULL,
    account_manager text,
    billing_address text,
    billing_city text,
    billing_postal_code text,
    corporate_discount numeric,
    payment_term_days integer DEFAULT 30,
    credit_limit numeric,
    primary_contact_name text,
    primary_contact_email text,
    primary_contact_phone text,
    secondary_contact_name text,
    secondary_contact_email text,
    secondary_contact_phone text,
    billing_contact_name text,
    billing_contact_email text,
    billing_contact_phone text
);


--
-- TOC entry 224 (class 1259 OID 327737)
-- Name: customers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3592 (class 0 OID 0)
-- Dependencies: 224
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_id_seq OWNED BY public.customers.id;


--
-- TOC entry 225 (class 1259 OID 327738)
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    vehicle_id integer NOT NULL,
    document_type text NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size integer NOT NULL,
    content_type text NOT NULL,
    upload_date timestamp without time zone DEFAULT now() NOT NULL,
    notes text,
    created_by text,
    updated_by text,
    created_by_user_id integer,
    updated_by_user_id integer,
    reservation_id integer
);


--
-- TOC entry 226 (class 1259 OID 327744)
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3593 (class 0 OID 0)
-- Dependencies: 226
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- TOC entry 246 (class 1259 OID 344065)
-- Name: drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drivers (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    display_name text NOT NULL,
    first_name text,
    last_name text,
    email text,
    phone text,
    driver_license_number text,
    license_expiry text,
    license_document_id integer,
    is_primary_driver boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    preferred_language text DEFAULT 'nl'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text,
    created_by_user_id integer,
    updated_by_user_id integer,
    license_file_path text
);


--
-- TOC entry 245 (class 1259 OID 344064)
-- Name: drivers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.drivers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3594 (class 0 OID 0)
-- Dependencies: 245
-- Name: drivers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.drivers_id_seq OWNED BY public.drivers.id;


--
-- TOC entry 227 (class 1259 OID 327745)
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id integer NOT NULL,
    template text NOT NULL,
    subject text NOT NULL,
    recipients integer NOT NULL,
    emails_sent integer DEFAULT 0 NOT NULL,
    emails_failed integer DEFAULT 0 NOT NULL,
    failure_reason text,
    vehicle_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    sent_at text NOT NULL
);


--
-- TOC entry 228 (class 1259 OID 327753)
-- Name: email_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3595 (class 0 OID 0)
-- Dependencies: 228
-- Name: email_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_logs_id_seq OWNED BY public.email_logs.id;


--
-- TOC entry 229 (class 1259 OID 327754)
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id integer NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    created_at text NOT NULL,
    updated_at text,
    last_used text,
    category text DEFAULT 'custom'::text NOT NULL
);


--
-- TOC entry 230 (class 1259 OID 327760)
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3596 (class 0 OID 0)
-- Dependencies: 230
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- TOC entry 231 (class 1259 OID 327761)
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id integer NOT NULL,
    vehicle_id integer NOT NULL,
    category text NOT NULL,
    amount numeric NOT NULL,
    date text NOT NULL,
    description text,
    receipt_url text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    receipt_file text,
    receipt_file_path text,
    receipt_file_size integer,
    receipt_content_type text,
    created_by text,
    updated_by text,
    created_by_user_id integer,
    updated_by_user_id integer
);


--
-- TOC entry 232 (class 1259 OID 327768)
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expenses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3597 (class 0 OID 0)
-- Dependencies: 232
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- TOC entry 233 (class 1259 OID 327769)
-- Name: extension_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_requests (
    id integer NOT NULL,
    reservation_id integer NOT NULL,
    customer_id integer NOT NULL,
    vehicle_id integer,
    current_end_date text,
    requested_end_date text NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    staff_notes text,
    reviewed_by integer,
    reviewed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- TOC entry 234 (class 1259 OID 327777)
-- Name: extension_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.extension_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3598 (class 0 OID 0)
-- Dependencies: 234
-- Name: extension_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.extension_requests_id_seq OWNED BY public.extension_requests.id;


--
-- TOC entry 235 (class 1259 OID 327778)
-- Name: pdf_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pdf_templates (
    id integer NOT NULL,
    name text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    background_path text
);


--
-- TOC entry 236 (class 1259 OID 327787)
-- Name: pdf_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pdf_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3599 (class 0 OID 0)
-- Dependencies: 236
-- Name: pdf_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pdf_templates_id_seq OWNED BY public.pdf_templates.id;


--
-- TOC entry 237 (class 1259 OID 327788)
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id integer NOT NULL,
    vehicle_id integer,
    customer_id integer,
    start_date text NOT NULL,
    end_date text,
    status text DEFAULT 'pending'::text NOT NULL,
    total_price numeric,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    damage_check_path text,
    created_by text,
    updated_by text,
    created_by_user_id integer,
    updated_by_user_id integer,
    type text DEFAULT 'standard'::text NOT NULL,
    replacement_for_reservation_id integer,
    placeholder_spare boolean DEFAULT false NOT NULL,
    spare_vehicle_status text DEFAULT 'assigned'::text,
    deleted_at timestamp without time zone,
    deleted_by text,
    deleted_by_user_id integer,
    maintenance_duration integer,
    maintenance_status text,
    spare_assignment_decision text,
    affected_rental_id integer,
    fuel_level_pickup text,
    fuel_level_return text,
    fuel_cost numeric,
    fuel_card_number text,
    fuel_notes text,
    is_recurring boolean DEFAULT false NOT NULL,
    recurring_parent_id integer,
    recurring_frequency text,
    recurring_end_date text,
    recurring_day_of_week integer,
    recurring_day_of_month integer,
    driver_id integer,
    maintenance_category text
);


--
-- TOC entry 238 (class 1259 OID 327800)
-- Name: reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reservations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3600 (class 0 OID 0)
-- Dependencies: 238
-- Name: reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reservations_id_seq OWNED BY public.reservations.id;


--
-- TOC entry 247 (class 1259 OID 385024)
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- TOC entry 239 (class 1259 OID 327806)
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    full_name text,
    email text,
    role text DEFAULT 'user'::text NOT NULL,
    permissions jsonb DEFAULT '[]'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text
);


--
-- TOC entry 240 (class 1259 OID 327816)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3601 (class 0 OID 0)
-- Dependencies: 240
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 241 (class 1259 OID 327817)
-- Name: vehicle_waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_waitlist (
    id integer NOT NULL,
    customer_id integer NOT NULL,
    vehicle_id integer,
    vehicle_type text,
    preferred_start_date text NOT NULL,
    preferred_end_date text,
    duration integer,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    contacted_at timestamp without time zone,
    fulfilled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text,
    updated_by text
);


--
-- TOC entry 242 (class 1259 OID 327826)
-- Name: vehicle_waitlist_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehicle_waitlist_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3602 (class 0 OID 0)
-- Dependencies: 242
-- Name: vehicle_waitlist_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehicle_waitlist_id_seq OWNED BY public.vehicle_waitlist.id;


--
-- TOC entry 243 (class 1259 OID 327827)
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id integer NOT NULL,
    license_plate text NOT NULL,
    brand text NOT NULL,
    model text NOT NULL,
    vehicle_type text,
    chassis_number text,
    fuel text,
    ad_blue boolean,
    euro_zone text,
    euro_zone_end_date text,
    internal_appointments text,
    apk_date text,
    company text,
    company_date text,
    registered_to text,
    registered_to_date text,
    gps boolean,
    monthly_price numeric,
    daily_price numeric,
    date_in text,
    date_out text,
    contract_number text,
    damage_check boolean,
    damage_check_date text,
    damage_check_attachment text,
    damage_check_attachment_date text,
    creation_date text,
    created_by text,
    departure_mileage integer,
    return_mileage integer,
    roadside_assistance boolean,
    spare_key boolean,
    remarks text,
    winter_tires boolean,
    tire_size text,
    wok_notification boolean,
    radio_code text,
    warranty_end_date text,
    seatcovers boolean,
    backupbeepers boolean,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by text,
    company_by text,
    registered_to_by text,
    production_date text,
    imei text,
    maintenance_status text DEFAULT 'ok'::text NOT NULL,
    maintenance_note text,
    gps_swapped boolean,
    gps_activated boolean,
    spare_tire boolean,
    tools_and_jack boolean,
    current_mileage integer,
    last_service_date date,
    last_service_mileage integer
);


--
-- TOC entry 244 (class 1259 OID 327835)
-- Name: vehicles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehicles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- TOC entry 3603 (class 0 OID 0)
-- Dependencies: 244
-- Name: vehicles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehicles_id_seq OWNED BY public.vehicles.id;


--
-- TOC entry 3259 (class 2604 OID 327836)
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- TOC entry 3264 (class 2604 OID 327837)
-- Name: backup_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_settings ALTER COLUMN id SET DEFAULT nextval('public.backup_settings_id_seq'::regclass);


--
-- TOC entry 3272 (class 2604 OID 327838)
-- Name: custom_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_notifications ALTER COLUMN id SET DEFAULT nextval('public.custom_notifications_id_seq'::regclass);


--
-- TOC entry 3280 (class 2604 OID 327839)
-- Name: customer_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users ALTER COLUMN id SET DEFAULT nextval('public.customer_users_id_seq'::regclass);


--
-- TOC entry 3284 (class 2604 OID 327840)
-- Name: customers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN id SET DEFAULT nextval('public.customers_id_seq'::regclass);


--
-- TOC entry 3291 (class 2604 OID 327841)
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- TOC entry 3334 (class 2604 OID 344068)
-- Name: drivers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers ALTER COLUMN id SET DEFAULT nextval('public.drivers_id_seq'::regclass);


--
-- TOC entry 3293 (class 2604 OID 327842)
-- Name: email_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs ALTER COLUMN id SET DEFAULT nextval('public.email_logs_id_seq'::regclass);


--
-- TOC entry 3297 (class 2604 OID 327843)
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- TOC entry 3299 (class 2604 OID 327844)
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- TOC entry 3302 (class 2604 OID 327845)
-- Name: extension_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests ALTER COLUMN id SET DEFAULT nextval('public.extension_requests_id_seq'::regclass);


--
-- TOC entry 3306 (class 2604 OID 327846)
-- Name: pdf_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_templates ALTER COLUMN id SET DEFAULT nextval('public.pdf_templates_id_seq'::regclass);


--
-- TOC entry 3311 (class 2604 OID 327847)
-- Name: reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations ALTER COLUMN id SET DEFAULT nextval('public.reservations_id_seq'::regclass);


--
-- TOC entry 3319 (class 2604 OID 327848)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 3325 (class 2604 OID 327849)
-- Name: vehicle_waitlist id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_waitlist ALTER COLUMN id SET DEFAULT nextval('public.vehicle_waitlist_id_seq'::regclass);


--
-- TOC entry 3330 (class 2604 OID 327850)
-- Name: vehicles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles ALTER COLUMN id SET DEFAULT nextval('public.vehicles_id_seq'::regclass);


--
-- TOC entry 3550 (class 0 OID 327680)
-- Dependencies: 215
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_settings (id, key, value, category, description, created_at, updated_at, created_by, updated_by) FROM stdin;
10	gps_email_templates	{"swapMessage": "Beste GTM,\\n\\nHierbij verzoeken wij om een GPS module swap voor het volgende voertuig:\\n\\nVoertuig: {brand} {model}\\nKenteken: {licensePlate}\\nNieuwe IMEI: {imei}\\n\\nGraag deze nieuwe GPS module activeren.\\n\\nMet vriendelijke groet\\nAuto Lease Lam", "swapSubject": "GPS Wissel voor: {licensePlate}", "activationMessage": "Beste GTM,\\n\\nHierbij verzoeken wij om een GPS module activatie voor het volgende voertuig:\\n\\nVoertuig: {brand} {model}\\nKenteken: {licensePlate}\\nNieuwe IMEI: {imei}\\n\\nGraag deze nieuwe GPS module activeren.\\n\\nMet vriendelijke groet\\nAuto Lease Lam", "activationSubject": "GPS Activatie voor: {licensePlate}"}	gps	GPS email message templates	2025-10-02 19:05:09.104264	2025-10-02 19:05:09.104264	admin	admin
1	email_default	{"apiKey": "sdfsdfds", "purpose": "default", "fromName": "apk reminder auto lease lam", "provider": "smtp", "smtpHost": "mail.lamgroep.nl", "smtpPort": "465", "smtpUser": "receptie@lamgroep.nl", "fromEmail": "receptie@lamgroep.nl", "smtpPassword": "vE7IiU50Kk"}	email	Default/General configuration	2025-09-30 19:25:17.465351	2025-10-06 17:29:47.83	admin	admin
5	email_apk	{"apiKey": "", "purpose": "apk", "fromName": "Auto Lease Lam", "provider": "smtp", "smtpHost": "mail.lamgroep.nl", "smtpPort": "465", "smtpUser": "receptie@lamgroep.nl", "fromEmail": "receptie@lamgroep.nl", "smtpPassword": "vE7IiU50Kk"}	email	APK Reminders configuration	2025-10-01 20:48:58.403513	2025-10-01 20:48:58.403513	admin	admin
6	gps_recipient_email	{"email": "keeslam@live.nl"}	gps	GPS company recipient email address	2025-10-01 21:10:20.58473	2025-10-01 21:11:06.706	admin	admin
7	email_gps	{"apiKey": "", "purpose": "gps", "fromName": "Auto Lease Lam", "provider": "smtp", "smtpHost": "mail.lamgroep.nl", "smtpPort": "465", "smtpUser": "receptie@lamgroep.nl", "fromEmail": "receptie@lamgroep.nl", "smtpPassword": "vE7IiU50Kk"}	email	GPS/IEI Information configuration	2025-10-01 21:10:54.242737	2025-10-02 18:19:41.962	admin	admin
8	email_maintenance	{"apiKey": "", "purpose": "maintenance", "fromName": "Auto Lease Lam", "provider": "smtp", "smtpHost": "mail.lamgroep.nl", "smtpPort": "465", "smtpUser": "receptie@lamgroep.nl", "fromEmail": "receptie@lamgroep.nl", "smtpPassword": "vE7IiU50Kk"}	email	\N	2025-10-02 18:34:12.599176	2025-10-02 18:34:12.599176	\N	\N
9	email_custom	{"apiKey": "", "purpose": "custom", "fromName": "Auto Lease Lam", "provider": "smtp", "smtpHost": "mail.lamgroep.nl", "smtpPort": "465", "smtpUser": "receptie@lamgroep.nl", "fromEmail": "receptie@lamgroep.nl", "smtpPassword": "vE7IiU50Kk"}	email	\N	2025-10-02 18:34:12.599176	2025-10-02 18:34:12.599176	\N	\N
\.


--
-- TOC entry 3552 (class 0 OID 327690)
-- Dependencies: 217
-- Data for Name: backup_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.backup_settings (id, storage_type, local_path, enable_auto_backup, backup_schedule, retention_days, settings, created_at, updated_at, created_by, updated_by) FROM stdin;
1	local_filesystem	./backups	t	0 2 * * *	30	{}	2025-09-28 12:56:53.683133	2025-09-28 12:56:53.683133	admin	admin
\.


--
-- TOC entry 3554 (class 0 OID 327704)
-- Dependencies: 219
-- Data for Name: custom_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.custom_notifications (id, title, description, date, type, is_read, link, icon, priority, user_id, created_at, updated_at) FROM stdin;
29	Spare Vehicle Assignment Required	TBD spare vehicle needs assignment for 2025-10-17 - 2025-10-17	2025-10-17	spare_assignment	f	/dashboard	Car	high	\N	2025-10-06 18:56:22.323776	2025-10-06 18:56:22.323776
27	Portal Access Request	Cornelis Lam has requested customer portal access.\n\nEmail: info@autobedrijfberniss21e.nl\nPhone: +31623688106\nMessage: None	2025-10-06	info	f		Bell	normal	\N	2025-10-06 18:28:35.487041	2025-10-06 18:28:35.487041
28	Portal Access Request	qeqweae has requested customer portal access.\n\nEmail: ssddfsdfsdf@asdad.nl\nPhone: +31623688106\n\n⚠️ New customer - not in system yet	2025-10-06	info	f	/customers/new?email=ssddfsdfsdf%40asdad.nl&name=qeqweae&phone=%2B31623688106	Bell	normal	\N	2025-10-06 18:46:00.540895	2025-10-06 18:46:00.540895
30	Spare Vehicle Assignment Required	TBD spare vehicle needs assignment for 2025-10-30 - 2025-10-30	2025-10-30	spare_assignment	f	/dashboard	Car	high	\N	2025-10-16 18:21:10.251353	2025-10-16 18:21:10.251353
\.


--
-- TOC entry 3556 (class 0 OID 327717)
-- Dependencies: 221
-- Data for Name: customer_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customer_users (id, customer_id, email, password, portal_enabled, last_login, password_reset_token, password_reset_expires, created_at, updated_at, created_by, updated_by) FROM stdin;
1	2	keeslam@live.nl	433fed8101d4fcae0cbc393d411adabeed0087b3e397f4328a2bc7bbbb9bbd6f79b00a8b39e9f143557c881b8020797b4d22bd8eba495e5cfe301e7b6d485653.e7a43a5cfbcc1509a8b01989aa02ce54	t	2025-10-06 18:09:44.281	\N	\N	2025-10-05 16:30:45.465243	2025-10-06 18:44:52.52	\N	\N
2	1	Keeslam@live.nl	bdaeaec7c55520c5b2b772c5840ffe7f95de5966fd2cff870f5b9f61e56a085093d2d124c13739e5833d77bb4a94c1580fadd3c3c1989eab3d68c1647eaee380.a228586fdee815c065abb00e1a59c8a1	t	2025-10-06 18:50:50.394	\N	\N	2025-10-06 17:11:39.949069	2025-10-06 18:50:50.395	\N	\N
\.


--
-- TOC entry 3558 (class 0 OID 327726)
-- Dependencies: 223
-- Data for Name: customers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.customers (id, name, email, phone, address, city, postal_code, country, driver_license_number, notes, created_at, updated_at, debtor_number, first_name, last_name, company_name, driver_name, contact_person, email_for_mot, email_for_invoices, email_general, driver_phone, street_name, chamber_of_commerce_number, rsin, vat_number, status, status_date, created_by, updated_by, created_by_user_id, updated_by_user_id, status_by, preferred_language, customer_type, account_manager, billing_address, billing_city, billing_postal_code, corporate_discount, payment_term_days, credit_limit, primary_contact_name, primary_contact_email, primary_contact_phone, secondary_contact_name, secondary_contact_email, secondary_contact_phone, billing_contact_name, billing_contact_email, billing_contact_phone) FROM stdin;
8	conecta						Nederland			2025-05-05 22:11:37.583195	2025-05-05 22:11:37.583195		nenana															keeslam	keeslam	\N	\N	\N	nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
11	eeerrrr						Nederland			2025-05-05 22:18:36.356637	2025-05-05 22:18:36.356637		reer	rere														keeslam	keeslam	\N	\N	\N	nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
3	joop lam	joop@joop.nl	56456465456	sdfsdf	Brielle	3232ar	Nederland		hij valt op mannenasd	2025-05-03 17:07:54.77479	2025-05-03 17:07:54.77479		1	lam															admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
9	jan jansen						Nederland			2025-05-05 22:14:20.266705	2025-05-05 22:14:20.266705		jan	jansen	haven2													keeslam	admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
7	keessss11223			asd	arnhem	2656gr	Nederland			2025-05-04 14:43:58.592367	2025-05-04 14:43:58.592367	256	Cornelis	Lam		john						straat33						admin	admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
6	swwws1	keeslam@live.nl		sdfsdf	Rotterdam	3232ar	Nederland			2025-05-03 23:19:10.0887	2025-05-03 23:19:10.0887		ssw	swws1				keeslam@live.nl				ssww						admin	admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
2	Cornelis Lam2	keeslam@live.nl	213123123	sdfsdf	Brielle	3232ar	NL	31232131		2025-05-03 13:57:41.429871	2025-05-03 13:57:41.429871		Cornelis	dasd		asd		keeslam@live.nl	keeslam@live.nl	keeslam@live.nl									admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
1	keesss	keeslam12345@gmail.com	213123123	sdfsdf	Brielle	3232ar	NL	31232131		2025-05-02 23:25:48.404498	2025-05-02 23:25:48.404498				lamlaeaes			keeslam12345@gmail.com	keeslam12345@gmail.com	keeslam12345@gmail.com									admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
5	arierere233	as@live.nl	23432432	asd	Rotterdam	asd	Nederland			2025-05-03 18:20:44.87528	2025-05-03 18:20:44.87528	123	arie					asd@live.nl			123213123213								admin	\N	\N		nl	business	\N	\N	\N	\N	\N	30	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
4	pieter pitersenss	joop@joop.nl	56456465456	sdfsdf	Brielle	3232ar	Nederland		hij valt op mannen	2025-05-03 17:08:02.136085	2025-05-03 17:08:02.136085		pieter								34535435								admin	\N	\N		nl	business					\N	30	\N									
\.


--
-- TOC entry 3560 (class 0 OID 327738)
-- Dependencies: 225
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, vehicle_id, document_type, file_name, file_path, file_size, content_type, upload_date, notes, created_by, updated_by, created_by_user_id, updated_by_user_id, reservation_id) FROM stdin;
48	24	Damage Report	12XPDZ_Damage_Report_2025-05-04_1746353902161.pdf	uploads/12-XP-DZ/damage_report/12XPDZ_Damage_Report_2025-05-04_1746353902161.pdf	335694	application/pdf	2025-05-04 10:18:22.276066	Damage report uploaded from dashboard	admin	\N	\N	\N	\N
49	24	Damage Report	12XPDZ_Damage_Report_2025-05-04_1746353926136.pdf	uploads/12-XP-DZ/damage_report/12XPDZ_Damage_Report_2025-05-04_1746353926136.pdf	335694	application/pdf	2025-05-04 10:18:46.247102	\N	admin	\N	\N	\N	\N
50	24	Damage Report	12XPDZ_Damage_Report_2025-05-04_1746353943305.pdf	uploads/12-XP-DZ/damage_report/12XPDZ_Damage_Report_2025-05-04_1746353943305.pdf	335694	application/pdf	2025-05-04 10:19:03.416485	\N	admin	\N	\N	\N	\N
51	24	APK Inspection	12XPDZ_APK_Inspection_2025-05-04_1746353957771.pdf	uploads/12-XP-DZ/apk_inspection/12XPDZ_APK_Inspection_2025-05-04_1746353957771.pdf	335694	application/pdf	2025-05-04 10:19:17.884147	\N	admin	\N	\N	\N	\N
52	24	Damage Report	12XPDZ_Damage_Report_2025-05-04_1746354280438.pdf	uploads/12-XP-DZ/damage_report/12XPDZ_Damage_Report_2025-05-04_1746354280438.pdf	335694	application/pdf	2025-05-04 10:24:40.565476	\N	admin	\N	\N	\N	\N
53	24	Maintenance Record	12XPDZ_Maintenance_Record_2025-05-04_1746354344864.pdf	uploads/12-XP-DZ/maintenance_record/12XPDZ_Maintenance_Record_2025-05-04_1746354344864.pdf	335694	application/pdf	2025-05-04 10:25:44.978868	\N	admin	\N	\N	\N	\N
58	18	APK Inspection	R897RG_APK_Inspection_2025-05-04_1746372433668.pdf	uploads/R8-97-RG/apk_inspection/R897RG_APK_Inspection_2025-05-04_1746372433668.pdf	335694	application/pdf	2025-05-04 15:27:13.829609	\N	admin	\N	\N	\N	\N
63	3	APK Inspection	42GRS5_APK_Inspection_2025-05-05_1746404347090.pdf	uploads/42GRS5/apk_inspection/42GRS5_APK_Inspection_2025-05-05_1746404347090.pdf	335694	application/pdf	2025-05-05 00:19:07.227108	\N	admin	\N	\N	\N	\N
64	3	Contract	42GRS5_contract_20250505.pdf	uploads/contracts/42GRS5/42GRS5_contract_20250505.pdf	335694	application/pdf	2025-05-05 00:19:34.074219	\N	admin	\N	\N	\N	\N
65	3	Damage Report	42GRS5_Damage_Report_2025-05-05_1746404383344.pdf	uploads/42GRS5/damage_report/42GRS5_Damage_Report_2025-05-05_1746404383344.pdf	335694	application/pdf	2025-05-05 00:19:43.456876	\N	admin	\N	\N	\N	\N
66	3	Vehicle Photos	42GRS5_Vehicle_Photos_2025-05-05_1746404399431.pdf	uploads/42GRS5/vehicle_photos/42GRS5_Vehicle_Photos_2025-05-05_1746404399431.pdf	335694	application/pdf	2025-05-05 00:19:59.796672	\N	admin	\N	\N	\N	\N
67	3	Maintenance Record	42GRS5_Maintenance_Record_2025-05-05_1746404410803.pdf	uploads/42GRS5/maintenance_record/42GRS5_Maintenance_Record_2025-05-05_1746404410803.pdf	335694	application/pdf	2025-05-05 00:20:10.915836	\N	admin	\N	\N	\N	\N
68	21	Contract	4TVV22_contract_20250505.pdf	uploads/contracts/4TVV22/4TVV22_contract_20250505.pdf	308005	application/pdf	2025-05-05 00:22:02.786761	Rental contract for reservation #19 (04-05-2025 - 07-05-2025)	admin	\N	\N	\N	\N
69	22	Contract	R489ZD_contract_20250505.pdf	uploads/contracts/R489ZD/R489ZD_contract_20250505.pdf	308032	application/pdf	2025-05-05 00:28:32.91972	Rental contract for reservation #24 (04-05-2025 - 07-05-2025)	admin	\N	\N	\N	\N
70	16	Contract	40RKB4_contract_20250505.pdf	uploads/contracts/40RKB4/40RKB4_contract_20250505.pdf	308013	application/pdf	2025-05-05 00:35:28.33207	Rental contract for reservation #23 (05-05-2025 - 22-05-2025)	admin	\N	\N	\N	\N
71	1	Damage Report	XXLL20_Damage_Report_2025-05-05_1746405418419.pdf	uploads/XXLL20/damage_report/XXLL20_Damage_Report_2025-05-05_1746405418419.pdf	335694	application/pdf	2025-05-05 00:36:58.541533	Damage report uploaded from dashboard	admin	\N	\N	\N	\N
72	1	Damage Photo	XXLL20_Damage_Photo_2025-05-05_1746405420202.png	uploads/XXLL20/damage_photo/XXLL20_Damage_Photo_2025-05-05_1746405420202.png	45417	image/png	2025-05-05 00:37:00.316305	Damage photo uploaded from dashboard	admin	\N	\N	\N	\N
73	5	Damage Report	02NVX7_Damage_Report_2025-05-05_1746405955336.pdf	uploads/02NVX7/damage_report/02NVX7_Damage_Report_2025-05-05_1746405955336.pdf	335694	application/pdf	2025-05-05 00:45:55.4586	Damage report uploaded from dashboard	admin	\N	\N	\N	\N
74	5	Damage Photo	02NVX7_Damage_Photo_2025-05-05_1746405957091.png	uploads/02NVX7/damage_photo/02NVX7_Damage_Photo_2025-05-05_1746405957091.png	45417	image/png	2025-05-05 00:45:57.203351	Damage photo uploaded from dashboard	admin	\N	\N	\N	\N
75	5	Damage Check	rptProductCatalog.pdf	uploads/02NVX7/damage_checks/02NVX7_damage_check_2025-05-05_1746405996795.pdf	335694	application/pdf	2025-05-05 00:46:37.327803	Damage check for reservation from 2025-05-05 to 2025-05-08	admin	\N	\N	\N	\N
76	5	Contract	02NVX7_contract_20250505.pdf	uploads/contracts/02NVX7/02NVX7_contract_20250505.pdf	307986	application/pdf	2025-05-05 00:47:30.053786	Rental contract for reservation #26 (05-05-2025 - 08-05-2025)	admin	\N	\N	\N	\N
77	35	Damage Check	rptProductCatalog.pdf	uploads/65HVZ1/damage_checks/65HVZ1_damage_check_2025-05-06_1746484242994.pdf	335694	application/pdf	2025-05-05 22:30:43.504385	Damage check for reservation from 2025-05-06 to 2025-05-09	keeslam	\N	\N	\N	\N
79	3	Contract	42GRS5_contract_20250506.pdf	uploads/contracts/42GRS5/42GRS5_contract_20250506.pdf	307223	application/pdf	2025-05-06 07:18:50.752847	Rental contract for reservation #27 (06-05-2025 - 09-05-2025)	keeslam	\N	\N	\N	\N
83	23	Damage Check	kentekencard2024.pdf	uploads/R789RT/damage_checks/R789RT_damage_check_2025-10-08_1758412984329.pdf	62227	application/pdf	2025-09-21 00:03:04.798442	Damage check for reservation from 2025-10-08 to undefined	admin	\N	\N	\N	\N
84	21	Damage Report	4TVV22_Damage_Report_2025-09-21_1758458469473.PDF	uploads/4TVV22/damage_report/4TVV22_Damage_Report_2025-09-21_1758458469473.PDF	406281	application/pdf	2025-09-21 12:41:09.58311	Damage report uploaded from dashboard	admin	\N	\N	\N	\N
85	21	Damage Photo	4TVV22_Damage_Photo_2025-09-21_1758458471216.png	uploads/4TVV22/damage_photo/4TVV22_Damage_Photo_2025-09-21_1758458471216.png	18380	image/png	2025-09-21 12:41:11.329076	Damage photo uploaded from dashboard	admin	\N	\N	\N	\N
87	38	Damage Report	97GRD4_Damage_Report_2025-09-29_1759176291947.pdf	uploads/97GRD4/damage_report/97GRD4_Damage_Report_2025-09-29_1759176291947.pdf	335694	application/pdf	2025-09-29 20:04:52.06313	Damage report uploaded from dashboard	admin	\N	\N	\N	\N
88	38	Damage Photo	97GRD4_Damage_Photo_2025-09-29_1759176293758.png	uploads/97GRD4/damage_photo/97GRD4_Damage_Photo_2025-09-29_1759176293758.png	45417	image/png	2025-09-29 20:04:53.866814	Damage photo uploaded from dashboard	admin	\N	\N	\N	\N
89	1	APK Inspection	XXLL20_APK_Inspection_2025-09-29_1759177425661.pdf	uploads/XXLL20/apk_inspection/XXLL20_APK_Inspection_2025-09-29_1759177425661.pdf	335694	application/pdf	2025-09-29 20:23:45.77377	\N	admin	\N	\N	\N	\N
90	1	Damage Report	XXLL20_Damage_Report_2025-09-29_1759177440140.pdf	uploads/XXLL20/damage_report/XXLL20_Damage_Report_2025-09-29_1759177440140.pdf	308440	application/pdf	2025-09-29 20:24:00.259042	\N	admin	\N	\N	\N	\N
91	1	Vehicle Photos	XXLL20_Vehicle_Photos_2025-09-29_1759177448344.pdf	uploads/XXLL20/vehicle_photos/XXLL20_Vehicle_Photos_2025-09-29_1759177448344.pdf	335694	application/pdf	2025-09-29 20:24:08.456819	\N	admin	\N	\N	\N	\N
92	1	Contract	XXLL20_contract_20251002.pdf	uploads/contracts/XXLL20/XXLL20_contract_20251002.pdf	307980	application/pdf	2025-10-02 20:36:11.415516	Rental contract for reservation #107 (17-10-2025 - 17-10-2025)	admin	\N	\N	\N	\N
93	1	Contract	XXLL20_contract_20251005.pdf	uploads/contracts/XXLL20/XXLL20_contract_20251005.pdf	308030	application/pdf	2025-10-05 14:59:53.703522	Rental contract for reservation #129 (16-10-2025 - 16-10-2025)	admin	\N	\N	\N	\N
94	1	Contract	XXLL20_contract_20251006.pdf	uploads/contracts/XXLL20/XXLL20_contract_20251006.pdf	307982	application/pdf	2025-10-06 19:08:49.594208	Rental contract for reservation #132 (16-10-2025 - 16-10-2025)	admin	\N	\N	\N	\N
95	1	APK Inspection	XXLL20_APK_Inspection_2025-10-06_1759780980423.pdf	uploads/XXLL20/apk_inspection/XXLL20_APK_Inspection_2025-10-06_1759780980423.pdf	335694	application/pdf	2025-10-06 20:03:00.530812	\N	admin	\N	\N	\N	\N
96	32	Damage Check	XXLL20_Damage_Report_2025-05-05_1746405418419 (4).pdf	uploads/50FJNV/damage_checks/50FJNV_damage_check_2025-10-07_1759781889099.pdf	335694	application/pdf	2025-10-06 20:18:09.641702	Damage check for reservation from 2025-10-07 to null	admin	\N	\N	\N	\N
97	32	Contract	50FJNV_contract_20251007.pdf	uploads/contracts/50FJNV/50FJNV_contract_20251007.pdf	307992	application/pdf	2025-10-07 21:18:43.983311	Rental contract for reservation #138 (07-10-2025 - 22-10-2025)	admin	\N	\N	\N	\N
98	21	Contract	4TVV22_contract_20251008.pdf	uploads/contracts/4TVV22/4TVV22_contract_20251008.pdf	308006	application/pdf	2025-10-08 21:17:10.518536	Rental contract for reservation #111 (06-10-2025 - )	admin	\N	\N	\N	\N
100	21	Contract	4TVV22_contract_20251009.pdf	uploads/contracts/4TVV22/4TVV22_contract_20251009.pdf	307992	application/pdf	2025-10-09 19:21:20.73534	\N	admin	\N	\N	\N	111
101	21	Damage Report Photo	4TVV22_Damage_Report_Photo_2025-10-09_1760037977837.png	uploads/4TVV22/damage_report_photo/4TVV22_Damage_Report_Photo_2025-10-09_1760037977837.png	45417	image/png	2025-10-09 19:26:17.943153	\N	admin	\N	\N	\N	111
102	21	Contract (Unsigned)	4TVV22_contract_20251009.pdf	uploads/contracts/4TVV22/4TVV22_contract_20251009.pdf	308006	application/pdf	2025-10-09 19:53:08.876989	Auto-generated unsigned contract for reservation #111	admin	\N	\N	\N	111
103	21	Damage Report PDF	4TVV22_Damage_Report_PDF_2025-10-09_1760039625323.pdf	uploads/4TVV22/damage_report_pdf/4TVV22_Damage_Report_PDF_2025-10-09_1760039625323.pdf	308006	application/pdf	2025-10-09 19:53:45.430941	\N	admin	\N	\N	\N	111
104	21	Contract (Signed)	4TVV22_Contract_(Signed)_2025-10-09_1760039892991.pdf	uploads/4TVV22/contract_(signed)/4TVV22_Contract_(Signed)_2025-10-09_1760039892991.pdf	308006	application/pdf	2025-10-09 19:58:13.103613	\N	admin	\N	\N	\N	111
105	34	Contract (Unsigned)	78FRST_contract_20251012.pdf	uploads/contracts/78FRST/78FRST_contract_20251012.pdf	308015	application/pdf	2025-10-12 17:34:10.572242	Auto-generated unsigned contract for reservation #140	admin	\N	\N	\N	140
106	34	Contract (Signed)	78FRST_Contract_(Signed)_2025-10-12_1760290470243.pdf	uploads/78FRST/contract_(signed)/78FRST_Contract_(Signed)_2025-10-12_1760290470243.pdf	308015	application/pdf	2025-10-12 17:34:30.359684	\N	admin	\N	\N	\N	140
107	36	Damage Report Photo	45LSFB_Damage_Report_Photo_2025-10-12_1760291762834.png	uploads/45LSFB/damage_report_photo/45LSFB_Damage_Report_Photo_2025-10-12_1760291762834.png	45417	image/png	2025-10-12 17:56:02.93971	\N	admin	\N	\N	\N	141
108	36	Contract (Signed)	45LSFB_Contract_(Signed)_2025-10-12_1760291768174.pdf	uploads/45LSFB/contract_(signed)/45LSFB_Contract_(Signed)_2025-10-12_1760291768174.pdf	308008	application/pdf	2025-10-12 17:56:08.282405	\N	admin	\N	\N	\N	141
109	37	Contract (Signed)	67BVTL_Contract_(Signed)_2025-10-12_1760292273049.pdf	uploads/67BVTL/contract_(signed)/67BVTL_Contract_(Signed)_2025-10-12_1760292273049.pdf	308024	application/pdf	2025-10-12 18:04:33.158398	\N	admin	\N	\N	\N	143
110	34	Contract (Unsigned)	78FRST_contract_20251012.pdf	uploads/contracts/78FRST/78FRST_contract_20251012.pdf	308017	application/pdf	2025-10-12 18:10:27.251527	Auto-generated unsigned contract for reservation #145	admin	\N	\N	\N	145
111	16	Contract (Unsigned)	40RKB4_contract_20251012.pdf	uploads/contracts/40RKB4/40RKB4_contract_20251012.pdf	308007	application/pdf	2025-10-12 18:26:30.25404	Auto-generated unsigned contract for reservation #146	admin	\N	\N	\N	146
112	32	Contract (Unsigned)	50FJNV_contract_20251012.pdf	uploads/contracts/50FJNV/50FJNV_contract_20251012.pdf	308007	application/pdf	2025-10-12 18:34:48.942956	Auto-generated unsigned contract for reservation #147	admin	\N	\N	\N	147
113	32	Contract (Unsigned)	50FJNV_contract_20251012.pdf	uploads/contracts/50FJNV/50FJNV_contract_20251012.pdf	308005	application/pdf	2025-10-12 18:42:26.013625	Auto-generated unsigned contract for reservation #148	admin	\N	\N	\N	148
114	36	Contract (Unsigned)	45LSFB_contract_20251012.pdf	uploads/contracts/45LSFB/45LSFB_contract_20251012.pdf	307978	application/pdf	2025-10-12 18:42:58.527562	Auto-generated unsigned contract for reservation #149	admin	\N	\N	\N	149
115	37	Contract (Unsigned)	67BVTL_contract_20251012.pdf	uploads/contracts/67BVTL/67BVTL_contract_20251012.pdf	308026	application/pdf	2025-10-12 18:51:19.539113	Auto-generated unsigned contract for reservation #150	admin	\N	\N	\N	150
116	26	Contract (Unsigned)	5TVV22_contract_20251012.pdf	uploads/contracts/5TVV22/5TVV22_contract_20251012.pdf	308023	application/pdf	2025-10-12 19:02:54.343727	Auto-generated unsigned contract for reservation #151	admin	\N	\N	\N	151
117	1	Contract (Unsigned)	XXLL20_contract_20251013.pdf	uploads/contracts/XXLL20/XXLL20_contract_20251013.pdf	308008	application/pdf	2025-10-13 22:07:38.326002	Auto-generated unsigned contract for reservation #108	admin	\N	\N	\N	108
119	21	Contract (Unsigned) 2	4TVV22_contract_20251014.pdf	uploads/contracts/4TVV22/4TVV22_contract_20251014.pdf	308007	application/pdf	2025-10-14 18:49:12.335504	Auto-generated unsigned contract (version 2) for reservation #111	admin	\N	\N	\N	111
120	32	Contract (Unsigned) 2	50FJNV_contract_20251014.pdf	uploads/contracts/50FJNV/50FJNV_contract_20251014.pdf	308005	application/pdf	2025-10-14 18:49:55.743081	Auto-generated unsigned contract (version 2) for reservation #152	admin	\N	\N	\N	152
121	16	Contract (Unsigned) 3	40RKB4_contract_20251014.pdf	uploads/contracts/40RKB4/40RKB4_contract_20251014.pdf	308006	application/pdf	2025-10-14 18:50:34.865798	Auto-generated unsigned contract (version 3) for reservation #152	admin	\N	\N	\N	152
122	16	Contract (Unsigned) 4	40RKB4_contract_20251014.pdf	uploads/contracts/40RKB4/40RKB4_contract_20251014.pdf	308006	application/pdf	2025-10-14 18:50:50.935535	Auto-generated unsigned contract (version 4) for reservation #152	admin	\N	\N	\N	152
123	41	Contract (Unsigned) 5	41GRS2_contract_20251014.pdf	uploads/contracts/41GRS2/41GRS2_contract_20251014.pdf	308021	application/pdf	2025-10-14 19:03:18.737539	Auto-generated unsigned contract (version 5) with current form data for reservation #152	admin	\N	\N	\N	152
124	32	Contract (Unsigned) 6	50FJNV_contract_20251014.pdf	uploads/contracts/50FJNV/50FJNV_contract_20251014.pdf	308006	application/pdf	2025-10-14 19:05:52.826372	Auto-generated unsigned contract (version 6) with current form data for reservation #152	admin	\N	\N	\N	152
125	21	Vehicle Photos	4TVV22_Vehicle_Photos_2025-10-14_1760473154951.png	uploads/4TVV22/vehicle_photos/4TVV22_Vehicle_Photos_2025-10-14_1760473154951.png	45417	image/png	2025-10-14 20:19:15.058671	links achter	admin	\N	\N	\N	134
126	21	Damage Report	4TVV22_Damage_Report_2025-10-14_1760473180496.pdf	uploads/4TVV22/damage_report/4TVV22_Damage_Report_2025-10-14_1760473180496.pdf	308024	application/pdf	2025-10-14 20:19:40.607944	\N	admin	\N	\N	\N	134
127	21	APK Inspection	4TVV22_APK_Inspection_2025-10-15_1760557734119.pdf	uploads/4TVV22/apk_inspection/4TVV22_APK_Inspection_2025-10-15_1760557734119.pdf	308024	application/pdf	2025-10-15 19:48:54.235864	\N	admin	\N	\N	\N	\N
128	21	APK Inspection	4TVV22_APK_Inspection_2025-10-15_1760557777309.pdf	uploads/4TVV22/apk_inspection/4TVV22_APK_Inspection_2025-10-15_1760557777309.pdf	308024	application/pdf	2025-10-15 19:49:37.419347	\N	admin	\N	\N	\N	\N
129	37	Contract (Unsigned)	67BVTL_contract_20251015.pdf	uploads/contracts/67BVTL/67BVTL_contract_20251015.pdf	308024	application/pdf	2025-10-15 20:51:31.956231	Auto-generated unsigned contract for reservation #155	admin	\N	\N	\N	155
130	1	Vehicle Photos	XXLL20_Vehicle_Photos_2025-10-16_1760636379990.png	uploads/XXLL20/vehicle_photos/XXLL20_Vehicle_Photos_2025-10-16_1760636379990.png	45417	image/png	2025-10-16 17:39:40.102034	\N	admin	\N	\N	\N	\N
132	1	Contract (Unsigned) 2	XXLL20_contract_20251016.pdf	uploads/contracts/XXLL20/XXLL20_contract_20251016.pdf	308010	application/pdf	2025-10-16 18:53:28.724142	Auto-generated unsigned contract (version 2) for reservation #108	admin	\N	\N	\N	108
\.


--
-- TOC entry 3581 (class 0 OID 344065)
-- Dependencies: 246
-- Data for Name: drivers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.drivers (id, customer_id, display_name, first_name, last_name, email, phone, driver_license_number, license_expiry, license_document_id, is_primary_driver, status, notes, preferred_language, created_at, updated_at, created_by, updated_by, created_by_user_id, updated_by_user_id, license_file_path) FROM stdin;
1	2	Cornelis Lam2	Cornelis	dasd	keeslam@live.nl	213123123	31232131	\N	\N	t	active	Migrated from customer record	nl	2025-10-12 20:33:10.938049	2025-10-12 20:33:10.938049	admin	\N	\N	\N	\N
2	1	keesss			keeslam12345@gmail.com	213123123	31232131	\N	\N	t	active	Migrated from customer record	nl	2025-10-12 20:33:10.938049	2025-10-12 20:33:10.938049	admin	\N	\N	\N	\N
4	2	dredre	Kees	Lam	info@autobedrijfbernisse.nl	+31623688106	212321	2025-10-19	\N	t	active		nl	2025-10-12 20:47:10.904854	2025-10-12 20:47:10.904854	admin	admin	1	1	\N
5	2	pjoter	Kees	Lam	info@autobedrijfbernisse.nl	+31623688106	31232131	2025-10-18	\N	f	active		en	2025-10-12 20:49:13.017165	2025-10-12 20:49:13.017165	admin	admin	1	1	\N
6	7	bien	fee						\N	f	active		nl	2025-10-12 20:51:12.322659	2025-10-12 20:51:12.322659	admin	admin	1	1	\N
7	9	sdfsdf	ssw						\N	f	active		nl	2025-10-12 20:54:28.319727	2025-10-12 20:54:28.319727	admin	admin	1	1	\N
9	3	tretre	Kees	Lam	info@autobedrijfbernisse.nl	+31623688106			\N	f	active		nl	2025-10-12 20:57:10.68716	2025-10-12 20:57:10.68716	admin	admin	1	1	\N
10	11	hfdgfdgf	Kees	Lam	info@autobedrijfbernisse.nl	+31623688106			\N	f	active		nl	2025-10-12 21:00:40.266183	2025-10-12 21:00:40.266183	admin	admin	1	1	\N
3	8	dsasd	Kees	Lam	info@autobedrijfbernisse.nl	+31623688106	31232131	2025-10-18	\N	f	active	asda	nl	2025-10-12 20:39:19.493302	2025-10-12 21:10:06.395	admin	admin	1	1	/home/runner/workspace/uploads/drivers/license_customerunknown_1760303406390.pdf
11	4	jan jansensens	jan	jansense	janjansen@jansen.nl	06526526736	212321	2025-10-17	\N	t	active		nl	2025-10-14 18:22:04.575125	2025-10-14 18:22:04.575125	admin	admin	1	1	\N
12	2	jan jansen	jan	jansen	jan@jansen.nl	06526526736	526526736	2025-11-01	\N	t	active		nl	2025-10-14 18:24:02.101112	2025-10-14 18:24:02.101112	admin	admin	1	1	\N
13	7	ferer23	123qwe	qew	info@autobedrijfbernisse.nl	213121232		2025-10-17	\N	f	active		nl	2025-10-15 20:03:47.35756	2025-10-15 20:03:47.35756	admin	admin	1	1	\N
8	3	fgfdgfdg	Cornelis	Lam	info@autobedrijfbernisse.nl	+31623688106			\N	f	active		nl	2025-10-12 20:56:16.015953	2025-10-15 20:08:15.285	admin	admin	1	1	\N
\.


--
-- TOC entry 3562 (class 0 OID 327745)
-- Dependencies: 227
-- Data for Name: email_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_logs (id, template, subject, recipients, emails_sent, emails_failed, failure_reason, vehicle_ids, sent_at) FROM stdin;
1	maintenance	Scheduled Maintenance Reminder	1	0	1	Failed to send to keeslam@live.nl for vehicle 42-GR-S5	[3]	2025-09-21T14:13:56.745Z
2	maintenance	Scheduled Maintenance Reminder	1	0	1	Failed to send to keeslam@live.nl for vehicle 42-GR-S5	[3]	2025-09-21T14:14:37.710Z
3	apk	APK Inspection Reminder - Action Required	1	0	1	Failed to send to keeslam@live.nl for vehicle 42-GR-S5	[3]	2025-09-21T14:18:01.869Z
4	apk	APK Inspection Reminder - Action Required	1	0	1	Failed to send to keeslam@live.nl for vehicle 27-TN-J2	[39]	2025-09-21T14:18:44.497Z
5	maintenance	Scheduled Maintenance Reminder	1	1	0	\N	[3]	2025-09-21T14:21:01.700Z
6	custom	q	1	1	0	\N	[3]	2025-09-21T15:49:32.977Z
7	custom	11	1	1	0	\N	[3]	2025-09-21T15:53:49.607Z
8	custom	rrr	1	1	0	\N	[39]	2025-09-21T16:10:45.149Z
9	custom	rrr	1	1	0	\N	[3]	2025-09-21T16:21:56.120Z
10	custom	Je APK Verloopt	1	1	0	\N	[39]	2025-09-21T18:19:23.721Z
11	custom	Je APK Verloopt	1	1	0	\N	[39]	2025-09-21T19:06:19.536Z
12	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-09-30T19:27:15.765Z
13	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-09-30T19:41:56.015Z
14	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-09-30T19:52:08.695Z
15	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-09-30T19:53:35.746Z
16	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-01T19:56:30.986Z
17	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-01T19:57:40.036Z
18	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-01T20:04:02.149Z
19	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-01T20:07:54.683Z
20	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:08:53.942Z
21	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:16:17.027Z
22	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:18:02.210Z
23	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:23:42.521Z
24	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:29:26.069Z
25	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:31:58.443Z
26	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-01T20:33:43.616Z
27	custom	Onderhoudsbeurt herrinering {vehiclePlate} {vehicleBrand} {vehicleModel}	1	1	0	\N	[38]	2025-10-01T20:36:29.454Z
28	gps	GPS Module Swap Request - RENAULT TWINGO (XX-LL-20)	1	1	0	\N	[]	2025-10-01T21:14:04.391Z
29	gps	GPS Module Swap Request - TOYOTA TOYOTA AYGO (42-GRS-5)	1	1	0	\N	[]	2025-10-01T21:23:41.480Z
30	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-02T18:21:14.965Z
31	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-02T18:22:14.241Z
32	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-02T18:22:49.117Z
33	gps	GPS Activatie Verzoek - PEUGEOT 308 (02-NVX-7)	1	1	0	\N	[]	2025-10-02T18:25:44.792Z
34	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-02T18:26:05.723Z
35	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-02T18:28:07.221Z
36	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-02T18:30:26.324Z
37	custom	Je APK Verloopt	1	0	1	Failed to send to keeslam@live.nl for vehicle 97-GR-D4	[38]	2025-10-02T18:32:09.629Z
38	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-02T18:35:21.872Z
39	custom	Onderhoudsbeurt herrinering {vehiclePlate} {vehicleBrand} {vehicleModel}	1	1	0	\N	[38]	2025-10-02T18:36:17.272Z
40	custom	bitc	1	1	0	\N	[]	2025-10-02T18:42:40.670Z
41	custom	homoo	4	4	0	\N	[22, 38]	2025-10-02T18:49:00.572Z
42	custom	Onderhoudsbeurt herrinering {vehiclePlate} {vehicleBrand} {vehicleModel}	1	1	0	\N	[22]	2025-10-02T18:49:27.847Z
43	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-02T18:49:47.747Z
44	gps	GPS Module Swap Verzoek - RENAULT TWINGO (XX-LL-20)	1	1	0	\N	[]	2025-10-02T18:50:19.497Z
45	gps	GPS Activatie voor: 40-RKB-4	1	1	0	\N	[]	2025-10-02T19:05:32.313Z
46	gps	GPS Wissel voor: 02-NVX-7	1	1	0	\N	[]	2025-10-02T19:06:02.148Z
47	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-06T17:20:18.812Z
48	custom	Je APK Verloopt	1	1	0	\N	[38]	2025-10-08T17:58:18.292Z
49	gps	GPS Wissel voor: XX-LL-20	1	1	0	\N	[]	2025-10-10T16:20:22.873Z
50	gps	GPS Wissel voor: XX-LL-20	1	1	0	\N	[]	2025-10-12T19:13:47.857Z
51	gps	GPS Activatie voor: 12-XP-DZ	1	1	0	\N	[]	2025-10-12T19:14:26.465Z
52	gps	GPS Activatie voor: XX-LL-20	1	1	0	\N	[]	2025-10-12T19:19:09.268Z
53	gps	GPS Wissel voor: XX-LL-20	1	1	0	\N	[]	2025-10-12T19:19:29.777Z
\.


--
-- TOC entry 3564 (class 0 OID 327754)
-- Dependencies: 229
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_templates (id, name, subject, content, created_at, updated_at, last_used, category) FROM stdin;
2	hrr	rrr	rrgrg	2025-09-21T16:04:37.203Z	\N	\N	custom
1	q	q	qq{vehicleBrand}	2025-09-21T15:31:05.353Z	2025-09-21T16:46:10.603Z	\N	custom
3	APK Nederlands	Je APK Verloopt	Hallo {customerName} de apk van de auto {vehiclePlate} {vehicleBrand} {vehicleModel} verloopt {apkDate} maak snel een afspraak	2025-09-21T16:35:41.152Z	2025-10-01T20:34:34.798Z	\N	apk
4	Onderhoud	Onderhoudsbeurt herrinering {vehiclePlate} {vehicleBrand} {vehicleModel}	{vehicleBrand}{vehicleModel}	2025-10-01T20:35:57.506Z	\N	\N	maintenance
\.


--
-- TOC entry 3566 (class 0 OID 327761)
-- Dependencies: 231
-- Data for Name: expenses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.expenses (id, vehicle_id, category, amount, date, description, receipt_url, created_at, updated_at, receipt_file, receipt_file_path, receipt_file_size, receipt_content_type, created_by, updated_by, created_by_user_id, updated_by_user_id) FROM stdin;
4	1	Tires	123	2025-05-03	asdasd	\N	2025-05-03 16:15:30.141465	2025-05-03 16:15:30.141465	\N	/home/runner/workspace/uploads/XX-LL-20/receipts/XXLL20_receipt_tires_2025-05-03_1746288930010.pdf	335694	application/pdf	\N	\N	\N	\N
9	5	Damage	1234	2025-05-04	lv deur		2025-05-03 22:05:21.117444	2025-05-03 22:05:21.117444	\N	\N	\N	\N	admin	admin	\N	\N
13	1	Damage	12333	2025-05-04	\N	\N	2025-05-03 23:33:45.923881	2025-05-03 23:33:45.923881	\N	/home/runner/workspace/uploads/XX-LL-20/receipts/XXLL20_receipt_damage_2025-05-04_1746315225808.pdf	335694	application/pdf	\N	\N	\N	\N
14	24	Tires	1234	2025-05-04	front tires	\N	2025-05-04 10:26:09.704439	2025-05-04 10:26:09.704439	\N	/home/runner/workspace/uploads/12-XP-DZ/receipts/12XPDZ_receipt_tires_2025-05-04_1746354369587.pdf	335694	application/pdf	\N	\N	\N	\N
15	20	Other	123	2025-05-04			2025-05-04 13:34:03.865831	2025-05-04 13:34:03.865831	\N	\N	\N	\N	admin	admin	\N	\N
16	16	Repair	1233	2025-05-04			2025-05-04 13:34:17.066749	2025-05-04 13:34:17.066749	\N	\N	\N	\N	admin	admin	\N	\N
17	23	Front window	12334	2025-05-04			2025-05-04 13:34:34.168216	2025-05-04 13:34:34.168216	\N	\N	\N	\N	admin	admin	\N	\N
18	0	Tires	0	2025-05-05			2025-05-05 00:20:32.93789	2025-05-05 00:20:32.93789	\N	/home/runner/workspace/uploads/42GRS5/receipts/42GRS5_receipt_tires_2025-05-05_1746404432559.pdf	335694	application/pdf	\N	\N	\N	\N
19	23	Maintenance	149.98	2025-05-05	\N	\N	2025-05-05 10:01:41.402338	2025-05-05 10:01:41.402338	\N	/home/runner/workspace/uploads/R789RT/receipts/R789RT_receipt_maintenance_2025-05-05_1746439301282.pdf	335694	application/pdf	\N	\N	\N	\N
20	1	Tires	23	2025-05-05	front tires		2025-05-05 14:34:29.848342	2025-05-05 14:34:29.848342	\N	\N	\N	\N	admin	admin	\N	\N
21	1	Tires	150	2025-05-06	banden voor	\N	2025-05-06 05:52:11.403399	2025-05-06 05:52:11.403399	\N	/home/runner/workspace/uploads/XXLL20/receipts/XXLL20_receipt_tires_2025-05-06_1746510731288.pdf	147055	application/pdf	\N	\N	\N	\N
22	32	Maintenance	1	2023-07-04	Diverse Lampen T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:05.633392	2025-09-20 15:21:05.633392	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
23	32	Maintenance	5	2023-07-04	Philips H Lamp T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:05.797941	2025-09-20 15:21:05.797941	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
24	32	Maintenance	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:05.947731	2025-09-20 15:21:05.947731	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
25	32	Maintenance	21.59	2023-07-04	Ruitenwisser Voor Aerotwin Retrofit (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.097132	2025-09-20 15:21:06.097132	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
26	32	Maintenance	5	2023-07-04	Kleinmateriaal (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.245076	2025-09-20 15:21:06.245076	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
27	32	Maintenance	4.38	2023-07-04	Oliefilter (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.392462	2025-09-20 15:21:06.392462	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
28	32	Maintenance	7.98	2023-07-04	Interieurfilter (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.540314	2025-09-20 15:21:06.540314	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
29	32	Other	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.688238	2025-09-20 15:21:06.688238	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
30	32	Maintenance	2.3	2023-07-04	Ruitensproeier Vloeistof (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.836431	2025-09-20 15:21:06.836431	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
31	32	Maintenance	0.17	2023-07-04	Carterplugring (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:06.987003	2025-09-20 15:21:06.987003	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
32	32	Maintenance	9.6	2023-07-04	5W30 Longlife T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:07.1352	2025-09-20 15:21:07.1352	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
33	32	Maintenance	78.75	2023-07-04	Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:07.28306	2025-09-20 15:21:07.28306	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
34	32	Tires	193.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:07.431295	2025-09-20 15:21:07.431295	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
35	32	Tires	45	2023-07-04	Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:21:07.579179	2025-09-20 15:21:07.579179	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
36	42	Maintenance	1	2023-07-04	Diverse Lampen T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:11.195517	2025-09-20 15:31:11.195517	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
37	42	Maintenance	5	2023-07-04	Philips H Lamp T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:11.356985	2025-09-20 15:31:11.356985	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
38	42	Maintenance	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:11.51657	2025-09-20 15:31:11.51657	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
39	42	Maintenance	21.59	2023-07-04	Ruitenwisser Voor Aerotwin Retrofit (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:11.661964	2025-09-20 15:31:11.661964	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
40	42	Maintenance	5	2023-07-04	Kleinmateriaal (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:11.807758	2025-09-20 15:31:11.807758	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
41	42	Maintenance	4.38	2023-07-04	Oliefilter (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:11.963301	2025-09-20 15:31:11.963301	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
42	42	Maintenance	7.98	2023-07-04	Interieurfilter (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.109349	2025-09-20 15:31:12.109349	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
43	42	Other	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.255579	2025-09-20 15:31:12.255579	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
44	42	Maintenance	2.3	2023-07-04	Ruitensproeier Vloeistof (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.413795	2025-09-20 15:31:12.413795	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
45	42	Maintenance	0.17	2023-07-04	Carterplugring (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.562469	2025-09-20 15:31:12.562469	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
46	42	Maintenance	9.6	2023-07-04	5W30 Longlife T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.707213	2025-09-20 15:31:12.707213	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
47	42	Maintenance	78.75	2023-07-04	Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.85201	2025-09-20 15:31:12.85201	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
48	42	Tires	193.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:12.997146	2025-09-20 15:31:12.997146	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
49	42	Tires	45	2023-07-04	Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:31:13.142073	2025-09-20 15:31:13.142073	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
50	42	Maintenance	167.76	2023-07-04	Diverse Lampen T.B.V. LAM • Philips H Lamp T.B.V. LAM • Remblokkenset Voor • Ruitenwisser Voor Aerotwin Retrofit • Kleinmateriaal • Oliefilter • Interieurfilter • Ruitensproeier Vloeistof • Carterplugring • 5W30 Longlife T.B.V. LAM • Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:36:57.524927	2025-09-20 15:36:57.524927	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
51	42	Other	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:36:57.686423	2025-09-20 15:36:57.686423	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
52	42	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:36:57.833344	2025-09-20 15:36:57.833344	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
53	42	Maintenance	135.77	2023-07-04	Diverse Lampen T.B.V. LAM • Philips H Lamp T.B.V. LAM • Ruitenwisser Voor Aerotwin Retrofit • Kleinmateriaal • Oliefilter • Interieurfilter • Ruitensproeier Vloeistof • Carterplugring • 5W30 Longlife T.B.V. LAM • Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:41:00.696179	2025-09-20 15:41:00.696179	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
54	42	Brakes	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:41:00.86021	2025-09-20 15:41:00.86021	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
55	42	Other	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:41:01.00732	2025-09-20 15:41:01.00732	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
56	42	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 15:41:01.154728	2025-09-20 15:41:01.154728	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
57	42	Brakes	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 16:27:23.638534	2025-09-20 16:27:23.638534	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
58	42	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 16:27:23.804509	2025-09-20 16:27:23.804509	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
59	42	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-20 16:30:20.707474	2025-09-20 16:30:20.707474	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	keeslam	\N	\N	\N
60	42	Maintenance	135.77	2023-07-04	Diverse Lampen T.B.V. LAM • Philips H Lamp T.B.V. LAM • Ruitenwisser Voor Aerotwin Retrofit • Kleinmateriaal • Oliefilter • Interieurfilter • Ruitensproeier Vloeistof • Carterplugring • 5W30 Longlife T.B.V. LAM • Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-21 12:56:19.170681	2025-09-21 12:56:19.170681	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
61	42	Brakes	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-21 12:56:19.328579	2025-09-21 12:56:19.328579	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
62	42	Registration	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-21 12:56:19.469367	2025-09-21 12:56:19.469367	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
63	42	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-09-21 12:56:19.610765	2025-09-21 12:56:19.610765	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
64	1	Maintenance	135.77	2023-07-04	Diverse Lampen T.B.V. LAM • Philips H Lamp T.B.V. LAM • Ruitenwisser Voor Aerotwin Retrofit • Kleinmateriaal • Oliefilter • Interieurfilter • Ruitensproeier Vloeistof • Carterplugring • 5W30 Longlife T.B.V. LAM • Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-06 19:22:30.998046	2025-10-06 19:22:30.998046	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
65	1	Brakes	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-06 19:22:31.165391	2025-10-06 19:22:31.165391	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
66	1	Other	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-06 19:22:31.308593	2025-10-06 19:22:31.308593	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
67	1	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-06 19:22:31.451468	2025-10-06 19:22:31.451468	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
68	21	Maintenance	135.77	2023-07-04	Diverse Lampen T.B.V. LAM • Philips H Lamp T.B.V. LAM • Ruitenwisser Voor Aerotwin Retrofit • Kleinmateriaal • Oliefilter • Interieurfilter • Ruitensproeier Vloeistof • Carterplugring • 5W30 Longlife T.B.V. LAM • Werkplaats tarief LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-14 20:18:48.07748	2025-10-14 20:18:48.07748	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
69	21	Brakes	31.99	2023-07-04	Remblokkenset Voor (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-14 20:18:48.239848	2025-10-14 20:18:48.239848	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
70	21	Other	2.5	2023-07-04	Milieuheffing (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-14 20:18:48.393874	2025-10-14 20:18:48.393874	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
71	21	Tires	238.36	2023-07-04	175/65R14 - CONNEXION5 79T (Energie: E Grip: B dB: 70) • Winterbanden Wissel Losse Banden T.B.V. LAM (Invoice: 23000439 - Autobedrijf Bernisse B.V.)	\N	2025-10-14 20:18:48.546197	2025-10-14 20:18:48.546197	\N	uploads/invoices/QXV0b2JlZHJpamYgQmVybmlzc2UgQi5WLi0yMzAwMDQzOS0yMDIzLTA3LTA0LTQ5NC40Mw==.pdf	\N	\N	admin	\N	\N	\N
\.


--
-- TOC entry 3568 (class 0 OID 327769)
-- Dependencies: 233
-- Data for Name: extension_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.extension_requests (id, reservation_id, customer_id, vehicle_id, current_end_date, requested_end_date, reason, status, staff_notes, reviewed_by, reviewed_at, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3570 (class 0 OID 327778)
-- Dependencies: 235
-- Data for Name: pdf_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pdf_templates (id, name, fields, is_default, created_at, updated_at, background_path) FROM stdin;
9	contract	[{"x": 76.22222391764323, "y": 154.06565487023553, "id": "field-1759869754611", "name": "merk", "isBold": false, "locked": false, "source": "brand", "fontSize": 12, "textAlign": "left"}, {"x": 76.22222391764323, "y": 169.03282743511778, "id": "field-1759869761881", "name": "model", "isBold": false, "locked": false, "source": "model", "fontSize": 12, "textAlign": "left"}, {"x": 76.22222391764323, "y": 184, "id": "field-1759869834441", "name": "kenteken", "isBold": false, "locked": false, "source": "licensePlate", "fontSize": 12, "textAlign": "left"}, {"x": 80.05555725097655, "y": 258.2121186689897, "id": "field-1759869911612", "name": "naam klant", "isBold": false, "locked": false, "source": "customerName", "fontSize": 12, "textAlign": "left"}, {"x": 80.05555725097655, "y": 273.7121186689897, "id": "field-1759869936481", "name": "adres", "isBold": false, "locked": false, "source": "customerAddress", "fontSize": 12, "textAlign": "left"}, {"x": 80.05555725097655, "y": 303.2121186689897, "id": "field-1759869962552", "name": "stad", "isBold": false, "locked": false, "source": "customerCity", "fontSize": 12, "textAlign": "left"}, {"x": 80.05555725097655, "y": 289.2121186689897, "id": "field-1759869981752", "name": "postcode", "isBold": false, "locked": false, "source": "customerPostalCode", "fontSize": 12, "textAlign": "left"}, {"x": 97.10101179643112, "y": 332.66666412353516, "id": "field-1759870024082", "name": "telefoon nummer", "isBold": false, "locked": false, "source": "customerPhone", "fontSize": 12, "textAlign": "left"}, {"x": 87.05555725097656, "y": 722.3333435058594, "id": "field-1759870078272", "name": "datum start", "isBold": false, "locked": false, "source": "startDate", "fontSize": 12, "textAlign": "left"}, {"x": 357.8333320617676, "y": 95.05555534362793, "id": "field-1759870116252", "name": "contract nummer", "isBold": false, "locked": false, "source": "contractNumber", "fontSize": 12, "textAlign": "left"}]	t	2025-10-07 20:18:29.592625	2025-10-07 21:32:07.706	\N
8	contract	[]	f	2025-10-07 20:17:29.983682	2025-10-07 21:37:41.169	uploads/templates/template_8_background.pdf
\.


--
-- TOC entry 3572 (class 0 OID 327788)
-- Dependencies: 237
-- Data for Name: reservations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reservations (id, vehicle_id, customer_id, start_date, end_date, status, total_price, notes, created_at, updated_at, damage_check_path, created_by, updated_by, created_by_user_id, updated_by_user_id, type, replacement_for_reservation_id, placeholder_spare, spare_vehicle_status, deleted_at, deleted_by, deleted_by_user_id, maintenance_duration, maintenance_status, spare_assignment_decision, affected_rental_id, fuel_level_pickup, fuel_level_return, fuel_cost, fuel_card_number, fuel_notes, is_recurring, recurring_parent_id, recurring_frequency, recurring_end_date, recurring_day_of_week, recurring_day_of_month, driver_id, maintenance_category) FROM stdin;
56	\N	2	2025-09-23	2025-09-23	pending	\N	TBD spare vehicle for reservation #55	2025-09-23 21:54:28.932759	2025-09-23 21:54:28.932759	\N	\N	admin	\N	\N	replacement	55	t	assigned	2025-09-30 20:56:42.457	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
61	\N	2	2025-09-23	2025-09-23	pending	\N	TBD spare vehicle for reservation #53	2025-09-23 22:04:58.142013	2025-09-23 22:04:58.142013	\N	\N	admin	\N	\N	replacement	53	t	assigned	2025-09-30 20:57:52.199	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
66	34	\N	2025-09-27	2025-09-27	confirmed	0	breakdown: auto gestand	2025-09-27 23:25:25.185767	2025-09-27 23:25:25.185767	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:58:47.227	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
88	5	1	2025-09-01	2025-11-14	pending	0		2025-09-30 20:38:57.868979	2025-09-30 20:38:57.868979	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:58:42.393	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
91	5	\N	2025-09-17	2025-09-17	confirmed	0	breakdown: koelvloeistof lekkage\nkoelvloeistof lekkage	2025-09-30 20:39:51.743503	2025-09-30 20:39:51.743503	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:40:28.403	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
89	5	\N	2025-09-17	2025-09-17	confirmed	0	breakdown: koelvloeistof lekkage\nkoelvloeistof lekkage	2025-09-30 20:39:33.989988	2025-09-30 20:39:33.989988	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:40:52.483	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
92	5	\N	2025-09-17	2025-09-17	confirmed	0	breakdown: koelvloeistof lekkage	2025-09-30 20:46:06.631929	2025-09-30 20:46:06.631929	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:51:04.726	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
48	22	2	2025-09-23	undefined	pending	0		2025-09-22 22:58:36.417924	2025-09-22 22:58:36.417924	\N	keeslam	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:55:49.213	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
87	49	\N	2025-09-10	2025-09-10	confirmed	0	breakdown: auto gestand	2025-09-29 20:00:31.988323	2025-09-29 20:00:31.988323	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:55:51.622	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
67	48	4	2025-09-29	undefined	pending	0		2025-09-28 16:35:18.241468	2025-09-28 16:35:18.241468	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:55:57.298	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
41	37	\N	2025-09-22	2025-09-22	confirmed	0	breakdown: qweqwe\ndads	2025-09-22 20:56:20.302448	2025-09-22 20:56:20.302448	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:55:59.357	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
70	34	\N	2025-10-02	2025-10-02	confirmed	0	breakdown: auto gestand	2025-09-28 16:47:05.690806	2025-09-28 16:47:05.690806	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:56:15.754	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
60	38	\N	2025-09-23	2025-09-23	confirmed	0	tire_replacement: qweqwe	2025-09-23 22:04:52.177347	2025-09-23 22:04:52.177347	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:56:30.187	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
59	\N	10	2025-09-24	2025-09-24	pending	\N	TBD spare vehicle for reservation #39	2025-09-23 22:01:16.098727	2025-09-23 22:01:16.098727	\N	\N	admin	\N	\N	replacement	39	t	assigned	2025-09-30 20:56:33.808	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
57	34	\N	2025-09-24	2025-09-24	confirmed	0	tire_replacement: auto gestand	2025-09-23 22:00:44.189521	2025-09-23 22:00:44.189521	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:56:39.558	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
55	34	2	2025-09-18	2025-09-26	pending	0		2025-09-23 21:32:18.372319	2025-09-23 21:32:18.372319	\N	keeslam	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:56:45.147	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
53	38	2	2025-09-23	undefined	confirmed	0		2025-09-23 21:07:01.978072	2025-09-23 21:07:01.978072	\N	keeslam	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:56:47.717	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
85	49	\N	2025-09-10	2025-09-10	confirmed	0	breakdown: auto gestand	2025-09-29 20:00:08.879577	2025-09-29 20:00:08.879577	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:13.382	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
74	1	\N	2025-09-13	2025-09-13	confirmed	0	apk_inspection: apk keuring	2025-09-28 17:47:00.04538	2025-09-28 17:47:00.04538	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:15.182	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
77	1	\N	2025-09-16	2025-09-16	confirmed	0	apk_inspection: apk keuring	2025-09-28 18:01:59.170134	2025-09-28 18:01:59.170134	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:17.856	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
58	21	\N	2025-09-24	2025-09-24	confirmed	0	tire_replacement: auto gestand	2025-09-23 22:01:09.375049	2025-09-23 22:01:09.375049	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:20.094	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
45	3	\N	2025-09-22	2025-09-22	confirmed	0	breakdown: qweqwe\nnetjes	2025-09-22 22:03:46.957173	2025-09-22 22:03:46.957173	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:22.568	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
63	22	\N	2025-09-24	2025-09-24	confirmed	0	breakdown: asdasd	2025-09-24 21:46:03.36747	2025-09-24 21:46:03.36747	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:24.216	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
69	20	\N	2025-09-28	2025-09-28	confirmed	0	engine_repair: oliekoeler lek	2025-09-28 16:44:23.06432	2025-09-28 16:44:23.06432	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:28.37	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
65	38	\N	2025-09-27	2025-09-27	confirmed	0	breakdown:	2025-09-27 23:24:54.761336	2025-09-27 23:24:54.761336	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 20:57:30.691	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
38	30	4	2025-09-21	2025-09-25	pending	0		2025-09-21 12:39:19.682895	2025-09-21 12:39:19.682895	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:57:38.649	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
64	\N	2	2025-09-24	2025-09-24	pending	\N	TBD spare vehicle for reservation #48	2025-09-24 21:46:07.092336	2025-09-24 21:46:07.092336	\N	\N	admin	\N	\N	replacement	48	t	assigned	2025-09-30 20:57:40.592	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
72	\N	4	2025-10-09	2025-10-09	pending	\N	TBD spare vehicle for reservation #54	2025-09-28 17:00:11.877303	2025-09-28 17:00:11.877303	\N	\N	admin	\N	\N	replacement	54	t	assigned	2025-09-30 20:57:44.087	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
83	41	2	2025-09-11	undefined	pending	0		2025-09-29 19:49:13.925114	2025-09-29 19:49:13.925114	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:58:37.525	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
36	36	6	2025-09-21	2025-09-25	confirmed	0	Original vehicle 27-TN-J2 (MITSUBISHI MITSUBISHI OUTLANDER) under maintenance. Replaced with spare vehicle 45-LS-FB (Toyota Sportage).	2025-09-21 00:02:38.674711	2025-09-23 19:34:48.226188	uploads/27TNJ2/damage_checks/27TNJ2_damage_check_2025-09-21_1758412958422.PDF	admin	admin	\N	\N	replacement	36	f	ready	2025-09-30 20:58:40.044	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
86	34	4	2025-09-10	2025-09-10	pending	\N	Spare vehicle 78-FR-ST (Mercedes-Benz V60) assigned for reservation #84	2025-09-29 20:00:12.182479	2025-09-30 20:19:22.275	\N	\N	admin	\N	\N	replacement	84	f	assigned	2025-09-30 20:58:44.899	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
39	21	10	2025-09-21	undefined	pending	0		2025-09-21 19:45:46.864232	2025-09-21 19:45:46.864232	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:58:49.984	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
54	1	4	2025-09-23	undefined	confirmed	0		2025-09-23 21:19:52.216236	2025-09-23 21:19:52.216236	\N	keeslam	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:58:55.431	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
68	37	4	2025-10-02	undefined	pending	0		2025-09-28 16:42:53.77808	2025-09-28 16:42:53.77808	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-09-30 20:58:58.852	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
93	5	\N	2025-09-17	2025-09-17	confirmed	0	breakdown: koelvloeistof lekkage	2025-09-30 20:47:34.682025	2025-09-30 20:47:34.682025	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-09-30 21:03:07.167	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
90	\N	1	2025-09-17	2025-09-17	pending	\N	TBD spare vehicle for reservation #88	2025-09-30 20:39:38.004292	2025-09-30 20:39:38.004292	\N	\N	admin	\N	\N	replacement	88	t	assigned	2025-09-30 21:12:04.692	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
94	32	\N	2025-10-07	2025-10-07	confirmed	0	apk_inspection: apk keuring	2025-10-01 20:45:07.197826	2025-10-01 20:45:07.197826	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 19:07:37.421	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
96	36	6	2025-10-05	undefined	pending	0		2025-10-02 19:09:00.809349	2025-10-02 19:09:00.809349	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-02 20:11:31.128	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
95	32	\N	2025-10-15	2025-10-15	confirmed	0	apk_inspection: apk keuring\n233	2025-10-02 19:08:02.049343	2025-10-02 19:08:02.049343	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-05 15:49:31.801	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
84	49	4	2025-09-02	undefined	pending	0		2025-09-29 19:50:09.900824	2025-09-29 19:50:09.900824	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-08 20:47:01.019	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
97	36	\N	2025-10-23	2025-10-23	confirmed	0	breakdown: sdfs	2025-10-02 19:09:28.000152	2025-10-02 19:09:28.000152	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 19:18:55.354	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
99	36	\N	2025-10-23	2025-10-23	confirmed	0	breakdown: auto gestand	2025-10-02 19:24:05.464143	2025-10-02 19:24:05.464143	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 19:26:45.4	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
100	36	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: apk keuring\napk oen	2025-10-02 19:30:00.621465	2025-10-02 19:30:00.621465	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 19:38:30.28	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
98	\N	6	2025-10-23	2025-10-23	pending	\N	TBD spare vehicle for reservation #96	2025-10-02 19:09:44.386545	2025-10-02 19:09:44.386545	\N	\N	admin	\N	\N	replacement	96	t	assigned	2025-10-02 20:07:19.495	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
102	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: sdfs	2025-10-02 20:12:12.772359	2025-10-02 20:12:12.772359	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:13:27.462	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
103	1	\N	2025-10-17	2025-10-17	confirmed	0	breakdown: auto gestand	2025-10-02 20:13:59.478502	2025-10-02 20:13:59.478502	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:21:00.701	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
104	1	\N	2025-10-17	2025-10-17	confirmed	0	breakdown: auto gestand	2025-10-02 20:21:44.723143	2025-10-02 20:21:44.723143	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:24:07.919	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
105	1	\N	2025-10-17	2025-10-17	confirmed	0	breakdown: apk keuring	2025-10-02 20:24:18.338957	2025-10-02 20:24:18.338957	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:28:48.829	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
106	1	\N	2025-10-17	2025-10-17	confirmed	0	breakdown: auto gestand	2025-10-02 20:29:07.24215	2025-10-02 20:29:07.24215	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:31:44.841	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
101	1	2	2025-10-05	\N	pending	0		2025-10-02 20:11:53.515057	2025-10-02 20:11:53.515057	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-02 20:36:36.715	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
107	1	\N	2025-10-17	2025-10-17	confirmed	0	breakdown: apk keuring	2025-10-02 20:31:54.504401	2025-10-02 20:31:54.504401	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:37:17.201	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
110	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-02 20:37:53.867444	2025-10-02 20:37:53.867444	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-02 20:40:39.522	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
109	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: auto gestand	2025-10-02 20:37:50.340458	2025-10-02 20:37:50.340458	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:40:39.522	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
112	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: apk keuring	2025-10-02 20:41:36.225123	2025-10-02 20:41:36.225123	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:50:23.272	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
116	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-02 20:50:38.25548	2025-10-02 20:50:38.25548	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-02 20:53:21.88	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
115	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: apk keuring	2025-10-02 20:50:35.34141	2025-10-02 20:50:35.34141	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-02 20:53:21.88	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
118	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-02 20:54:00.768387	2025-10-02 20:54:00.768387	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-03 16:31:41.297	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
117	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: apk keuring	2025-10-02 20:53:57.604367	2025-10-02 20:53:57.604367	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-03 16:31:41.297	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
120	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-03 16:32:01.817095	2025-10-03 16:32:01.817095	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-03 16:32:27.965	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
119	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: auto gestand	2025-10-03 16:31:58.377105	2025-10-03 16:31:58.377105	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-03 16:32:27.965	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
122	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-03 16:32:45.513717	2025-10-03 16:32:45.513717	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-03 16:34:23.74	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
121	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: apk keuring	2025-10-03 16:32:42.216262	2025-10-03 16:32:42.216262	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-03 16:34:23.74	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
124	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-03 16:34:49.278083	2025-10-03 16:34:49.278083	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-03 16:35:18.635	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
123	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: apk keuring	2025-10-03 16:34:45.258288	2025-10-03 16:34:45.258288	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-03 16:35:18.635	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
126	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-03 16:35:44.552086	2025-10-03 16:35:44.552086	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-03 16:45:33.112	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
125	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: auto gestand	2025-10-03 16:35:39.462121	2025-10-03 16:35:39.462121	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-03 16:45:33.112	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
128	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-03 16:45:50.622592	2025-10-03 16:45:50.622592	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-05 14:53:58.99	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
127	1	\N	2025-10-16	2025-10-16	confirmed	0	breakdown: auto gestand	2025-10-03 16:45:45.884096	2025-10-03 16:45:45.884096	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-05 14:53:58.99	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
130	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-05 14:59:26.038266	2025-10-05 14:59:26.038266	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-05 15:42:23.284	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
129	1	2	2025-10-16	2025-10-16	in	0	breakdown: apk keuring\nsdfsdfd	2025-10-05 14:59:21.59043	2025-10-05 14:59:21.59043	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-05 15:42:23.284	admin	1	1	in	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
131	1	\N	2025-10-16	2025-10-16	scheduled	0	breakdown: auto gestand\nhij doet het niet meer	2025-10-05 15:42:56.756328	2025-10-05 15:42:56.756328	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-05 15:49:12.587	admin	1	1	scheduled	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
114	\N	2	2025-10-17	2025-10-17	pending	\N	TBD spare vehicle for reservation #111	2025-10-02 20:44:04.20149	2025-10-02 20:44:04.20149	\N	\N	admin	\N	\N	replacement	111	t	assigned	2025-10-05 15:49:19.876	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
113	21	\N	2025-10-17	2025-10-17	confirmed	0	breakdown: apk keuring	2025-10-02 20:44:01.024184	2025-10-02 20:44:01.024184	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-05 15:49:19.876	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
133	\N	2	2025-10-16	2025-10-16	pending	\N	TBD spare vehicle for reservation #108	2025-10-05 15:52:10.324309	2025-10-05 15:52:10.324309	\N	\N	admin	\N	\N	replacement	108	t	assigned	2025-10-06 19:26:02.333	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
132	1	\N	2025-10-16	2025-10-16	scheduled	0	apk_inspection: apk keuring\napk	2025-10-05 15:52:03.350588	2025-10-05 15:52:03.350588	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-06 19:26:02.333	admin	1	1	scheduled	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
137	32	\N	2025-10-21	2025-10-21	scheduled	0	apk_inspection: apk keuring\napk	2025-10-06 19:51:43.184107	2025-10-06 19:51:43.184107	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-06 19:51:57.902	admin	1	1	scheduled	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
136	1	2	2025-10-16	2025-10-16	scheduled	0	brake_service: remmen\nremmen voor	2025-10-06 19:41:21.572006	2025-10-06 19:41:21.572006	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-06 20:03:01.837	admin	1	1	scheduled	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
108	1	2	2025-10-05	\N	confirmed	0		2025-10-02 20:37:32.272943	2025-10-02 20:37:32.272943	\N	admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
138	32	5	2025-10-07	2025-10-22	pending	0		2025-10-06 20:18:09.401386	2025-10-06 20:18:09.401386	uploads/50FJNV/damage_checks/50FJNV_damage_check_2025-10-07_1759781889099.pdf	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-08 20:42:14.451	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
62	30	\N	2025-09-26	2025-09-26	confirmed	0	breakdown: auto gestand	2025-09-24 21:02:46.65356	2025-09-24 21:02:46.65356	\N	keeslam	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-08 20:47:35.68	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
140	34	4	2025-10-12	\N	pending	0		2025-10-12 17:23:03.85906	2025-10-12 17:23:03.85906	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:09:28.891	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
111	21	3	2025-10-06	2025-10-30	pending	0		2025-10-02 20:41:15.109259	2025-10-02 20:41:15.109259	null	admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	8	\N
134	21	\N	2025-10-17	2025-10-17	scheduled	0	brake_service: remmen\nremmen voor	2025-10-06 18:56:16.599692	2025-10-06 18:56:16.599692	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	\N	\N	\N	1	scheduled	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
139	3	4	2025-10-12	\N	pending	0		2025-10-12 17:09:59.803006	2025-10-12 17:09:59.803006	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:09:25.428	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
142	32	4	2025-10-12	\N	pending	0		2025-10-12 18:01:24.236444	2025-10-12 18:01:24.236444	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:09:32.533	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
145	34	4	2025-10-12	\N	pending	0		2025-10-12 18:10:21.785132	2025-10-12 18:10:21.785132	\N	admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
144	26	3	2025-10-12	\N	pending	0		2025-10-12 18:07:03.65105	2025-10-12 18:07:03.65105	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:32:30.061	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
143	37	4	2025-10-12	\N	pending	0		2025-10-12 18:04:03.639856	2025-10-12 18:04:03.639856	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:39:17.865	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
141	36	4	2025-10-13	\N	pending	0		2025-10-12 17:39:59.528594	2025-10-12 17:39:59.528594	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:40:05.818	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
147	32	3	2025-10-12	\N	pending	0		2025-10-12 18:34:48.433412	2025-10-12 18:34:48.433412	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:41:52.791	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
146	16	4	2025-10-13	\N	pending	0		2025-10-12 18:26:29.745492	2025-10-12 18:26:29.745492	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 18:42:14.307	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
149	36	11	2025-10-03	\N	pending	0		2025-10-12 18:42:58.051915	2025-10-12 18:42:58.051915	\N	admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
151	26	4	2025-10-12	\N	pending	0		2025-10-12 19:02:53.866035	2025-10-12 19:02:53.866035	\N	admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
150	37	4	2025-10-12	\N	pending	0		2025-10-12 18:51:19.08299	2025-10-12 18:51:19.08299	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 20:18:29.843	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
148	32	3	2025-10-13	\N	pending	0		2025-10-12 18:42:25.488338	2025-10-12 18:42:25.488338	\N	admin	admin	\N	\N	standard	\N	f	assigned	2025-10-12 20:56:44.188	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
152	32	3	2025-10-14	2025-10-22	pending	0		2025-10-14 18:24:29.650017	2025-10-14 18:24:29.650017		admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	9	\N
135	\N	2	2025-10-17	2025-10-17	pending	\N	TBD spare vehicle for reservation #111	2025-10-06 18:56:22.250614	2025-10-06 18:56:22.250614	\N	\N	admin	\N	\N	replacement	111	t	assigned	2025-10-14 19:53:24.886	admin	1	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
153	\N	3	2025-10-06	2025-10-30	pending	0	\N	2025-10-14 20:00:15.430351	2025-10-14 20:00:15.430351	\N	admin	admin	\N	\N	replacement	111	t	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	8	\N
154	22	\N	2025-10-17	2025-10-17	in	0	tire_replacement: asdasd	2025-10-14 21:03:11.785792	2025-10-14 21:03:11.785792	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	2025-10-15 19:54:26.219	admin	1	1	in	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
155	37	3	2025-10-15	\N	pending	0		2025-10-15 20:51:31.469443	2025-10-15 20:51:31.469443	\N	admin	admin	\N	\N	standard	\N	f	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	8	\N
157	\N	2	2025-10-30	2025-10-30	pending	\N	TBD spare vehicle for reservation #108	2025-10-16 18:21:10.177716	2025-10-16 18:21:10.177716	\N	\N	\N	\N	\N	replacement	108	t	assigned	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N
158	1	2	2025-10-23	2025-10-23	in	0	regular_maintenance:\nbeurtje bandje	2025-10-16 18:58:24.842892	2025-10-16 18:58:24.842892	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	\N	\N	\N	1	out	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	scheduled_maintenance
156	1	2	2025-10-28	2025-10-28	scheduled	0	regular_maintenance:\ndynamo kapot	2025-10-16 18:21:04.655029	2025-10-16 18:21:04.655029	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	\N	\N	\N	1	out	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	repair
159	1	2	2025-11-08	2025-11-08	scheduled	0	oil_change:\noliefilter en accu	2025-10-16 19:29:55.906531	2025-10-16 19:29:55.906531	\N	admin	admin	\N	\N	maintenance_block	\N	f	assigned	\N	\N	\N	1	out	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	scheduled_maintenance
\.


--
-- TOC entry 3582 (class 0 OID 385024)
-- Dependencies: 247
-- Data for Name: session; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.session (sid, sess, expire) FROM stdin;
eZY1salmSJXfRoDMv_RqSsOFwDd8y3XZ	{"cookie":{"originalMaxAge":2592000000,"expires":"2025-11-14T19:42:25.524Z","secure":false,"httpOnly":true,"path":"/","sameSite":"lax"},"passport":{"user":1}}	2025-11-15 19:48:31
\.


--
-- TOC entry 3574 (class 0 OID 327806)
-- Dependencies: 239
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, username, password, full_name, email, role, permissions, active, created_at, updated_at, created_by, updated_by) FROM stdin;
1	admin	b054670dea160cda54a42a4e61e439c87f4696fac9125ebea4f7ade50db1ef48b0e8eade41a431f61ef333d0954bf4b929a8983a05d110df9708a6fdb1243bb5.782f3dec747ded907d55eacabb908cbd	\N	\N	admin	["manage_users", "manage_vehicles", "manage_customers", "manage_reservations", "manage_expenses", "manage_documents", "view_dashboard"]	t	2025-05-03 18:52:49.173884	2025-05-03 18:52:49.173884	\N	\N
3	keeslam	99cc9006531f0e5aa9b67b5fd8a8b9847a28fd79624e914f5983d369391fa7cb6410ae0332e137277e957e2dce4a75e561891d707966ea3875be14093b08fe3e.e57e02f20168d40958b21f8854620dc7	Kees Lam	keeslam@lamgroep.nl	user	["manage_users", "manage_vehicles", "view_dashboard", "manage_expenses", "manage_reservations", "manage_customers", "manage_maintenance", "manage_documents"]	t	2025-05-03 19:29:04.234295	2025-09-29 18:45:32.186	admin	admin
2	admin1	f6b7d2354a41c40b2af67677f962d29b8d89c78c6e99420e0b4a98f6962cd69e0a244396633025591b61e9771563cedfd6fd540b56b0806a99fbdb76aa5bdc06.236cb93c30b3c42a31f8029245772c30			admin	["manage_users", "manage_vehicles", "manage_customers", "manage_reservations", "manage_expenses", "manage_documents", "view_dashboard", "manage_maintenance"]	t	2025-05-03 19:12:34.74863	2025-09-29 18:45:45.712	\N	admin
4	kees	2a553844723ed53485849c6355dcb8f251ccbf5cfae8a0f9ba194527e6d057378c63f9ff850ad779b4cf3e59a518de321e6ddcee823190d3d5f045a7126afc4e.f13e07bccd9b1cc2dd13601367683a6f			user	["manage_expenses", "manage_customers"]	t	2025-05-05 14:53:06.383859	2025-09-29 18:48:13.521	\N	admin
\.


--
-- TOC entry 3576 (class 0 OID 327817)
-- Dependencies: 241
-- Data for Name: vehicle_waitlist; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vehicle_waitlist (id, customer_id, vehicle_id, vehicle_type, preferred_start_date, preferred_end_date, duration, priority, status, notes, contacted_at, fulfilled_at, created_at, updated_at, created_by, updated_by) FROM stdin;
\.


--
-- TOC entry 3578 (class 0 OID 327827)
-- Dependencies: 243
-- Data for Name: vehicles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.vehicles (id, license_plate, brand, model, vehicle_type, chassis_number, fuel, ad_blue, euro_zone, euro_zone_end_date, internal_appointments, apk_date, company, company_date, registered_to, registered_to_date, gps, monthly_price, daily_price, date_in, date_out, contract_number, damage_check, damage_check_date, damage_check_attachment, damage_check_attachment_date, creation_date, created_by, departure_mileage, return_mileage, roadside_assistance, spare_key, remarks, winter_tires, tire_size, wok_notification, radio_code, warranty_end_date, seatcovers, backupbeepers, created_at, updated_at, updated_by, company_by, registered_to_by, production_date, imei, maintenance_status, maintenance_note, gps_swapped, gps_activated, spare_tire, tools_and_jack, current_mileage, last_service_date, last_service_mileage) FROM stdin;
32	50-FJ-NV	SEAT2	AROSA	Sedan	\N	\N	f	\N	\N		2026-10-06	false	\N	true	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-05-05 21:48:47.632694	2025-05-05 21:48:47.632694	admin	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
34	78-FR-ST	Mercedes-Benz	V60	SUV	53TUZ7N450AKDVYU7	LPG	f	Euro 5	\N		2025-10-05	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		2026-07-05	f	f	2025-05-05 21:52:31.722291	2025-05-05 21:52:31.722291	keeslam	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
36	45-LS-FB	Toyota	Sportage	Van	SBNLT0JXRG8A4YA4F	Electric	f	Euro 6	\N		2025-06-05	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		2027-04-05	f	f	2025-05-05 22:05:33.08149	2025-05-05 22:05:33.08149	keeslam	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
37	67-BV-TL	OPEL	COMBO-C-VAN Z17DTH AC	Van	\N	\N	f	\N	\N		2025-06-13	true	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-05-05 22:06:32.258834	2025-05-05 22:06:32.258834	keeslam	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
26	5T-VV-22	VOLKSWAGEN	GOLF PLUS	Sedan	\N	\N	f	\N	\N		2025-04-17	true	2025-05-05	false	2025-05-05	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-05-05 13:41:44.30174	2025-05-05 13:41:44.30174	test_user	test_user	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
16	40-RK-B4	SKODA	OCTAVIA	Sedan	\N	\N	f	\N	\N		2025-04-05	true	2025-05-05	false	2025-05-05	t	\N	\N	\N	\N		f	\N		\N	\N	admin	1221	\N	f	f		f		f		\N	f	f	2025-05-03 20:53:47.178695	2025-05-03 20:53:47.178695	admin	\N	\N	\N	24342342	ok	\N	\N	\N	\N	\N	\N	\N	\N
48	37-LT-V1	JAGUAR	JAGUAR XF	Sedan			f		\N		2024-01-30	true	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-09-26 21:43:15.486614	2025-09-26 21:43:15.486614	keeslam	\N	\N	2010-07-03	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
30	GV-24-9T	RENAULT	TRAFIC	Sedan	\N	\N	f	\N	\N		2025-06-03	true	2025-05-05	false	2025-05-05	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-05-05 13:43:48.476989	2025-05-05 13:43:48.476989	admin	keeslam	keeslam	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
49	N7-71-FT	JAGUAR LAND ROVER	RANGE ROVER	Sedan			f		\N		2026-10-03	false	\N	true	\N	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-09-28 01:01:43.396317	2025-09-28 01:01:43.396317	admin	\N	\N	2014-01-21	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
41	41-GR-S2	VOLKSWAGEN	TRANSPORTER	Sedan			f		\N		2026-09-26	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-09-19 22:56:23.247114	2025-09-19 22:56:23.247114	keeslam	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
20	G5-68-RG	BMW	X1 SDRIVE20I	SUV	\N	\N	f	\N	\N		2025-11-19	true	2025-05-05	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-05-03 20:58:08.006641	2025-05-03 20:58:08.006641	\N	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
42	RP-18-6S	MITSUBISHI	MITSUBISHI SPACE STAR	Sedan			f		\N		2026-01-08	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-09-20 15:26:05.049133	2025-09-20 15:26:05.049133	keeslam	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
45	NT-26-0X	MITSUBISHI	MITSUBISHI SPACE STAR	Sedan			f		\N		2026-04-24	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-09-20 23:00:11.122372	2025-09-20 23:00:11.122372	admin	\N	\N	2017-04-24	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
25	R6-95-SG	HONDA	CIVIC	Hatchback	\N	\N	t	\N	\N		2026-11-19	true	2025-05-05	false	2025-05-05	t	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-05-04 14:41:43.887549	2025-05-04 14:41:43.887549	\N	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
46	NT-25-9X	MITSUBISHI	MITSUBISHI SPACE STAR	Sedan			f		\N		2026-04-24	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-09-20 23:20:22.860408	2025-09-20 23:20:22.860408	admin	\N	\N	2017-04-24	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
5	02-NV-X7	PEUGEOT	308	Sedan	\N	\N	f	\N	\N	\N	2024-12-01	true	2025-05-04	false	2025-05-03	t	\N	\N	\N	\N	\N	t	2025-05-05	73	2025-05-05	\N	\N	\N	\N	f	f	\N	f	\N	f	\N	\N	f	f	2025-05-02 22:54:07.554647	2025-05-02 22:54:07.554647	admin	\N	\N	\N	32413213213123	ok	\N	\N	\N	\N	\N	\N	\N	\N
38	97-GR-D4	SUZUKI	SWIFT	Sedan	\N	\N	f	\N	\N		2025-09-12	false	\N	false	\N	f	\N	\N	\N	\N		t	2025-09-29	87	2025-09-29	\N	keeslam	\N	\N	f	f		f		f		2026-03-05	f	f	2025-05-05 22:10:48.855111	2025-05-05 22:10:48.855111	admin	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
33	31-VZ-TP	VOLKSWAGEN	TRANSPORTER BESTEL 0,7 D 50 KW	Van	\N	\N	t	\N	\N		2026-02-17	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-05-05 21:52:00.161812	2025-05-05 21:52:00.161812	admin	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
18	R8-97-RG	VOLKSWAGEN	POLO	Hatchback	\N	\N	f	\N	\N		2025-05-16	true	2025-05-03	true	2025-05-04	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		2025-05-14	f	f	2025-05-03 20:57:28.247578	2025-05-03 20:57:28.247578	\N	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
23	R7-89-RT	NISSAN	NISSAN QASHQAI	SUV	\N	\N	f	\N	\N		2025-10-21	true	2025-05-05	false	2025-05-05	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-05-03 23:18:37.001883	2025-05-03 23:18:37.001883	admin	keeslam	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
31	98-GR-D6	VOLKSWAGEN	TRANSPORTER	Sedan	\N	\N	f	\N	\N		2025-12-09	true	2025-05-05	false	2025-05-05	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	\N	\N	f	f		f		f		\N	f	f	2025-05-05 15:11:29.747012	2025-05-05 15:11:29.747012	admin	admin	admin	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
3	42-GR-S5	TOYOTA	TOYOTA AYGO	Truck	\N	\N	f	\N	\N	\N	2026-01-09	false	2025-05-05	true	2025-05-05	t	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	156	144	f	f	\N	f	\N	f	\N	\N	f	f	2025-05-02 22:54:07.021645	2025-05-02 22:54:07.021645	admin	keeslam	keeslam	\N	32413213	ok	\N	\N	\N	\N	\N	\N	\N	\N
47	35-PL-LS	VOLKSWAGEN	TRANSPORTER	Sedan			f		\N		2025-11-22	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-09-21 10:59:57.040784	2025-09-21 10:59:57.040784	admin	\N	\N	2004-08-20	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
35	65-HV-Z1	FORD	TRANSIT/TOURNEO	Van	\N	\N	f	\N	\N		2026-03-01	false	\N	false	\N	f	\N	\N	\N	\N		f	\N		\N	\N	keeslam	15665	1266	f	f		f		f		\N	f	f	2025-05-05 21:57:33.706178	2025-05-05 21:57:33.706178	admin	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
1	XX-LL-20	RENAULT	TWINGO	Sedan	\N	\N	f	\N	\N	\N	2026-10-06	false	2025-05-05	true	2025-10-06	f	\N	\N	\N	\N	\N	f	2025-05-05	71	2025-05-05	\N	\N	123	\N	f	f	\N	f	\N	f	\N	\N	f	f	2025-05-02 21:59:50.625258	2025-05-02 21:59:50.625258	admin	admin	admin	\N	24342342233	ok	\N	t	t	f	f	2150	2025-11-08	2150
21	4T-VV-22	FIAT	FIAT DUCATO	Van	\N	\N	f	\N	\N		2025-10-31	true	2025-05-05	false	2025-05-04	f	\N	\N	\N	\N		t	2025-09-21	84	2025-09-21	\N	admin	1235	1234	f	f		f		f		\N	f	f	2025-05-03 21:59:16.6857	2025-05-03 21:59:16.6857	admin	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
22	R4-89-ZD	RENAULT	CAPTUR (E-TECH PLUG-IN HYBRID)	SUV	\N	Hybrid	f	\N	\N		2026-12-16	true	2025-05-03	false	\N	f	\N	\N	\N	\N		f	2025-05-04	54	2025-05-04	\N	admin	12	1234	f	f		f		f		\N	f	f	2025-05-03 23:06:52.085566	2025-05-03 23:06:52.085566	admin	\N	\N	\N	\N	ok	\N	\N	\N	\N	\N	\N	\N	\N
24	12-XP-DZ	FIAT	FIAT DUCATO	Van	\N	\N	f	\N	\N		2026-02-27	true	2025-05-04	false	\N	t	\N	\N	\N	\N		t	2025-05-04	48	2025-05-04	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-05-04 10:01:34.098953	2025-05-04 10:01:34.098953	admin	\N	\N	\N	1234433	ok	\N	\N	\N	\N	\N	\N	\N	\N
50	33-TH-B4	TOYOTA	TOYOTA AYGO	Sedan			f		\N		2026-08-18	false	\N	true	\N	f	\N	\N	\N	\N		f	\N		\N	\N	admin	\N	\N	f	f		f		f		\N	f	f	2025-10-16 17:27:03.08386	2025-10-16 17:27:03.08386	admin	\N	\N	2012-01-31	\N	ok	\N	\N	\N	f	f	\N	\N	\N
\.


--
-- TOC entry 3604 (class 0 OID 0)
-- Dependencies: 216
-- Name: app_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.app_settings_id_seq', 10, true);


--
-- TOC entry 3605 (class 0 OID 0)
-- Dependencies: 218
-- Name: backup_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.backup_settings_id_seq', 1, true);


--
-- TOC entry 3606 (class 0 OID 0)
-- Dependencies: 220
-- Name: custom_notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.custom_notifications_id_seq', 30, true);


--
-- TOC entry 3607 (class 0 OID 0)
-- Dependencies: 222
-- Name: customer_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_users_id_seq', 3, true);


--
-- TOC entry 3608 (class 0 OID 0)
-- Dependencies: 224
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customers_id_seq', 11, true);


--
-- TOC entry 3609 (class 0 OID 0)
-- Dependencies: 226
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.documents_id_seq', 132, true);


--
-- TOC entry 3610 (class 0 OID 0)
-- Dependencies: 245
-- Name: drivers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.drivers_id_seq', 13, true);


--
-- TOC entry 3611 (class 0 OID 0)
-- Dependencies: 228
-- Name: email_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.email_logs_id_seq', 53, true);


--
-- TOC entry 3612 (class 0 OID 0)
-- Dependencies: 230
-- Name: email_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.email_templates_id_seq', 4, true);


--
-- TOC entry 3613 (class 0 OID 0)
-- Dependencies: 232
-- Name: expenses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.expenses_id_seq', 71, true);


--
-- TOC entry 3614 (class 0 OID 0)
-- Dependencies: 234
-- Name: extension_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.extension_requests_id_seq', 1, false);


--
-- TOC entry 3615 (class 0 OID 0)
-- Dependencies: 236
-- Name: pdf_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pdf_templates_id_seq', 9, true);


--
-- TOC entry 3616 (class 0 OID 0)
-- Dependencies: 238
-- Name: reservations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reservations_id_seq', 159, true);


--
-- TOC entry 3617 (class 0 OID 0)
-- Dependencies: 240
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- TOC entry 3618 (class 0 OID 0)
-- Dependencies: 242
-- Name: vehicle_waitlist_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vehicle_waitlist_id_seq', 1, false);


--
-- TOC entry 3619 (class 0 OID 0)
-- Dependencies: 244
-- Name: vehicles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vehicles_id_seq', 50, true);


--
-- TOC entry 3341 (class 2606 OID 327852)
-- Name: app_settings app_settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_key_unique UNIQUE (key);


--
-- TOC entry 3343 (class 2606 OID 327854)
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3345 (class 2606 OID 327856)
-- Name: backup_settings backup_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_settings
    ADD CONSTRAINT backup_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 3347 (class 2606 OID 327858)
-- Name: custom_notifications custom_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_notifications
    ADD CONSTRAINT custom_notifications_pkey PRIMARY KEY (id);


--
-- TOC entry 3349 (class 2606 OID 327860)
-- Name: customer_users customer_users_customer_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users
    ADD CONSTRAINT customer_users_customer_id_unique UNIQUE (customer_id);


--
-- TOC entry 3351 (class 2606 OID 327862)
-- Name: customer_users customer_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users
    ADD CONSTRAINT customer_users_email_unique UNIQUE (email);


--
-- TOC entry 3353 (class 2606 OID 327864)
-- Name: customer_users customer_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users
    ADD CONSTRAINT customer_users_pkey PRIMARY KEY (id);


--
-- TOC entry 3355 (class 2606 OID 327866)
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- TOC entry 3357 (class 2606 OID 327868)
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- TOC entry 3381 (class 2606 OID 344077)
-- Name: drivers drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_pkey PRIMARY KEY (id);


--
-- TOC entry 3359 (class 2606 OID 327870)
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 3361 (class 2606 OID 327872)
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 3363 (class 2606 OID 327874)
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- TOC entry 3365 (class 2606 OID 327876)
-- Name: extension_requests extension_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_pkey PRIMARY KEY (id);


--
-- TOC entry 3367 (class 2606 OID 327878)
-- Name: pdf_templates pdf_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pdf_templates
    ADD CONSTRAINT pdf_templates_pkey PRIMARY KEY (id);


--
-- TOC entry 3369 (class 2606 OID 327880)
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- TOC entry 3384 (class 2606 OID 385030)
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- TOC entry 3371 (class 2606 OID 327884)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3373 (class 2606 OID 327886)
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- TOC entry 3375 (class 2606 OID 327888)
-- Name: vehicle_waitlist vehicle_waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_waitlist
    ADD CONSTRAINT vehicle_waitlist_pkey PRIMARY KEY (id);


--
-- TOC entry 3377 (class 2606 OID 327890)
-- Name: vehicles vehicles_license_plate_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_license_plate_unique UNIQUE (license_plate);


--
-- TOC entry 3379 (class 2606 OID 327892)
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (id);


--
-- TOC entry 3382 (class 1259 OID 385031)
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- TOC entry 3385 (class 2606 OID 327894)
-- Name: custom_notifications custom_notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.custom_notifications
    ADD CONSTRAINT custom_notifications_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- TOC entry 3386 (class 2606 OID 327899)
-- Name: customer_users customer_users_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_users
    ADD CONSTRAINT customer_users_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- TOC entry 3387 (class 2606 OID 327904)
-- Name: customers customers_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3388 (class 2606 OID 327909)
-- Name: customers customers_updated_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_updated_by_user_id_users_id_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3389 (class 2606 OID 327914)
-- Name: documents documents_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3390 (class 2606 OID 327919)
-- Name: documents documents_updated_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_updated_by_user_id_users_id_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3403 (class 2606 OID 352261)
-- Name: drivers drivers_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3404 (class 2606 OID 352256)
-- Name: drivers drivers_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 3405 (class 2606 OID 344103)
-- Name: drivers drivers_license_document_id_documents_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_license_document_id_documents_id_fk FOREIGN KEY (license_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- TOC entry 3406 (class 2606 OID 352266)
-- Name: drivers drivers_updated_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drivers
    ADD CONSTRAINT drivers_updated_by_user_id_users_id_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3391 (class 2606 OID 327924)
-- Name: expenses expenses_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3392 (class 2606 OID 327929)
-- Name: expenses expenses_updated_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_updated_by_user_id_users_id_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3393 (class 2606 OID 327934)
-- Name: extension_requests extension_requests_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- TOC entry 3394 (class 2606 OID 327939)
-- Name: extension_requests extension_requests_reservation_id_reservations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_reservation_id_reservations_id_fk FOREIGN KEY (reservation_id) REFERENCES public.reservations(id);


--
-- TOC entry 3395 (class 2606 OID 327944)
-- Name: extension_requests extension_requests_reviewed_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_reviewed_by_users_id_fk FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- TOC entry 3396 (class 2606 OID 327949)
-- Name: extension_requests extension_requests_vehicle_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_vehicle_id_vehicles_id_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


--
-- TOC entry 3397 (class 2606 OID 327954)
-- Name: reservations reservations_created_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_created_by_user_id_users_id_fk FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3398 (class 2606 OID 327959)
-- Name: reservations reservations_deleted_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_deleted_by_user_id_users_id_fk FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3399 (class 2606 OID 344108)
-- Name: reservations reservations_driver_id_drivers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_driver_id_drivers_id_fk FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;


--
-- TOC entry 3400 (class 2606 OID 327964)
-- Name: reservations reservations_updated_by_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_updated_by_user_id_users_id_fk FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id);


--
-- TOC entry 3401 (class 2606 OID 327969)
-- Name: vehicle_waitlist vehicle_waitlist_customer_id_customers_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_waitlist
    ADD CONSTRAINT vehicle_waitlist_customer_id_customers_id_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- TOC entry 3402 (class 2606 OID 327974)
-- Name: vehicle_waitlist vehicle_waitlist_vehicle_id_vehicles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_waitlist
    ADD CONSTRAINT vehicle_waitlist_vehicle_id_vehicles_id_fk FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id);


-- Completed on 2025-10-17 00:00:09 UTC

--
-- PostgreSQL database dump complete
--

