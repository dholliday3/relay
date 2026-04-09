import { useState } from "react";
import { DotsThreeVerticalIcon, XIcon } from "@phosphor-icons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- SelectChip: native shadcn Select ---

interface SelectChipProps {
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onChange: (value: string) => void;
}

// Radix Select disallows empty-string item values, so we use a sentinel for
// the "no value" state. The component still surfaces "" to the parent.
const NONE_VALUE = "__none__";

export function SelectChip({ value, options, placeholder, onChange }: SelectChipProps) {
  return (
    <Select
      value={value === "" ? NONE_VALUE : value}
      onValueChange={(v) => onChange(v === NONE_VALUE ? "" : v)}
    >
      <SelectTrigger size="sm">
        <SelectValue placeholder={placeholder ?? "Select"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || NONE_VALUE} value={o.value || NONE_VALUE}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// --- ComboboxChip: searchable single-select with create-new ---

interface ComboboxChipProps {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
}

export function ComboboxChip({ value, options, placeholder, onChange }: ComboboxChipProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = search.trim();
  const showCreate = trimmed.length > 0 && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={value ? "" : "text-muted-foreground"}
        >
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Type to filter..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__clear__"
                onSelect={() => select("")}
                className="text-muted-foreground"
              >
                {placeholder}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o}
                  value={o}
                  data-checked={o === value}
                  onSelect={() => select(o)}
                >
                  {o}
                </CommandItem>
              ))}
              {showCreate && (
                <CommandItem
                  value={`__create__:${trimmed}`}
                  onSelect={() => select(trimmed)}
                >
                  Create &ldquo;{trimmed}&rdquo;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// --- MultiComboboxChip: searchable multi-select with create-new ---

interface MultiComboboxChipProps {
  values: string[];
  options: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}

export function MultiComboboxChip({ values, options, placeholder, onChange }: MultiComboboxChipProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = search.trim().toLowerCase();
  const showCreate =
    trimmed.length > 0 &&
    !options.some((o) => o.toLowerCase() === trimmed) &&
    !values.some((v) => v.toLowerCase() === trimmed);

  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };

  const remove = (v: string) => onChange(values.filter((x) => x !== v));

  const addCreated = () => {
    if (!trimmed) return;
    if (!values.some((v) => v.toLowerCase() === trimmed)) {
      onChange([...values, trimmed]);
    }
    setSearch("");
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || (e.key === "Enter" && showCreate)) {
      e.preventDefault();
      addCreated();
    } else if (e.key === "Backspace" && search === "" && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={values.length === 0 ? "h-auto min-h-7 text-muted-foreground" : "h-auto min-h-7"}
        >
          {values.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1">
              {values.map((v) => (
                <Badge key={v} variant="secondary" className="gap-0.5 pr-0.5">
                  {v}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${v}`}
                    className="ml-0.5 inline-flex h-3 w-3 cursor-pointer items-center justify-center rounded-sm hover:bg-foreground/10"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove(v);
                    }}
                  >
                    <XIcon className="size-2.5" />
                  </span>
                </Badge>
              ))}
            </span>
          ) : (
            placeholder
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Type to add..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={handleInputKeyDown}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = values.includes(o);
                return (
                  <CommandItem
                    key={o}
                    value={o}
                    data-checked={checked}
                    onSelect={() => toggle(o)}
                  >
                    {o}
                  </CommandItem>
                );
              })}
              {showCreate && (
                <CommandItem
                  value={`__create__:${trimmed}`}
                  onSelect={() => addCreated()}
                >
                  Create &ldquo;{trimmed}&rdquo;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// --- KebabMenu: overflow popover for secondary fields ---

interface KebabMenuItem {
  label: string;
  content: React.ReactNode;
}

export function KebabMenu({ items }: { items: KebabMenuItem[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          title="More fields"
          aria-label="More fields"
        >
          <DotsThreeVerticalIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 gap-3" align="end">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              {item.label}
            </span>
            {item.content}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
