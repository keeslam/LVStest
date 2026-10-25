import { UserPermission, UserRole } from './schema';

export type FieldType = 'text' | 'number' | 'date' | 'boolean';

export type FilterOperator = 
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains' | 'starts_with' | 'ends_with'
  | 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal'
  | 'is_null' | 'is_not_null'
  | 'between'
  | 'in' | 'not_in';

export type AggregationFunction = 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'COUNT_DISTINCT';

export interface DataSourceField {
  name: string;
  label: string;
  type: FieldType;
  table: string;
  operators: FilterOperator[];
  aggregatable: boolean;
  /** Km data: admin only in every use (column, filter, group, calculation, also through a link). */
  adminOnly?: boolean;
}

/** The ids of the builder's data sources. */
export type ReportSourceId =
  | 'vehicles' | 'customers' | 'reservations' | 'expenses' | 'drivers'
  | 'fines' | 'transports' | 'workshop_visits' | 'damage_checks' | 'mileage_readings';

/**
 * A many-to-one link from a source to the row its column points at (never one-to-many,
 * so a report row never doubles). `column` is the main table's property that holds the id.
 */
export interface ReportSourceLink {
  name: 'vehicle' | 'customer' | 'reservation' | 'driver';
  target: ReportSourceId;
  column: string;
}

/** Who may use a source: admins only, or anyone holding one of these permissions. */
export type ReportSourceAccess = { adminOnly: true } | { anyOf: readonly string[] };

export interface DataSource {
  id: string;
  name: string;
  table: string;
  fields: DataSourceField[];
  /** No access rule means the report right alone is enough. */
  access?: ReportSourceAccess;
  /** The column that holds the vehicle id (scope on one vehicle); none for sources without a vehicle. */
  vehicleField?: string;
  /** Rows of other sources this source points at; their fields can be shown "via" the link. */
  links?: ReportSourceLink[];
  joinable?: {
    sourceTable: string;
    sourceField: string;
    targetTable: string;
    targetField: string;
  }[];
}

export interface ReportColumn {
  field: string;
  table: string;
  label: string;
  aggregation?: AggregationFunction;
  /** Name of a link of the main source: the field is read from the linked row. */
  via?: string;
}

export interface ReportFilter {
  field: string;
  table: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
  value2?: string | number;
  /** Name of a link of the main source: the field is read from the linked row. */
  via?: string;
}

export interface ReportGrouping {
  field: string;
  table: string;
  /** Date fields only: group per office-time month instead of per value. */
  period?: "month";
  /** Name of a link of the main source: the field is read from the linked row. */
  via?: string;
}

/** Tabs a saved builder report can be placed on (not overview, not fiscal). */
export const SAVED_REPORT_TABS = ['expenses', 'vehicles', 'customers', 'transports', 'financial', 'portal', 'office'] as const;
export type SavedReportTab = typeof SAVED_REPORT_TABS[number];

/** The period (office days, both ends included) and optional vehicle a tab runs a report within. */
export interface ReportScope {
  /** Both or neither: without them the period does not filter. */
  from?: string;
  to?: string;
  vehicleId?: number;
}

export interface ReportConfiguration {
  name: string;
  description?: string;
  dataSources: string[];
  columns: ReportColumn[];
  filters: ReportFilter[];
  groupBy: ReportGrouping[];
  orderBy?: {
    field: string;
    table: string;
    direction: 'ASC' | 'DESC';
  }[];
  limit?: number;
  /** Tab the saved report is shown on; none means only under Saved reports. */
  tab?: SavedReportTab;
  /** Date field of the source that the period of a tab applies to; none means the whole table. */
  periodField?: string;
}

const textOperators: FilterOperator[] = [
  'equals', 'not_equals', 'contains', 'not_contains', 
  'starts_with', 'ends_with', 'is_null', 'is_not_null'
];

const numberOperators: FilterOperator[] = [
  'equals', 'not_equals', 'greater_than', 'less_than',
  'greater_or_equal', 'less_or_equal', 'between', 'is_null', 'is_not_null'
];

const dateOperators: FilterOperator[] = [
  'equals', 'not_equals', 'greater_than', 'less_than',
  'greater_or_equal', 'less_or_equal', 'between', 'is_null', 'is_not_null'
];

const booleanOperators: FilterOperator[] = ['equals', 'is_null', 'is_not_null'];

/** One field with the operators and aggregatability that belong to its type. */
function sourceField(table: string, name: string, label: string, type: FieldType, adminOnly?: 'adminOnly'): DataSourceField {
  const operators = type === 'number' ? numberOperators
    : type === 'date' ? dateOperators
    : type === 'boolean' ? booleanOperators
    : textOperators;
  const field: DataSourceField = { name, label, type, table, operators, aggregatable: type === 'number' };
  if (adminOnly) field.adminOnly = true;
  return field;
}

function sourceFields(table: string, list: [string, string, FieldType, 'adminOnly'?][]): DataSourceField[] {
  return list.map(([name, label, type, adminOnly]) => sourceField(table, name, label, type, adminOnly));
}

const CUSTOMER_ACCESS: ReportSourceAccess = {
  anyOf: [UserPermission.VIEW_CUSTOMERS, UserPermission.MANAGE_CUSTOMERS],
};

const VEHICLE_LINK: ReportSourceLink = { name: 'vehicle', target: 'vehicles', column: 'vehicleId' };
const CUSTOMER_LINK: ReportSourceLink = { name: 'customer', target: 'customers', column: 'customerId' };
const RESERVATION_LINK: ReportSourceLink = { name: 'reservation', target: 'reservations', column: 'reservationId' };
const DRIVER_LINK: ReportSourceLink = { name: 'driver', target: 'drivers', column: 'driverId' };

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'vehicles',
    vehicleField: 'id',
    name: 'Vehicles',
    table: 'vehicles',
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'vehicles', operators: numberOperators, aggregatable: true },
      { name: 'licensePlate', label: 'License Plate', type: 'text', table: 'vehicles', operators: textOperators, aggregatable: false },
      { name: 'brand', label: 'Brand', type: 'text', table: 'vehicles', operators: textOperators, aggregatable: false },
      { name: 'model', label: 'Model', type: 'text', table: 'vehicles', operators: textOperators, aggregatable: false },
      { name: 'vehicleType', label: 'Vehicle Type', type: 'text', table: 'vehicles', operators: textOperators, aggregatable: false },
      { name: 'fuel', label: 'Fuel Type', type: 'text', table: 'vehicles', operators: textOperators, aggregatable: false },
      { name: 'monthlyPrice', label: 'Monthly Price', type: 'number', table: 'vehicles', operators: numberOperators, aggregatable: true },
      { name: 'dailyPrice', label: 'Daily Price', type: 'number', table: 'vehicles', operators: numberOperators, aggregatable: true },
      { name: 'currentMileage', label: 'Current Mileage', type: 'number', table: 'vehicles', operators: numberOperators, aggregatable: true, adminOnly: true },
      { name: 'apkDate', label: 'APK Date', type: 'date', table: 'vehicles', operators: dateOperators, aggregatable: false },
      { name: 'warrantyEndDate', label: 'Warranty End Date', type: 'date', table: 'vehicles', operators: dateOperators, aggregatable: false },
      { name: 'maintenanceStatus', label: 'Maintenance Status', type: 'text', table: 'vehicles', operators: textOperators, aggregatable: false },
      { name: 'gps', label: 'Has GPS', type: 'boolean', table: 'vehicles', operators: booleanOperators, aggregatable: false },
    ],
  },
  {
    id: 'customers',
    name: 'Customers',
    table: 'customers',
    access: CUSTOMER_ACCESS,
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'customers', operators: numberOperators, aggregatable: true },
      { name: 'name', label: 'Name', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
      { name: 'debtorNumber', label: 'Debtor Number', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
      { name: 'email', label: 'Email', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
      { name: 'phone', label: 'Phone', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
      { name: 'customerType', label: 'Customer Type', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
      { name: 'corporateDiscount', label: 'Corporate Discount (%)', type: 'number', table: 'customers', operators: numberOperators, aggregatable: true },
      { name: 'city', label: 'City', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
      { name: 'country', label: 'Country', type: 'text', table: 'customers', operators: textOperators, aggregatable: false },
    ],
  },
  {
    id: 'reservations',
    vehicleField: 'vehicleId',
    links: [VEHICLE_LINK, CUSTOMER_LINK, DRIVER_LINK],
    name: 'Reservations',
    table: 'reservations',
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'startDate', label: 'Start Date', type: 'date', table: 'reservations', operators: dateOperators, aggregatable: false },
      { name: 'endDate', label: 'End Date', type: 'date', table: 'reservations', operators: dateOperators, aggregatable: false },
      { name: 'status', label: 'Status', type: 'text', table: 'reservations', operators: textOperators, aggregatable: false },
      { name: 'type', label: 'Reservation Type', type: 'text', table: 'reservations', operators: textOperators, aggregatable: false },
      { name: 'totalPrice', label: 'Total Amount', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'pickupMileage', label: 'Pickup Mileage', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true, adminOnly: true },
      { name: 'returnMileage', label: 'Return Mileage', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true, adminOnly: true },
      { name: 'deliveryRequired', label: 'Delivery Required', type: 'boolean', table: 'reservations', operators: booleanOperators, aggregatable: false },
      { name: 'deliveryFee', label: 'Delivery Fee', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
    ],
  },
  {
    id: 'expenses',
    vehicleField: 'vehicleId',
    links: [VEHICLE_LINK],
    name: 'Expenses',
    table: 'expenses',
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'expenses', operators: numberOperators, aggregatable: true },
      { name: 'category', label: 'Category', type: 'text', table: 'expenses', operators: textOperators, aggregatable: false },
      { name: 'amount', label: 'Amount', type: 'number', table: 'expenses', operators: numberOperators, aggregatable: true },
      { name: 'date', label: 'Date', type: 'date', table: 'expenses', operators: dateOperators, aggregatable: false },
      { name: 'description', label: 'Description', type: 'text', table: 'expenses', operators: textOperators, aggregatable: false },
    ],
  },
  {
    id: 'drivers',
    links: [CUSTOMER_LINK],
    name: 'Drivers',
    table: 'drivers',
    access: CUSTOMER_ACCESS,
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'drivers', operators: numberOperators, aggregatable: true },
      { name: 'firstName', label: 'First Name', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'lastName', label: 'Last Name', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'email', label: 'Email', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'phone', label: 'Phone', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'isPrimaryDriver', label: 'Is Primary Driver', type: 'boolean', table: 'drivers', operators: booleanOperators, aggregatable: false },
    ],
  },
  {
    id: 'fines',
    vehicleField: 'vehicleId',
    links: [VEHICLE_LINK, CUSTOMER_LINK, DRIVER_LINK, RESERVATION_LINK],
    name: 'Fines',
    table: 'fines',
    access: { anyOf: [UserPermission.VIEW_FINES, UserPermission.MANAGE_FINES] },
    fields: sourceFields('fines', [
      ['id', 'ID', 'number'],
      ['licensePlate', 'License Plate', 'text'],
      ['vehicleId', 'Vehicle ID', 'number'],
      ['offenceAt', 'Offence Date', 'date'],
      ['receivedAt', 'Received On', 'date'],
      ['reference', 'Reference', 'text'],
      ['description', 'Description', 'text'],
      ['amount', 'Amount', 'number'],
      ['adminFee', 'Admin Fee', 'number'],
      ['totalAmount', 'Total Amount', 'number'],
      ['status', 'Status', 'text'],
      ['source', 'Source', 'text'],
      ['customerId', 'Customer ID', 'number'],
      ['reservationId', 'Reservation ID', 'number'],
      ['driverId', 'Driver ID', 'number'],
      ['linkedAt', 'Linked On', 'date'],
    ]),
  },
  {
    id: 'transports',
    vehicleField: 'vehicleId',
    links: [VEHICLE_LINK, CUSTOMER_LINK, RESERVATION_LINK],
    name: 'Transports',
    table: 'vehicle_transports',
    access: {
      anyOf: [
        UserPermission.VIEW_VEHICLES, UserPermission.MANAGE_VEHICLES,
        UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS,
      ],
    },
    fields: sourceFields('vehicle_transports', [
      ['id', 'ID', 'number'],
      ['vehicleId', 'Vehicle ID', 'number'],
      ['isExternalVehicle', 'External Vehicle', 'boolean'],
      ['externalLicensePlate', 'External License Plate', 'text'],
      ['transportType', 'Transport Type', 'text'],
      ['status', 'Status', 'text'],
      ['scheduledDate', 'Scheduled Date', 'date'],
      ['completedDate', 'Completed Date', 'date'],
      ['driverName', 'Driver Name', 'text'],
      ['distanceKm', 'Distance (km)', 'number'],
      ['tollCost', 'Toll Cost', 'number'],
      ['billable', 'Billable', 'boolean'],
      ['billableAmount', 'Billable Amount', 'number'],
      ['invoiced', 'Invoiced', 'boolean'],
      ['invoicedDate', 'Invoiced Date', 'date'],
      ['isBreakdownOrMaintenance', 'Breakdown or Maintenance', 'boolean'],
      ['customerId', 'Customer ID', 'number'],
      ['reservationId', 'Reservation ID', 'number'],
    ]),
  },
  {
    // Virtual table: reservations AS workshop_visits, maintenance blocks only.
    id: 'workshop_visits',
    vehicleField: 'vehicleId',
    // A visit points at the rental it affects (affectedRentalId), not at its own reservation.
    links: [VEHICLE_LINK, { name: 'reservation', target: 'reservations', column: 'affectedRentalId' }],
    name: 'Workshop Visits',
    table: 'workshop_visits',
    access: {
      anyOf: [UserPermission.VIEW_RESERVATIONS, UserPermission.MANAGE_RESERVATIONS, UserPermission.MANAGE_MAINTENANCE],
    },
    fields: sourceFields('workshop_visits', [
      ['id', 'ID', 'number'],
      ['vehicleId', 'Vehicle ID', 'number'],
      ['startDate', 'Start Date', 'date'],
      ['endDate', 'End Date', 'date'],
      ['status', 'Status', 'text'],
      ['maintenanceStatus', 'Maintenance Status', 'text'],
      ['maintenanceCategory', 'Maintenance Category', 'text'],
      ['maintenanceType', 'Maintenance Type', 'text'],
      ['maintenanceDuration', 'Duration (days)', 'number'],
      ['noInvoiceExpected', 'No Invoice Expected', 'boolean'],
      ['affectedRentalId', 'Affected Rental ID', 'number'],
    ]),
  },
  {
    id: 'damage_checks',
    vehicleField: 'vehicleId',
    // No customer link: interactive_damage_checks has no customer column.
    links: [VEHICLE_LINK, RESERVATION_LINK],
    name: 'Damage Checks',
    table: 'interactive_damage_checks',
    access: { anyOf: [UserPermission.VIEW_DAMAGE_CHECKS, UserPermission.MANAGE_DAMAGE_CHECKS] },
    fields: sourceFields('interactive_damage_checks', [
      ['id', 'ID', 'number'],
      ['vehicleId', 'Vehicle ID', 'number'],
      ['reservationId', 'Reservation ID', 'number'],
      ['checkType', 'Check Type', 'text'],
      ['checkDate', 'Check Date', 'date'],
      ['mileage', 'Mileage', 'number', 'adminOnly'],
      ['fuelLevel', 'Fuel Level', 'text'],
      ['completedBy', 'Completed By', 'text'],
    ]),
  },
  {
    id: 'mileage_readings',
    vehicleField: 'vehicleId',
    links: [VEHICLE_LINK],
    name: 'Mileage History',
    table: 'vehicle_mileage_readings',
    access: { adminOnly: true },
    fields: sourceFields('vehicle_mileage_readings', [
      ['id', 'ID', 'number'],
      ['vehicleId', 'Vehicle ID', 'number'],
      ['mileage', 'Mileage', 'number', 'adminOnly'],
      ['recordedAt', 'Recorded At', 'date'],
      ['source', 'Source', 'text'],
      ['actorName', 'Recorded By', 'text'],
      ['voidedAt', 'Voided At', 'date'],
    ]),
  },
];

export interface ReportSourceUser {
  role?: string | null;
  permissions?: readonly string[] | null;
}

/**
 * Whether this user may use this data source. Does NOT check the report
 * right itself; the route does that.
 */
export function canUseReportSource(user: ReportSourceUser | null | undefined, source: DataSource): boolean {
  const access = source.access;
  if (!access) return true;
  if (user?.role === UserRole.ADMIN) return true;
  if ('adminOnly' in access) return false;
  const held = user?.permissions ?? [];
  return access.anyOf.some((p) => held.includes(p));
}

export function getDataSource(id: string): DataSource | undefined {
  return DATA_SOURCES.find(ds => ds.id === id);
}

/**
 * Whether this user may use this field of this source: the source right, and for a km field
 * (adminOnly) the admin role. The builder hides what this refuses; the server refuses it too.
 */
export function canUseReportField(user: ReportSourceUser | null | undefined, source: DataSource, field: DataSourceField | string): boolean {
  if (!canUseReportSource(user, source)) return false;
  const def = typeof field === 'string' ? source.fields.find((f) => f.name === field) : field;
  return !def?.adminOnly || user?.role === UserRole.ADMIN;
}

type ReportEntry = { table: string; field: string; via: unknown };

/** Every column, filter, grouping and sort entry of a report. */
function reportEntriesOf(config: Partial<ReportConfiguration> | null | undefined): ReportEntry[] {
  const out: ReportEntry[] = [];
  for (const list of [config?.columns, config?.filters, config?.groupBy, config?.orderBy]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list as any[]) {
      if (entry && typeof entry === 'object') {
        out.push({ table: String(entry.table), field: String(entry.field), via: entry.via });
      }
    }
  }
  return out;
}

/** Whether an entry reads through a link. Any via that is set counts, also one that is not a string. */
function hasVia(entry: ReportEntry): boolean {
  return entry.via !== undefined && entry.via !== null && entry.via !== '';
}

/** The entries of a report that read a field through a link (valid or not). */
function linkedEntriesOf(config: Partial<ReportConfiguration> | null | undefined): ReportEntry[] {
  return reportEntriesOf(config).filter(hasVia);
}

/**
 * The first entry whose link is not a link of the main source to that entry's table
 * (an unknown name, a non-string, or a field of another table). Null when all links are fine.
 */
export function invalidReportLink(config: Partial<ReportConfiguration> | null | undefined): { via: string; table: string } | null {
  const main = Array.isArray(config?.dataSources) ? config!.dataSources[0] : undefined;
  for (const entry of linkedEntriesOf(config)) {
    const link = getReportLink(main, entry.via);
    if (!link || getDataSource(link.target)?.table !== entry.table) {
      return { via: typeof entry.via === 'string' ? entry.via : JSON.stringify(entry.via) ?? '', table: entry.table };
    }
  }
  return null;
}

/** The first admin-only (km) field the report uses anywhere, directly or through a link; null if none. */
export function adminOnlyFieldOf(config: Partial<ReportConfiguration> | null | undefined): string | null {
  for (const entry of reportEntriesOf(config)) {
    const key = `${entry.table}.${entry.field}`;
    const name = RENAMED_REPORT_FIELDS[key] ?? entry.field;
    if (getField(entry.table, name)?.adminOnly) return `${entry.table}.${name}`;
  }
  return null;
}

/** The link with this name of the report's main (first) source; undefined when it has none. */
export function getReportLink(mainSourceId: unknown, via: unknown): ReportSourceLink | undefined {
  if (typeof via !== 'string') return undefined;
  return getDataSource(String(mainSourceId))?.links?.find((l) => l.name === via);
}

/**
 * The sources a report reads through its links, each once. Unknown links are left out:
 * running the report refuses them with REPORT_LINK_INVALID.
 */
export function linkedSourcesOf(config: Partial<ReportConfiguration> | null | undefined): ReportSourceId[] {
  const main = Array.isArray(config?.dataSources) ? config!.dataSources[0] : undefined;
  const out: ReportSourceId[] = [];
  for (const entry of linkedEntriesOf(config)) {
    const link = getReportLink(main, entry.via);
    if (link && !out.includes(link.target)) out.push(link.target);
  }
  return out;
}

/** A date field of the source, as a report period can apply to it. */
export function isReportPeriodField(sourceId: string, field: unknown): boolean {
  const source = getDataSource(sourceId);
  return !!source && typeof field === 'string' && source.fields.some((f) => f.name === field && f.type === 'date');
}

export function getField(table: string, fieldName: string): DataSourceField | undefined {
  const dataSource = DATA_SOURCES.find(ds => ds.table === table);
  return dataSource?.fields.find(f => f.name === fieldName);
}

/** Old field names that saved reports may still hold, keyed "<table>.<field>". */
export const RENAMED_REPORT_FIELDS: Record<string, string> = {
  'reservations.reservationType': 'type',
  'reservations.totalAmount': 'totalPrice',
  'drivers.isPrimary': 'isPrimaryDriver',
};

/** Fields that never existed in the database and were dropped from the builder. */
export const REMOVED_REPORT_FIELDS: ReadonlySet<string> = new Set([
  'reservations.dailyRate',
  'reservations.paymentStatus',
  'reservations.paidAmount',
  'expenses.mileage',
]);
