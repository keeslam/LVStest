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
}

export interface DataSource {
  id: string;
  name: string;
  table: string;
  fields: DataSourceField[];
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
}

export interface ReportFilter {
  field: string;
  table: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
  value2?: string | number;
}

export interface ReportGrouping {
  field: string;
  table: string;
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

export const DATA_SOURCES: DataSource[] = [
  {
    id: 'vehicles',
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
      { name: 'currentMileage', label: 'Current Mileage', type: 'number', table: 'vehicles', operators: numberOperators, aggregatable: true },
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
    name: 'Reservations',
    table: 'reservations',
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'startDate', label: 'Start Date', type: 'date', table: 'reservations', operators: dateOperators, aggregatable: false },
      { name: 'endDate', label: 'End Date', type: 'date', table: 'reservations', operators: dateOperators, aggregatable: false },
      { name: 'status', label: 'Status', type: 'text', table: 'reservations', operators: textOperators, aggregatable: false },
      { name: 'reservationType', label: 'Reservation Type', type: 'text', table: 'reservations', operators: textOperators, aggregatable: false },
      { name: 'dailyRate', label: 'Daily Rate', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'totalAmount', label: 'Total Amount', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'paymentStatus', label: 'Payment Status', type: 'text', table: 'reservations', operators: textOperators, aggregatable: false },
      { name: 'paidAmount', label: 'Paid Amount', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'pickupMileage', label: 'Pickup Mileage', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'returnMileage', label: 'Return Mileage', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
      { name: 'deliveryRequired', label: 'Delivery Required', type: 'boolean', table: 'reservations', operators: booleanOperators, aggregatable: false },
      { name: 'deliveryFee', label: 'Delivery Fee', type: 'number', table: 'reservations', operators: numberOperators, aggregatable: true },
    ],
  },
  {
    id: 'expenses',
    name: 'Expenses',
    table: 'expenses',
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'expenses', operators: numberOperators, aggregatable: true },
      { name: 'category', label: 'Category', type: 'text', table: 'expenses', operators: textOperators, aggregatable: false },
      { name: 'amount', label: 'Amount', type: 'number', table: 'expenses', operators: numberOperators, aggregatable: true },
      { name: 'date', label: 'Date', type: 'date', table: 'expenses', operators: dateOperators, aggregatable: false },
      { name: 'description', label: 'Description', type: 'text', table: 'expenses', operators: textOperators, aggregatable: false },
      { name: 'mileage', label: 'Mileage at Service', type: 'number', table: 'expenses', operators: numberOperators, aggregatable: true },
    ],
  },
  {
    id: 'drivers',
    name: 'Drivers',
    table: 'drivers',
    fields: [
      { name: 'id', label: 'ID', type: 'number', table: 'drivers', operators: numberOperators, aggregatable: true },
      { name: 'firstName', label: 'First Name', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'lastName', label: 'Last Name', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'email', label: 'Email', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'phone', label: 'Phone', type: 'text', table: 'drivers', operators: textOperators, aggregatable: false },
      { name: 'isPrimary', label: 'Is Primary Driver', type: 'boolean', table: 'drivers', operators: booleanOperators, aggregatable: false },
    ],
  },
];

export function getDataSource(id: string): DataSource | undefined {
  return DATA_SOURCES.find(ds => ds.id === id);
}

export function getField(table: string, fieldName: string): DataSourceField | undefined {
  const dataSource = DATA_SOURCES.find(ds => ds.table === table);
  return dataSource?.fields.find(f => f.name === fieldName);
}
