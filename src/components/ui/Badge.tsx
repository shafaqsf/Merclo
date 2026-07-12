import * as React from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-hairline",
  accent: "bg-accent-soft text-accent border-transparent",
  success: "bg-[color:var(--success)]/12 text-[color:var(--success)] border-transparent",
  warning: "bg-[color:var(--warning)]/14 text-[color:var(--warning)] border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
