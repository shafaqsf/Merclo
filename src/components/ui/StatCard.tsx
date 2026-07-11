import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";

/**
 * KPI card: label, large value, optional delta vs. a previous period.
 * `delta` is a fraction (e.g. 0.125 = +12.5%); positive is green, negative red.
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  icon?: React.ReactNode;
  className?: string;
}) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const up = hasDelta && delta! >= 0;

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          {label}
        </span>
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-soft text-accent">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-ink">
        {value}
      </div>
      {hasDelta && (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            up ? "text-[color:var(--success)]" : "text-danger"
          )}
        >
          {up ? "▲" : "▼"} {Math.abs(delta! * 100).toFixed(1)}%
          <span className="ml-1 text-faint">vs prev period</span>
        </div>
      )}
    </Card>
  );
}
