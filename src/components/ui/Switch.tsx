import * as React from "react";
import { cn } from "@/lib/cn";

interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/** A toggle switch paired with a label — replaces raw checkbox+label markup. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ id, checked, onChange, label, disabled, className }, ref) => {
    return (
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center gap-3 text-sm text-ink",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <button
          ref={ref}
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border border-hairline transition-colors",
            checked ? "bg-accent" : "bg-surface-2"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-surface shadow-sm transition-transform",
              checked ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
        {label}
      </label>
    );
  }
);
Switch.displayName = "Switch";
