export interface ColorRule {
  id: string;
  name: string;
  description: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  category: 'reservation-status' | 'reservation-type' | 'maintenance-type' | 'maintenance-priority' | 'indicators';
  enabled: boolean;
}

export const DEFAULT_COLOR_RULES: ColorRule[] = [
  // Reservation Status Colors
  {
    id: 'res-confirmed',
    name: 'Confirmed Reservation',
    description: 'Reservations that have been confirmed',
    backgroundColor: 'rgb(239 246 255)', // blue-50
    textColor: 'rgb(30 58 138)', // blue-900
    borderColor: 'rgb(147 197 253)', // blue-300
    category: 'reservation-status',
    enabled: true
  },
  {
    id: 'res-pending',
    name: 'Pending Reservation',
    description: 'Reservations awaiting confirmation',
    backgroundColor: 'rgb(255 251 235)', // amber-50
    textColor: 'rgb(146 64 14)', // amber-900
    borderColor: 'rgb(252 211 77)', // amber-300
    category: 'reservation-status',
    enabled: true
  },
  {
    id: 'res-completed',
    name: 'Completed Reservation',
    description: 'Reservations that have been completed',
    backgroundColor: 'rgb(240 253 244)', // green-50
    textColor: 'rgb(20 83 45)', // green-900
    borderColor: 'rgb(134 239 172)', // green-300
    category: 'reservation-status',
    enabled: true
  },
  {
    id: 'res-cancelled',
    name: 'Cancelled Reservation',
    description: 'Reservations that have been cancelled',
    backgroundColor: 'rgb(254 242 242)', // red-50
    textColor: 'rgb(127 29 29)', // red-900
    borderColor: 'rgb(252 165 165)', // red-300
    category: 'reservation-status',
    enabled: true
  },
  
  // Reservation Type Colors
  {
    id: 'res-spare',
    name: 'Spare Vehicle',
    description: 'Spare vehicle assignments',
    backgroundColor: 'rgb(255 247 237)', // orange-50
    textColor: 'rgb(154 52 18)', // orange-900
    borderColor: 'rgb(253 186 116)', // orange-300
    category: 'reservation-type',
    enabled: true
  },
  {
    id: 'res-tbd',
    name: 'TBD Spare Vehicle',
    description: 'Spare vehicles to be determined',
    backgroundColor: 'rgb(255 237 213)', // orange-100
    textColor: 'rgb(194 65 12)', // orange-800
    borderColor: 'rgb(251 146 60)', // orange-400
    category: 'reservation-type',
    enabled: true
  },
  
  // Maintenance Type Colors
  {
    id: 'maint-routine',
    name: 'Routine Maintenance',
    description: 'Regular scheduled maintenance',
    backgroundColor: 'rgb(236 254 255)', // cyan-50
    textColor: 'rgb(22 78 99)', // cyan-900
    borderColor: 'rgb(103 232 249)', // cyan-300
    category: 'maintenance-type',
    enabled: true
  },
  {
    id: 'maint-breakdown',
    name: 'Breakdown Repair',
    description: 'Emergency breakdown repairs',
    backgroundColor: 'rgb(254 242 242)', // red-50
    textColor: 'rgb(127 29 29)', // red-900
    borderColor: 'rgb(252 165 165)', // red-300
    category: 'maintenance-type',
    enabled: true
  },
  {
    id: 'maint-inspection',
    name: 'Inspection',
    description: 'Vehicle inspections and checks',
    backgroundColor: 'rgb(250 250 250)', // gray-50
    textColor: 'rgb(17 24 39)', // gray-900
    borderColor: 'rgb(209 213 219)', // gray-300
    category: 'maintenance-type',
    enabled: true
  },
  
  // Priority Colors
  {
    id: 'priority-high',
    name: 'High Priority',
    description: 'High priority maintenance items',
    backgroundColor: 'rgb(254 242 242)', // red-50
    textColor: 'rgb(127 29 29)', // red-900
    borderColor: 'rgb(248 113 113)', // red-400
    category: 'maintenance-priority',
    enabled: true
  },
  {
    id: 'priority-medium',
    name: 'Medium Priority',
    description: 'Medium priority maintenance items',
    backgroundColor: 'rgb(255 251 235)', // amber-50
    textColor: 'rgb(146 64 14)', // amber-900
    borderColor: 'rgb(251 191 36)', // amber-400
    category: 'maintenance-priority',
    enabled: true
  },
  {
    id: 'priority-low',
    name: 'Low Priority',
    description: 'Low priority maintenance items',
    backgroundColor: 'rgb(240 253 244)', // green-50
    textColor: 'rgb(20 83 45)', // green-900
    borderColor: 'rgb(74 222 128)', // green-400
    category: 'maintenance-priority',
    enabled: true
  },
  
  // Indicator Colors
  {
    id: 'pickup-day',
    name: 'Pickup Day',
    description: 'Vehicle pickup indicators',
    backgroundColor: 'rgb(220 252 231)', // green-100
    textColor: 'rgb(21 128 61)', // green-700
    borderColor: 'rgb(34 197 94)', // green-500
    category: 'indicators',
    enabled: true
  },
  {
    id: 'return-day',
    name: 'Return Day',
    description: 'Vehicle return indicators',
    backgroundColor: 'rgb(219 234 254)', // blue-100
    textColor: 'rgb(29 78 216)', // blue-700
    borderColor: 'rgb(59 130 246)', // blue-500
    category: 'indicators',
    enabled: true
  }
];

// Export function to get color rules for use in calendars
export function getColorRules(): ColorRule[] {
  try {
    const saved = localStorage.getItem('calendar-color-rules');
    return saved ? JSON.parse(saved) : DEFAULT_COLOR_RULES;
  } catch {
    return DEFAULT_COLOR_RULES;
  }
}

// Helper function to get color style for a specific rule
export function getColorStyle(ruleId: string): { backgroundColor: string; color: string; borderColor: string } | null {
  const rules = getColorRules();
  const rule = rules.find(r => r.id === ruleId && r.enabled);
  
  if (!rule) return null;
  
  return {
    backgroundColor: rule.backgroundColor,
    color: rule.textColor,
    borderColor: rule.borderColor
  };
}