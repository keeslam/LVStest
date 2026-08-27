import * as React from "react";
import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Search, CarFront } from "lucide-react";
import { cn, isTrueValue } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatLicensePlate } from "@/lib/format-utils";
import { Vehicle } from "@shared/schema";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface VehicleSelectorProps {
  vehicles: Vehicle[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  recentVehicleIds?: string[];
}

export function VehicleSelector({
  vehicles,
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  recentVehicleIds = [],
}: VehicleSelectorProps) {
  const { t } = useTranslation("vehicles");
  const finalPlaceholder = placeholder ?? t('vehicleSelector.defaultPlaceholder');
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const vehicleTypes = useMemo(() => {
    if (!vehicles) return [];
    const types = new Set<string>();
    vehicles.forEach(vehicle => {
      if (vehicle.vehicleType) {
        types.add(vehicle.vehicleType);
      }
    });
    return Array.from(types);
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    if (!searchQuery) return vehicles;
    
    const query = searchQuery.toLowerCase().trim();
    const queryWithoutDashes = query.replace(/-/g, '');
    
    return vehicles.filter((vehicle) => {
      const licensePlate = vehicle.licensePlate?.toLowerCase() || '';
      const licensePlateWithoutDashes = licensePlate.replace(/-/g, '');
      const brandAndModel = `${vehicle.brand || ''} ${vehicle.model || ''}`.toLowerCase();

      return vehicle.brand?.toLowerCase().includes(query) ||
        vehicle.model?.toLowerCase().includes(query) ||
        brandAndModel.includes(query) ||
        licensePlate.includes(query) ||
        licensePlateWithoutDashes.includes(queryWithoutDashes) ||
        vehicle.vehicleType?.toLowerCase().includes(query);
    });
  }, [vehicles, searchQuery]);

  const displayedVehicles = useMemo(() => {
    if (activeTab === "all") return filteredVehicles;
    if (activeTab === "recent" && recentVehicleIds.length > 0) {
      return filteredVehicles.filter(vehicle => 
        recentVehicleIds.includes(vehicle.id.toString())
      );
    }
    return filteredVehicles.filter(
      vehicle => vehicle.vehicleType === activeTab
    );
  }, [filteredVehicles, activeTab, recentVehicleIds]);

  const selectedVehicle = vehicles?.find(v => v.id.toString() === value);

  return (
    <div className="relative w-full">
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-between",
              !value && "text-muted-foreground",
              className
            )}
            disabled={disabled}
          >
            <div className="flex items-center truncate">
              {selectedVehicle ? (
                <span className="flex items-center gap-2 truncate">
                  <CarFront className="h-4 w-4 shrink-0 opacity-60" />
                  {selectedVehicle.brand} {selectedVehicle.model}
                  <Badge variant="outline" className="ml-1 text-xs font-normal">
                    {formatLicensePlate(selectedVehicle.licensePlate)}
                  </Badge>
                </span>
              ) : (
                <span>{finalPlaceholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[320px] md:w-[750px] max-h-[300px] overflow-auto p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-3">
            <div className="flex items-center px-1 mb-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                ref={searchInputRef}
                placeholder={t('vehicleSelector.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-7"
              />
            </div>
            
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-2 h-8">
                <TabsTrigger value="all" className="flex-1 text-xs h-7">{t('vehicleSelector.allTab')}</TabsTrigger>
                {recentVehicleIds.length > 0 && (
                  <TabsTrigger value="recent" className="flex-1 text-xs h-7">{t('vehicleSelector.recentTab')}</TabsTrigger>
                )}
                {vehicleTypes.map(type => (
                  <TabsTrigger key={type} value={type} className="flex-1 text-xs h-7">{type}</TabsTrigger>
                ))}
              </TabsList>
              
              <TabsContent value="all" className="mt-0">
                {displayVehicles()}
              </TabsContent>
              
              <TabsContent value="recent" className="mt-0">
                {displayVehicles()}
              </TabsContent>
              
              {vehicleTypes.map(type => (
                <TabsContent key={type} value={type} className="mt-0">
                  {displayVehicles()}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
  
  function displayVehicles() {
    if (displayedVehicles.length === 0) {
      return (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {t('vehicleSelector.noVehiclesFound')}
        </div>
      );
    }
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {displayedVehicles.map(vehicle => (
          <div 
            key={vehicle.id}
            className={cn(
              "p-2 rounded-md border cursor-pointer hover:bg-muted transition-colors",
              value === vehicle.id.toString() ? "bg-primary/10 border-primary" : "border-border"
            )}
            onClick={() => {
              onChange(vehicle.id.toString());
              setOpen(false);
              setSearchQuery("");
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CarFront className="h-4 w-4 shrink-0 opacity-70" />
                <div className="font-medium text-sm">
                  {vehicle.brand} {vehicle.model}
                </div>
              </div>
              {value === vehicle.id.toString() && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <Badge variant="outline" className="mr-1 text-xs py-0 h-5">
                {formatLicensePlate(vehicle.licensePlate)}
              </Badge>
              <Badge 
                variant="secondary" 
                className="text-xs py-0 h-5"
              >
                {vehicle.vehicleType || t('vehicleSelector.unknownType')}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {isTrueValue(vehicle.registeredTo)
                ? <Badge variant="outline" className="bg-blue-50 text-blue-700 py-0 px-1 text-[10px] h-4">Opnaam</Badge>
                : isTrueValue(vehicle.company)
                  ? <Badge variant="outline" className="bg-green-50 text-green-700 py-0 px-1 text-[10px] h-4">BV</Badge>
                  : null
              }
              {vehicle.gps && (
                <Badge variant="outline" className="ml-1 py-0 px-1 text-[10px] h-4">GPS</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
}