import { useMemo, useState } from "react";
import { getCountries, getCountryCallingCode } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import en from "react-phone-number-input/locale/en.json";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type CountryCode = ReturnType<typeof getCountries>[number];

interface Props {
  value?: string;
  onChange: (value?: string) => void;
  disabled?: boolean;
  /** Passed by react-phone-number-input; its own list is ignored in favour of ours. */
  options?: unknown;
  name?: string;
  "aria-label"?: string;
}

const FlagFor = ({ code }: { code: string }) => {
  const Flag = (flags as Record<string, React.ComponentType<{ title?: string }>>)[code];
  return Flag
    ? <span className="inline-block h-4 w-6 overflow-hidden rounded-[2px] shrink-0"><Flag title={code} /></span>
    : <span className="inline-block h-4 w-6 rounded-[2px] bg-muted shrink-0" />;
};

/**
 * The country picker inside the phone field.
 *
 * The library ships a plain <select>, which on a phone is a wheel of 240
 * entries and on a desktop has no way to search. This is the same list with a
 * search box, so someone types "Costa" or "506" and lands on their country.
 */
export function CountrySelect({ value, onChange, disabled, name, ...rest }: Props) {
  const [open, setOpen] = useState(false);

  // Built once: every country with its name and dial code, alphabetical.
  const countries = useMemo(() => {
    const labels = en as Record<string, string>;
    return getCountries()
      .map((code: CountryCode) => ({
        code,
        name: labels[code] ?? code,
        dial: `+${getCountryCallingCode(code)}`,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const selected = countries.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          name={name}
          aria-label={rest["aria-label"] ?? "Country"}
          className={cn(
            "flex items-center gap-1 rounded-md px-1 py-1 outline-none",
            "hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          {value ? <FlagFor code={value} /> : <span className="h-4 w-6 rounded-[2px] bg-muted" />}
          <span className="font-body text-sm text-muted-foreground">{selected?.dial ?? "+"}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search country or code…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((c) => (
                <CommandItem
                  // Searchable on name, dial code and the two-letter code alike.
                  value={`${c.name} ${c.dial} ${c.code}`}
                  key={c.code}
                  onSelect={() => { onChange(c.code); setOpen(false); }}
                  className="gap-2"
                >
                  <FlagFor code={c.code} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-muted-foreground text-xs">{c.dial}</span>
                  <Check className={cn("h-4 w-4", c.code === value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
