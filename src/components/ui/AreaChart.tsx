import * as React from "react";

/**
 * Dependency-free SVG area/line chart (like the reference "Revenue Over Time").
 * Smooth-ish polyline with a soft gradient fill, subtle gridlines, dot markers,
 * and x-axis labels. Degrades gracefully to a flat baseline when all-zero.
 */
export function AreaChart({
  data,
  height = 200,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const W = 640;
  const H = height;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const innerW = W - padX * 2;
  const innerH = H - padTop - padBottom;

  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const x = (i: number) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padTop + innerH - (v / max) * innerH;

  const points = data.map((d, i) => ({ px: x(i), py: y(d.value) }));
  const line = points.map((p) => `${p.px},${p.py}`).join(" ");
  const area =
    points.length > 0
      ? `M ${points[0].px},${padTop + innerH} ` +
        points.map((p) => `L ${p.px},${p.py}`).join(" ") +
        ` L ${points[points.length - 1].px},${padTop + innerH} Z`
      : "";

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((f) => padTop + innerH - f * innerH);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend chart"
    >
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridYs.map((gy, i) => (
        <line
          key={i}
          x1={padX}
          x2={W - padX}
          y1={gy}
          y2={gy}
          stroke="var(--hairline)"
          strokeWidth="1"
        />
      ))}

      {area && <path d={area} fill={`url(#area-${id})`} />}
      {points.length > 1 && (
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.px}
          cy={p.py}
          r="3"
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {data.map((d, i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor="middle"
          className="fill-[color:var(--faint)]"
          style={{ fontSize: "11px" }}
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}
