import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ComboboxOption = {
  value: string;
  label: string;
  description?: string;
  group?: string;
  tags?: string[];
};

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  groups?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  variant?: "default" | "outline" | "subtle";
  className?: string;
  recentValues?: string[];
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "Select option...",
  emptyMessage = "No options found.",
  groups = false,
  disabled = false,
  searchPlaceholder = "Search...",
  variant = "default",
  className,
  recentValues = [],
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const filteredOptions = React.useMemo(() => {
    if (!searchQuery) return options;
    
    const query = searchQuery.toLowerCase();
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(query) ||
        option.value.toLowerCase().includes(query) ||
        option.description?.toLowerCase().includes(query) ||
        option.tags?.some(tag => tag?.toLowerCase().includes(query))
    );
  }, [options, searchQuery]);

  const groupedOptions = React.useMemo(() => {
    if (!groups) return { "All": filteredOptions };
    
    const grouped: Record<string, ComboboxOption[]> = {};
    
    if (recentValues && recentValues.length > 0) {
      const recentOptions = options.filter(option => 
        recentValues.includes(option.value)
      );
      if (recentOptions.length > 0) {
        grouped["Recent"] = recentOptions;
      }
    }
    
    filteredOptions.forEach(option => {
      const group = option.group || "Other";
      if (!grouped[group]) {
        grouped[group] = [];
      }
      grouped[group].push(option);
    });
    
    return grouped;
  }, [filteredOptions, groups, options, recentValues]);

  const selectedOption = options.find(option => option.value === value);

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
              {selectedOption ? (
                <span className="flex items-center gap-2 truncate">
                  {selectedOption.label}
                  {selectedOption.tags && selectedOption.tags.length > 0 && selectedOption.tags[0] && (
                    <Badge variant="outline" className="ml-1 text-xs font-normal">
                      {selectedOption.tags[0]}
                    </Badge>
                  )}
                </span>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[350px] md:w-[500px] lg:w-[600px] max-h-[300px] overflow-auto p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          avoidCollisions={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="px-2 py-2">
            <div className="flex items-center px-1 mb-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                ref={searchInputRef}
                placeholder={searchPlaceholder}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8"
              />
            </div>
            
            {Object.entries(groupedOptions).length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            )}
            
            {Object.entries(groupedOptions).map(([group, groupOptions], groupIndex) => (
              <div key={group}>
                {groupIndex > 0 && <div className="my-1 border-t" />}
                <div>
                  {group !== "All" && (
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>
                  )}
                  {groupOptions.map((option) => (
                    <div
                      key={option.value}
                      className="flex flex-col items-start py-1.5 px-2 cursor-pointer text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setSearchInput("");
                        setSearchQuery("");
                      }}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {option.label}
                            {value === option.value && (
                              <Check className="ml-2 h-4 w-4 text-primary inline" />
                            )}
                          </span>
                          {option.description && (
                            <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-[400px] lg:max-w-[500px]">
                              {option.description}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {option.tags && option.tags.length > 0 && option.tags[0] && (
                            <Badge variant="outline" className="text-xs">
                              {option.tags[0]}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}