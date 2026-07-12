import * as React from "react";
import { cn } from "@/lib/cn";

/** A small pill button — quick replies, filters, tags. */
export function Chip({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-3 py-1 text-[13px] font-medium text-ink",
        "transition-colors hover:border-accent hover:text-accent disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
