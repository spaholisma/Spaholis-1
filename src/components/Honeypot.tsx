import { useRef } from "react";

/**
 * Spam-bot trap for the enquiry forms: a field people never see (off-screen,
 * skipped by Tab, hidden from screen readers, ignored by password managers).
 * Simple bots fill in every input they find — when this one has a value the
 * form pretends it was sent and does nothing: no saved request, no email.
 */
export function useHoneypot() {
  const ref = useRef<HTMLInputElement>(null);
  const field = (
    <div
      aria-hidden="true"
      style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
    >
      <label>
        Leave this empty
        <input
          ref={ref}
          type="text"
          name="hp_extra_field"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
          data-lpignore="true"
          data-1p-ignore=""
          data-form-type="other"
        />
      </label>
    </div>
  );
  return { field, isBot: () => !!ref.current?.value.trim() };
}
