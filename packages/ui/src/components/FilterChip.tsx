import { CaretDownIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function FilterChip({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const active = selected.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={active ? "secondary" : "outline"}
          aria-label={`Filter by ${label}`}
        >
          {label}
          {active && (
            <Badge variant="default" className="h-4 px-1.5">
              {selected.length}
            </Badge>
          )}
          <CaretDownIcon data-icon="inline-end" className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No options
          </div>
        ) : (
          options.map((opt) => (
            <DropdownMenuCheckboxItem
              key={opt}
              checked={selected.includes(opt)}
              onCheckedChange={() => onToggle(opt)}
              onSelect={(e) => e.preventDefault()}
            >
              {opt}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
