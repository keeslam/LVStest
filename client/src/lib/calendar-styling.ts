import { getColorRules, ColorRule } from "@/lib/color-rules";

/**
 * Get custom styling for reservations based on status and type
 */
export function getCustomReservationStyle(
  status: string, 
  isStart: boolean, 
  isEnd: boolean, 
  reservationType?: string
): string {
  const colorRules = getColorRules();
  
  let styleClasses = '';
  let customStyle = '';
  
  // Check for maintenance block type first - highest priority
  if (reservationType === 'maintenance_block') {
    const maintenanceRule = colorRules.find(rule => rule.id === 'maint-routine' && rule.enabled);
    if (maintenanceRule) {
      customStyle = `background-color: ${maintenanceRule.backgroundColor}; color: ${maintenanceRule.textColor}; border-color: ${maintenanceRule.borderColor};`;
    } else {
      // Fallback to default maintenance styling (purple/violet theme)
      styleClasses = "bg-purple-100 text-purple-900 border-purple-400";
    }
  }
  // Check for spare vehicle type
  else if (reservationType === 'replacement') {
    const spareRule = colorRules.find(rule => rule.id === 'res-spare' && rule.enabled);
    if (spareRule) {
      customStyle = `background-color: ${spareRule.backgroundColor}; color: ${spareRule.textColor}; border-color: ${spareRule.borderColor};`;
    } else {
      // Fallback to default spare styling
      switch (status.toLowerCase()) {
        case "confirmed":
          styleClasses = "bg-orange-100 text-orange-900 border-orange-400";
          break;
        case "pending":
          styleClasses = "bg-orange-50 text-orange-700 border-orange-300";
          break;
        case "cancelled":
          styleClasses = "bg-orange-50 text-orange-400 border-orange-200";
          break;
        default:
          styleClasses = "bg-orange-100 text-orange-800 border-orange-300";
      }
    }
  } else {
    // Regular reservation - check status colors
    const statusRuleId = `res-${status.toLowerCase()}`;
    const statusRule = colorRules.find(rule => rule.id === statusRuleId && rule.enabled);
    
    if (statusRule) {
      customStyle = `background-color: ${statusRule.backgroundColor}; color: ${statusRule.textColor}; border-color: ${statusRule.borderColor};`;
    } else {
      // Fallback to default status styling
      switch (status.toLowerCase()) {
        case "booked":
        case "confirmed":
        case "active":
          styleClasses = "bg-blue-100 text-blue-900 border-blue-400";
          break;
        case "picked_up":
          styleClasses = "bg-orange-100 text-orange-900 border-orange-400";
          break;
        case "returned":
          styleClasses = "bg-purple-100 text-purple-900 border-purple-400";
          break;
        case "pending":
        case "scheduled":
          styleClasses = "bg-amber-100 text-amber-900 border-amber-400";
          break;
        case "completed":
          styleClasses = "bg-green-100 text-green-900 border-green-400";
          break;
        case "cancelled":
          styleClasses = "bg-red-100 text-red-900 border-red-400";
          break;
        default:
          styleClasses = "bg-gray-100 text-gray-900 border-gray-400";
      }
    }
  }
  
  // Combine style attribute and classes
  return customStyle ? `${styleClasses} border border-solid` : `${styleClasses} border`;
}

/**
 * Get custom styling object for reservations (returns inline styles)
 */
export function getCustomReservationStyleObject(
  status: string, 
  reservationType?: string
): React.CSSProperties {
  const colorRules = getColorRules();
  
  // Check for maintenance block type first - highest priority
  if (reservationType === 'maintenance_block') {
    const maintenanceRule = colorRules.find(rule => rule.id === 'maint-routine' && rule.enabled);
    if (maintenanceRule) {
      return {
        backgroundColor: maintenanceRule.backgroundColor,
        color: maintenanceRule.textColor,
        borderColor: maintenanceRule.borderColor
      };
    }
    // Fallback to default maintenance styling
    return {
      backgroundColor: '#f3e8ff', // purple-100
      color: '#581c87',            // purple-900
      borderColor: '#c084fc'       // purple-400
    };
  }
  // Check for spare vehicle type
  else if (reservationType === 'replacement') {
    const spareRule = colorRules.find(rule => rule.id === 'res-spare' && rule.enabled);
    if (spareRule) {
      return {
        backgroundColor: spareRule.backgroundColor,
        color: spareRule.textColor,
        borderColor: spareRule.borderColor
      };
    }
  } else {
    // Regular reservation - check status colors
    const statusRuleId = `res-${status.toLowerCase()}`;
    const statusRule = colorRules.find(rule => rule.id === statusRuleId && rule.enabled);
    
    if (statusRule) {
      return {
        backgroundColor: statusRule.backgroundColor,
        color: statusRule.textColor,
        borderColor: statusRule.borderColor
      };
    }
  }
  
  return {};
}

/**
 * Get custom styling for maintenance events based on type
 */
export function getCustomMaintenanceStyle(type: string): string {
  const colorRules = getColorRules();
  
  // Map maintenance types to rule IDs
  const typeToRuleId: { [key: string]: string } = {
    'apk_due': 'maint-apk-due',
    'apk_reminder_2m': 'maint-apk-2m',
    'apk_reminder_1m': 'maint-apk-1m',
    'warranty_expiring': 'maint-warranty-due',
    'warranty_reminder_2m': 'maint-warranty-2m',
    'warranty_reminder_1m': 'maint-warranty-1m',
    'scheduled_maintenance': 'maint-routine',
    'in_service': 'maint-inspection',
    'breakdown': 'maint-breakdown',
    'routine': 'maint-routine',
    'inspection': 'maint-inspection'
  };
  
  const ruleId = typeToRuleId[type];
  if (ruleId) {
    const rule = colorRules.find(r => r.id === ruleId && r.enabled);
    if (rule) {
      return `border border-solid`;
    }
  }
  
  // Fallback to default styling
  switch (type) {
    case 'apk_due':
      return 'bg-red-100 text-red-800 border-red-200 border';
    case 'apk_reminder_2m':
      return 'bg-red-50 text-red-600 border-red-100 border';
    case 'apk_reminder_1m':
      return 'bg-red-100 text-red-700 border-red-200 border';
    case 'warranty_expiring':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 border';
    case 'warranty_reminder_2m':
      return 'bg-yellow-50 text-yellow-600 border-yellow-100 border';
    case 'warranty_reminder_1m':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200 border';
    case 'scheduled_maintenance':
      return 'bg-blue-100 text-blue-800 border-blue-200 border';
    case 'in_service':
      return 'bg-orange-100 text-orange-800 border-orange-200 border';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 border';
  }
}

/**
 * Get custom styling object for maintenance events (returns inline styles)
 */
export function getCustomMaintenanceStyleObject(type: string): React.CSSProperties {
  const colorRules = getColorRules();
  
  // Map maintenance types to rule IDs
  const typeToRuleId: { [key: string]: string } = {
    'apk_due': 'maint-apk-due',
    'apk_reminder_2m': 'maint-apk-2m',
    'apk_reminder_1m': 'maint-apk-1m',
    'warranty_expiring': 'maint-warranty-due',
    'warranty_reminder_2m': 'maint-warranty-2m',
    'warranty_reminder_1m': 'maint-warranty-1m', 
    'scheduled_maintenance': 'maint-routine',
    'in_service': 'maint-inspection',
    'breakdown': 'maint-breakdown',
    'routine': 'maint-routine',
    'inspection': 'maint-inspection'
  };
  
  const ruleId = typeToRuleId[type];
  if (ruleId) {
    const rule = colorRules.find(r => r.id === ruleId && r.enabled);
    if (rule) {
      return {
        backgroundColor: rule.backgroundColor,
        color: rule.textColor,
        borderColor: rule.borderColor
      };
    }
  }
  
  return {};
}

/**
 * Get custom styling for priority levels
 */
export function getCustomPriorityStyle(priority: string): React.CSSProperties {
  const colorRules = getColorRules();
  const ruleId = `priority-${priority.toLowerCase()}`;
  const rule = colorRules.find(r => r.id === ruleId && r.enabled);
  
  if (rule) {
    return {
      backgroundColor: rule.backgroundColor,
      color: rule.textColor,
      borderColor: rule.borderColor
    };
  }
  
  return {};
}

/**
 * Get custom styling for indicators (pickup/return)
 */
export function getCustomIndicatorStyle(indicator: 'pickup' | 'return'): React.CSSProperties {
  const colorRules = getColorRules();
  const ruleId = `${indicator}-day`;
  const rule = colorRules.find(r => r.id === ruleId && r.enabled);
  
  if (rule) {
    return {
      backgroundColor: rule.backgroundColor,
      color: rule.textColor,
      borderColor: rule.borderColor
    };
  }
  
  return {};
}

/**
 * Get custom styling for TBD spare vehicles
 */
export function getCustomTBDStyle(): React.CSSProperties {
  const colorRules = getColorRules();
  const rule = colorRules.find(r => r.id === 'res-tbd' && r.enabled);
  
  if (rule) {
    return {
      backgroundColor: rule.backgroundColor,
      color: rule.textColor,
      borderColor: rule.borderColor
    };
  }
  
  return {};
}