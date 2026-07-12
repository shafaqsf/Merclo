"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { WidgetAppearance } from "@/lib/bots/appearance";

/**
 * Static, non-functional visual mock of the storefront widget panel. Pure
 * presentational — mirrors what the embedded widget renders from the same
 * appearance config so merchants get a live preview while editing.
 */

// Mirrors the light/dark token values from `src/app/globals.css`. This
// preview needs to force light or dark regardless of the OS preference (the
// `darkMode` "light"/"dark" overrides), which the page's CSS custom
// properties can't do since they're driven by a `prefers-color-scheme`
// media query, not a class/attribute. Scoping an explicit override to just
// this container is the narrowest way to diverge without introducing
// Tailwind `dark:` variants app-wide.
const LIGHT_VARS: Record<string, string> = {
  "--canvas": "#f5f5f7",
  "--surface": "#ffffff",
  "--surface-2": "#fbfbfd",
  "--ink": "#1d1d1f",
  "--muted": "#6e6e73",
  "--faint": "#86868b",
  "--hairline": "rgba(0, 0, 0, 0.08)",
};

const DARK_VARS: Record<string, string> = {
  "--canvas": "#000000",
  "--surface": "#1c1c1e",
  "--surface-2": "#2c2c2e",
  "--ink": "#f5f5f7",
  "--muted": "#a1a1a6",
  "--faint": "#8e8e93",
  "--hairline": "rgba(255, 255, 255, 0.1)",
};

function useResolvedDarkMode(darkMode: WidgetAppearance["darkMode"]): boolean {
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (darkMode !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [darkMode]);

  if (darkMode === "light") return false;
  if (darkMode === "dark") return true;
  return systemDark;
}

function LauncherIcon({ kind }: { kind: WidgetAppearance["launcher"] }) {
  if (kind === "sparkle") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5 10.1 7.6 12 3z" />
      </svg>
    );
  }
  if (kind === "cart") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function WidgetPreview({
  appearance,
}: {
  appearance: WidgetAppearance;
}) {
  const { accent, position, theme, avatarUrl } = appearance;
  const alignEnd = position === "right";
  const isDark = useResolvedDarkMode(appearance.darkMode);
  const vars = isDark ? DARK_VARS : LIGHT_VARS;

  const panelRadius = theme.shape === "sharp" ? "rounded-lg" : "rounded-2xl";
  const msgRadius = theme.shape === "sharp" ? "rounded-md" : "rounded-2xl";
  const density = theme.density === "compact" ? "compact" : "spacious";
  const listPadding = density === "compact" ? "p-2.5 gap-1.5" : "p-4 gap-2";
  const headerPadding = density === "compact" ? "px-3 py-2.5" : "px-4 py-3.5";
  const composerPadding = density === "compact" ? "px-2.5 py-2" : "px-3 py-2.5";

  return (
    <div
      className="sticky top-8"
      style={vars as CSSProperties}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-foreground">
        Live preview
      </p>
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-canvas p-5">
        <div
          className={
            "flex flex-col " + (alignEnd ? "items-end" : "items-start")
          }
        >
          {/* Panel */}
          <div
            className={`flex h-[440px] w-full max-w-[340px] flex-col overflow-hidden ${panelRadius} border border-hairline bg-surface shadow-[var(--shadow-sm)]`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between ${headerPadding} text-white`}
              style={{ background: accent }}
            >
              <div className="flex items-center gap-2.5">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : null}
                <div className="flex flex-col">
                  <span className="text-sm font-semibold leading-tight">
                    {appearance.title || "Chat with us"}
                  </span>
                  <span className="text-xs opacity-80">
                    {appearance.subtitle}
                  </span>
                </div>
              </div>
              <span className="text-lg leading-none opacity-80">&times;</span>
            </div>

            {/* Message list */}
            <div
              className={`flex flex-1 flex-col overflow-y-auto bg-surface-2 ${listPadding}`}
            >
              {appearance.greeting && (
                <div
                  className={`max-w-[80%] self-start ${msgRadius} rounded-bl-md bg-surface px-3.5 py-2 text-[13px] text-ink shadow-[var(--shadow-sm)]`}
                >
                  {appearance.greeting}
                </div>
              )}

              {appearance.quickReplies.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2 self-start">
                  {appearance.quickReplies.map((qr, i) => (
                    <span
                      key={i}
                      className="rounded-full border px-3 py-1 text-[12px] font-medium"
                      style={{ borderColor: accent, color: accent }}
                    >
                      {qr}
                    </span>
                  ))}
                </div>
              )}

              {appearance.showProductCards && (
                <div
                  className={`mt-1 w-[75%] self-start overflow-hidden ${msgRadius} border border-hairline bg-surface`}
                >
                  <div className="flex h-24 items-center justify-center bg-surface-2 text-foreground">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="h-8 w-8"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="M21 15l-5-5L5 21" />
                    </svg>
                  </div>
                  <div className="space-y-1.5 p-2.5">
                    <p className="text-[13px] font-medium text-ink">
                      Sample product
                    </p>
                    <p className="text-[12px] text-foreground">$49.00</p>
                    <span
                      className="inline-block rounded-full px-3 py-1 text-[12px] font-medium text-white"
                      style={{ background: accent }}
                    >
                      Add to cart
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div
              className={`flex items-center gap-2 border-t border-hairline bg-surface ${composerPadding}`}
            >
              <div className="flex-1 rounded-full border border-hairline bg-surface-2 px-3.5 py-2 text-[13px] text-foreground">
                Message…
              </div>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-white"
                style={{ background: accent }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </span>
            </div>
          </div>

          {/* Launcher */}
          <button
            type="button"
            disabled
            aria-hidden
            className="mt-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            style={{ background: accent }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <LauncherIcon kind={appearance.launcher} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
