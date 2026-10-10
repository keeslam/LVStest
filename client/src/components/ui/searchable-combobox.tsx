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
  /**
   * FormControl hands these to its single child. The trigger is a button, so the
   * label's `htmlFor` and the error/description links only work when they land on it.
   */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "data-testid"?: string;
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
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "data-testid": dataTestId,
}: SearchableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();
  const [activeIndex, setActiveIndex] = React.useState(-1);
  
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

  // The rows in the order they are drawn (a "Recent" row can repeat an option of its own group), so the
  // arrow keys walk what the person sees and every row has an id of its own.
  const flatRows = React.useMemo(
    () => Object.entries(groupedOptions).flatMap(([group, groupOptions]) => groupOptions.map((option) => ({ group, option }))),
    [groupedOptions],
  );
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  // The active row starts on the chosen option (or the first row) whenever the list opens or is filtered.
  const flatKey = flatRows.map((row) => `${row.group}::${row.option.value}`).join("|");
  React.useEffect(() => {
    if (!open) return;
    const chosen = flatRows.findIndex((row) => row.option.value === value);
    setActiveIndex(chosen >= 0 ? chosen : flatRows.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatKey]);
  React.useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
    setSearchInput("");
    setSearchQuery("");
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Keys typed in the search box stay in it (a Radix Popover or a form around it must not see them),
    // except the ones this list gives a meaning to.
    e.stopPropagation();
    // The list is filtered after a typing pause. A key that acts on the list while that pause is still
    // running would act on the old list (Enter would choose a row that is about to disappear), so the
    // pending search is applied first and the key waits for the next press.
    if ((e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") && searchInput !== searchQuery) {
      e.preventDefault();
      setSearchQuery(searchInput);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatRows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flatRows[activeIndex];
      if (row) choose(row.option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

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
            id={id}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            data-testid={dataTestId}
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
                onKeyDown={handleSearchKeyDown}
                role="combobox"
                aria-label={searchPlaceholder}
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                className="h-8"
              />
            </div>
            
            {/* Not "no groups": without groups there is always the one "All" group, empty or not. */}
            {flatRows.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            )}

            <div role="listbox" id={listboxId} aria-label={searchPlaceholder}>
            {(() => {
              let rowIndex = 0;
              return Object.entries(groupedOptions).map(([group, groupOptions], groupIndex) => (
                <div key={group} role={group !== "All" ? "group" : "presentation"} aria-label={group !== "All" ? group : undefined}>
                  {groupIndex > 0 && <div className="my-1 border-t" role="presentation" />}
                  <div role="presentation">
                    {group !== "All" && (
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground" aria-hidden="true">{group}</div>
                    )}
                    {groupOptions.map((option) => {
                      const index = rowIndex++;
                      const active = index === activeIndex;
                      return (
                        <div
                          key={`${group}::${option.value}`}
                          id={optionId(index)}
                          role="option"
                          aria-selected={value === option.value}
                          aria-label={[option.label, option.description].filter(Boolean).join(", ")}
                          data-active={active ? "true" : undefined}
                          className={cn(
                            "flex flex-col items-start py-1.5 px-2 cursor-pointer text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                            active && "bg-accent text-accent-foreground",
                          )}
                          onMouseMove={() => { if (!active) setActiveIndex(index); }}
                          onClick={() => choose(option)}
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
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}