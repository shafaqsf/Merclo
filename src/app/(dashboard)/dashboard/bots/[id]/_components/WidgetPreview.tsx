"use client";

import type { WidgetAppearance } from "@/lib/bots/appearance";

/**
 * Static, non-functional visual mock of the storefront widget panel. Pure
 * presentational — mirrors what the embedded widget renders from the same
 * appearance config so merchants get a live preview while editing.
 */

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
  const { accent, position } = appearance;
  const alignEnd = position === "right";

  return (
    <div className="sticky top-8">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-faint">
        Live preview
      </p>
      <div className="relative overflow-hidden rounded-2xl border border-hairline bg-canvas p-5">
        <div
          className={
            "flex flex-col " + (alignEnd ? "items-end" : "items-start")
          }
        >
          {/* Panel */}
          <div className="flex h-[440px] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[var(--shadow-sm)]">
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3.5 text-white"
              style={{ background: accent }}
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-tight">
                  {appearance.title || "Chat with us"}
                </span>
                <span className="text-xs opacity-80">
                  {appearance.subtitle}
                </span>
              </div>
              <span className="text-lg leading-none opacity-80">&times;</span>
            </div>

            {/* Message list */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-surface-2 p-4">
              {appearance.greeting && (
                <div className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-surface px-3.5 py-2 text-[13px] text-ink shadow-[var(--shadow-sm)]">
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
                <div className="mt-1 w-[75%] self-start overflow-hidden rounded-xl border border-hairline bg-surface">
                  <div className="flex h-24 items-center justify-center bg-surface-2 text-faint">
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
                    <p className="text-[12px] text-muted">$49.00</p>
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
            <div className="flex items-center gap-2 border-t border-hairline bg-surface px-3 py-2.5">
              <div className="flex-1 rounded-full border border-hairline bg-surface-2 px-3.5 py-2 text-[13px] text-faint">
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
            className="mt-4 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            style={{ background: accent }}
          >
            <LauncherIcon kind={appearance.launcher} />
          </button>
        </div>
      </div>
    </div>
  );
}
