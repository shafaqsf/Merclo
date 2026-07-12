/**
 * Widget appearance/config for a bot. Stored as `bots.appearance` (jsonb) and
 * shared by: the Appearance editor UI, the public config route the widget
 * fetches, and the widget itself. Defaults live here so a bot with an empty
 * `{}` still renders a complete, valid config.
 */

export type WidgetPosition = "right" | "left";
export type LauncherIcon = "chat" | "sparkle" | "cart";

export interface ProactiveConfig {
  enabled: boolean;
  delayMs: number;
  message: string;
}

export interface WidgetAppearance {
  accent: string; // hex color
  position: WidgetPosition;
  launcher: LauncherIcon;
  title: string;
  subtitle: string;
  greeting: string;
  quickReplies: string[];
  showProductCards: boolean;
  proactive: ProactiveConfig;
}

export const DEFAULT_APPEARANCE: WidgetAppearance = {
  accent: "#0071e3",
  position: "right",
  launcher: "chat",
  title: "Chat with us",
  subtitle: "Typically replies in a few seconds",
  greeting: "Hi! How can I help you with your shopping today?",
  quickReplies: [],
  showProductCards: true,
  proactive: { enabled: false, delayMs: 8000, message: "👋 Need a hand finding something?" },
};

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/**
 * Merge a raw stored value with defaults, coercing/validating every field so
 * the result is always a complete, safe `WidgetAppearance`. Pure — unit tested.
 */
export function resolveAppearance(raw: unknown): WidgetAppearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_APPEARANCE;

  const position: WidgetPosition = r.position === "left" ? "left" : "right";
  const launcher: LauncherIcon =
    r.launcher === "sparkle" || r.launcher === "cart"
      ? r.launcher
      : "chat";

  const quickReplies = Array.isArray(r.quickReplies)
    ? r.quickReplies
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : d.quickReplies;

  const p = (r.proactive && typeof r.proactive === "object"
    ? r.proactive
    : {}) as Record<string, unknown>;

  return {
    accent: isHexColor(r.accent) ? r.accent : d.accent,
    position,
    launcher,
    title: str(r.title, d.title),
    subtitle: str(r.subtitle, d.subtitle),
    greeting: str(r.greeting, d.greeting),
    quickReplies,
    showProductCards: bool(r.showProductCards, d.showProductCards),
    proactive: {
      enabled: bool(p.enabled, d.proactive.enabled),
      delayMs:
        typeof p.delayMs === "number" && p.delayMs >= 0
          ? Math.min(p.delayMs, 120_000)
          : d.proactive.delayMs,
      message: str(p.message, d.proactive.message),
    },
  };
}
