import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";

export type StatTone = "blue" | "green" | "purple" | "orange";

const toneChip: Record<StatTone, string> = {
  blue: "bg-[color:rgb(0_113_227_/_0.12)] text-[color:#0071e3]",
  green: "bg-[color:rgb(52_199_89_/_0.14)] text-[color:#1f9d4d]",
  purple: "bg-[color:rgb(120_86_255_/_0.14)] text-[color:#7856ff]",
  orange: "bg-[color:rgb(255_149_0_/_0.16)] text-[color:#e07c00]",
};

/**
 * KPI card: label, large value, colored icon chip, optional delta vs. a
 * previous period. `delta` is a fraction (0.125 = +12.5%); positive green.
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  tone = "blue",
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
        <span className="text-xs font-medium uppercase tracking-wide text-faint">
          {label}
        </span>
        {icon && (
          <span
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl",
              toneChip[tone]
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-ink">
        {value}
      </div>
      {hasDelta ? (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              up ? "text-[color:var(--success)]" : "text-danger"
            )}
          >
            {up ? "▲" : "▼"} {Math.abs(delta! * 100).toFixed(1)}%
          </span>
          <span className="text-faint">vs prev period</span>
        </div>
      ) : (
        <div className="mt-2 text-xs text-faint">&nbsp;</div>
      )}
    </Card>
  );
}
