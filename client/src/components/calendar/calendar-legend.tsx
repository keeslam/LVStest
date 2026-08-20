import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getColorRules, ColorRule } from "@/lib/color-rules";
import { Info } from "lucide-react";

interface CalendarLegendProps {
  /** Which categories to show in the legend */
  categories?: ('reservation-status' | 'reservation-type' | 'maintenance-type' | 'maintenance-priority' | 'indicators')[];
  /** Optional title for the legend */
  title?: string;
  /** Whether to show as a compact version */
  compact?: boolean;
}

export function CalendarLegend({ 
  categories, 
  title = "Color Legend", 
  compact = false 
}: CalendarLegendProps) {
  const colorRules = getColorRules();
  
  // Filter rules based on categories and only show enabled ones
  const filteredRules = colorRules.filter(rule => 
    rule.enabled && 
    (!categories || categories.includes(rule.category))
  );
  
  if (filteredRules.length === 0) {
    return null;
  }
  
  // Group rules by category for better organization
  const groupedRules = filteredRules.reduce((acc, rule) => {
    if (!acc[rule.category]) {
      acc[rule.category] = [];
    }
    acc[rule.category].push(rule);
    return acc;
  }, {} as Record<string, ColorRule[]>);
  
  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'reservation-status': return 'Reservation Status';
      case 'reservation-type': return 'Reservation Types';
      case 'maintenance-type': return 'Maintenance Types';
      case 'maintenance-priority': return 'Priority Levels';
      case 'indicators': return 'Indicators';
      default: return category;
    }
  };
  
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <div className="flex items-center gap-1 text-gray-600">
          <Info className="h-4 w-4" />
          <span>Legend:</span>
        </div>
        {filteredRules.map(rule => (
          <div key={rule.id} className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded border border-gray-300"
              style={{
                backgroundColor: rule.backgroundColor,
                borderColor: rule.borderColor
              }}
            />
            <span className="text-gray-700">{rule.name}</span>
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(groupedRules).map(([category, rules]) => (
            <div key={category} className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700 border-b pb-1">
                {getCategoryTitle(category)}
              </h4>
              <div className="space-y-2">
                {rules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs px-2 py-1"
                      style={{
                        backgroundColor: rule.backgroundColor,
                        color: rule.textColor,
                        borderColor: rule.borderColor
                      }}
                    >
                      {rule.name}
                    </Badge>
                    <span className="text-xs text-gray-600 truncate">
                      {rule.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}