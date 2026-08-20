import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Palette, RotateCcw, Save } from "lucide-react";
import { ColorRule, DEFAULT_COLOR_RULES, getColorRules } from "@/lib/color-rules";

interface ColorCodingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


export function ColorCodingDialog({ open, onOpenChange }: ColorCodingDialogProps) {
  const [colorRules, setColorRules] = useState<ColorRule[]>([]);
  const [activeTab, setActiveTab] = useState<string>('reservation-status');
  const { toast } = useToast();

  // Load color rules from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('calendar-color-rules');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setColorRules(parsed);
      } catch (error) {
        console.error('Error loading color rules:', error);
        setColorRules(DEFAULT_COLOR_RULES);
      }
    } else {
      setColorRules(DEFAULT_COLOR_RULES);
    }
  }, []);

  const handleColorChange = (ruleId: string, field: keyof ColorRule, value: string | boolean) => {
    setColorRules(prev => prev.map(rule => 
      rule.id === ruleId ? { ...rule, [field]: value } : rule
    ));
  };

  const handleSave = () => {
    try {
      localStorage.setItem('calendar-color-rules', JSON.stringify(colorRules));
      toast({
        title: "Color settings saved",
        description: "Your calendar color preferences have been saved successfully."
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving color rules:', error);
      toast({
        title: "Error saving colors",
        description: "Failed to save your color preferences. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleReset = () => {
    setColorRules(DEFAULT_COLOR_RULES);
    toast({
      title: "Colors reset",
      description: "Color settings have been reset to defaults."
    });
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'reservation-status': return 'Reservation Status';
      case 'reservation-type': return 'Reservation Type';
      case 'maintenance-type': return 'Maintenance Type';
      case 'maintenance-priority': return 'Maintenance Priority';
      case 'indicators': return 'Calendar Indicators';
      default: return category;
    }
  };

  const filteredRules = colorRules.filter(rule => rule.category === activeTab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Calendar Color Coding
          </DialogTitle>
          <DialogDescription>
            Customize the colors used for different types of events and statuses in your calendars.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="reservation-status" className="text-sm">Reservation Status</TabsTrigger>
              <TabsTrigger value="reservation-type" className="text-sm">Reservation Type</TabsTrigger>
              <TabsTrigger value="maintenance-type" className="text-sm">Maintenance Type</TabsTrigger>
              <TabsTrigger value="maintenance-priority" className="text-sm">Priority</TabsTrigger>
              <TabsTrigger value="indicators" className="text-sm">Indicators</TabsTrigger>
            </TabsList>

            {['reservation-status', 'reservation-type', 'maintenance-type', 'maintenance-priority', 'indicators'].map(category => (
              <TabsContent key={category} value={category} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{getCategoryTitle(category)}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {colorRules.filter(rule => rule.category === category).map(rule => (
                      <div key={rule.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="font-medium">{rule.name}</Label>
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              onChange={(e) => handleColorChange(rule.id, 'enabled', e.target.checked)}
                              className="h-4 w-4"
                            />
                          </div>
                          <p className="text-sm text-gray-600">{rule.description}</p>
                          
                          {/* Preview */}
                          <div className="mt-3">
                            <Label className="text-xs text-gray-500">Preview:</Label>
                            <div 
                              className="mt-1 p-2 rounded border text-sm font-medium"
                              style={{
                                backgroundColor: rule.backgroundColor,
                                color: rule.textColor,
                                borderColor: rule.borderColor
                              }}
                            >
                              Sample Event - {rule.name}
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label htmlFor={`${rule.id}-bg`} className="text-sm">Background Color</Label>
                            <div className="flex gap-2 mt-1">
                              <input
                                id={`${rule.id}-bg`}
                                type="color"
                                value={rgbToHex(rule.backgroundColor)}
                                onChange={(e) => handleColorChange(rule.id, 'backgroundColor', hexToRgb(e.target.value))}
                                className="w-12 h-8 rounded border cursor-pointer"
                              />
                              <Input
                                value={rule.backgroundColor}
                                onChange={(e) => handleColorChange(rule.id, 'backgroundColor', e.target.value)}
                                className="text-xs"
                                placeholder="rgb(255, 255, 255)"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <Label htmlFor={`${rule.id}-text`} className="text-sm">Text Color</Label>
                            <div className="flex gap-2 mt-1">
                              <input
                                id={`${rule.id}-text`}
                                type="color"
                                value={rgbToHex(rule.textColor)}
                                onChange={(e) => handleColorChange(rule.id, 'textColor', hexToRgb(e.target.value))}
                                className="w-12 h-8 rounded border cursor-pointer"
                              />
                              <Input
                                value={rule.textColor}
                                onChange={(e) => handleColorChange(rule.id, 'textColor', e.target.value)}
                                className="text-xs"
                                placeholder="rgb(0, 0, 0)"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <Label htmlFor={`${rule.id}-border`} className="text-sm">Border Color</Label>
                            <div className="flex gap-2 mt-1">
                              <input
                                id={`${rule.id}-border`}
                                type="color"
                                value={rgbToHex(rule.borderColor)}
                                onChange={(e) => handleColorChange(rule.id, 'borderColor', hexToRgb(e.target.value))}
                                className="w-12 h-8 rounded border cursor-pointer"
                              />
                              <Input
                                value={rule.borderColor}
                                onChange={(e) => handleColorChange(rule.id, 'borderColor', e.target.value)}
                                className="text-xs"
                                placeholder="rgb(200, 200, 200)"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper functions for color conversion
function rgbToHex(rgb: string): string {
  const rgbValues = rgb.match(/\d+/g);
  if (!rgbValues || rgbValues.length !== 3) return '#000000';
  
  const r = parseInt(rgbValues[0]);
  const g = parseInt(rgbValues[1]);
  const b = parseInt(rgbValues[2]);
  
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return 'rgb(0, 0, 0)';
  
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  
  return `rgb(${r}, ${g}, ${b})`;
}

