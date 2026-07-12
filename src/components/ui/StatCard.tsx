import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";

export type StatTone = "blue" | "green" | "purple" | "orange";

/**
 * KPI card: label, large value, monochrome icon chip, optional delta vs. a
 * previous period. `delta` is a fraction (0.125 = +12.5%); positive green.
 * `tone` is retained for API compatibility but no longer changes the color
 * (the design system is strictly monochrome).
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  tone: _tone = "blue",
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  icon?: React.ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const up = hasDelta && delta! >= 0;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-foreground">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-foreground">
        {value}
      </div>
      {hasDelta ? (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              up ? "text-[color:var(--success)]" : "text-destructive"
            )}
          >
            {up ? "▲" : "▼"} {Math.abs(delta! * 100).toFixed(1)}%
          </span>
          <span className="text-muted-foreground">vs prev period</span>
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">&nbsp;</div>
      )}
    </Card>
  );
}
