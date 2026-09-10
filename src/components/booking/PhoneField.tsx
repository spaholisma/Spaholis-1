import PhoneInput, { isValidPhoneNumber, isPossiblePhoneNumber } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";
import { CountrySelect } from "@/components/booking/CountrySelect";

// Re-export validators so forms can gate on them.
export { isValidPhoneNumber, isPossiblePhoneNumber };

interface PhoneFieldProps {
  /** E.164 value, e.g. "+50688887777" (or "" when empty). */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Adds a red border when the current value is present but not a valid number. */
  invalid?: boolean;
}

/**
 * Phone input with a country-code dropdown (flags + dial codes) and E.164
 * validation, styled to match the site's inputs. Defaults to Costa Rica.
 *
 * The country picker is our own: the library ships a plain <select>, which is
 * a wheel of 240 entries on a phone and has no search on a desktop. Ours lets
 * someone type "Costa" or "506" and land on their country.
 */
export function PhoneField({ value, onChange, placeholder, className, id, invalid }: PhoneFieldProps) {
  return (
    <PhoneInput
      id={id}
      international
      defaultCountry="CR"
      countryCallingCodeEditable={false}
      value={value || undefined}
      onChange={(v) => onChange(v || "")}
      countrySelectComponent={CountrySelect}
      placeholder={placeholder}
      className={cn("holis-phone-input", invalid && "holis-phone-input--invalid", className)}
    />
  );
}
