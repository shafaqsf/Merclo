import * as React from "react";
import { cn } from "@/lib/cn";

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
}

/** A pill-group picker for small enum choices (shape, density, dark mode…). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cn(
        "glass-panel inline-flex items-center gap-1 !rounded-full p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "glass-interactive !rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-accent text-accent-ink"
                : "text-muted hover:text-ink"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
