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
        "inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-foreground transition-colors",
        "hover:bg-muted disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
