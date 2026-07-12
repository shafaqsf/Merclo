import * as React from "react";
import { cn } from "@/lib/cn";

export interface DonutDatum {
  label: string;
  value: number;
}

/**
 * Dependency-free SVG donut chart. Renders arc segments in an accent-family
 * palette with a legend showing each label and value. Pure — no runtime clock
 * or randomness. Falls back to a muted placeholder when there is no data.
 */
export function Donut({
  data,
  size = 168,
  thickness = 22,
  className,
}: {
  data: DonutDatum[];
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const segments = data.filter((d) => d.value > 0);
  const total = segments.reduce((sum, d) => sum + d.value, 0);

  // Accent-family palette (opacity ramp of the accent color) so it stays
  // on-brand and works in both light and dark.
  const colors = [
    "var(--accent)",
    "color-mix(in srgb, var(--accent) 80%, transparent)",
    "color-mix(in srgb, var(--accent) 62%, transparent)",
    "color-mix(in srgb, var(--accent) 46%, transparent)",
    "color-mix(in srgb, var(--accent) 32%, transparent)",
    "color-mix(in srgb, var(--accent) 22%, transparent)",
  ];

  if (segments.length === 0 || total === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 py-6",
          className
        )}
      >
        <div
          className="rounded-full border-8 border-hairline"
          style={{ width: size, height: size }}
          aria-hidden
        />
        <p className="text-sm text-faint">No data yet.</p>
      </div>
    );
  }

  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Cumulative value before each segment (pure — no render-time mutation).
  const cumulativeBefore = segments.map((_, i) =>
    segments.slice(0, i).reduce((sum, s) => sum + s.value, 0)
  );
  const arcs = segments.map((d, i) => {
    const fraction = d.value / total;
    const dash = fraction * circumference;
    return {
      color: colors[i % colors.length],
      dash,
      gap: circumference - dash,
      // Rotate each segment to start where the previous ended.
      rotation: (cumulativeBefore[i] / total) * 360,
    };
  });

  return (
    <div className={cn("flex flex-col items-center gap-5 sm:flex-row", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="Donut chart"
        >
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth={thickness}
          />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeLinecap="butt"
              transform={`rotate(${a.rotation - 90} ${cx} ${cy})`}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight text-ink">
            {total.toLocaleString()}
          </span>
          <span className="text-xs text-faint">total</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5">
        {segments.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colors[i % colors.length] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-ink">{d.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Donut;
