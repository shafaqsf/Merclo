import { describe, it, expect } from "vitest";
import { resolveAppearance, DEFAULT_APPEARANCE } from "./appearance";

describe("resolveAppearance", () => {
  it("returns defaults for empty/invalid input", () => {
    expect(resolveAppearance({})).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance("nope")).toEqual(DEFAULT_APPEARANCE);
  });

  it("keeps valid overrides and coerces invalid ones", () => {
    const r = resolveAppearance({
      accent: "#ff0000",
      position: "left",
      launcher: "sparkle",
      accentTypo: true,
    });
    expect(r.accent).toBe("#ff0000");
    expect(r.position).toBe("left");
    expect(r.launcher).toBe("sparkle");
  });

  it("rejects a non-hex accent and bad enum values", () => {
    const r = resolveAppearance({ accent: "red", position: "middle", launcher: "x" });
    expect(r.accent).toBe(DEFAULT_APPEARANCE.accent);
    expect(r.position).toBe("right");
    expect(r.launcher).toBe("chat");
  });

  it("trims, drops empties, and caps quick replies at 6", () => {
    const r = resolveAppearance({
      quickReplies: ["  a ", "", "b", 3, "c", "d", "e", "f", "g"],
    });
    expect(r.quickReplies).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("clamps proactive delay and fills missing proactive fields", () => {
    const r = resolveAppearance({ proactive: { enabled: true, delayMs: 999999 } });
    expect(r.proactive.enabled).toBe(true);
    expect(r.proactive.delayMs).toBe(120000);
    expect(r.proactive.message).toBe(DEFAULT_APPEARANCE.proactive.message);
  });

  it("keeps a valid https avatarUrl and an empty string", () => {
    expect(resolveAppearance({ avatarUrl: "https://example.com/logo.png" }).avatarUrl).toBe(
      "https://example.com/logo.png"
    );
    expect(resolveAppearance({ avatarUrl: "" }).avatarUrl).toBe("");
  });

  it("rejects a non-https avatarUrl and non-string values", () => {
    expect(resolveAppearance({ avatarUrl: "http://example.com/logo.png" }).avatarUrl).toBe(
      DEFAULT_APPEARANCE.avatarUrl
    );
    expect(resolveAppearance({ avatarUrl: 123 }).avatarUrl).toBe(DEFAULT_APPEARANCE.avatarUrl);
    expect(resolveAppearance({ avatarUrl: "not-a-url" }).avatarUrl).toBe(
      DEFAULT_APPEARANCE.avatarUrl
    );
  });

  it("rejects an overly long avatarUrl", () => {
    const longUrl = "https://example.com/" + "a".repeat(2048);
    expect(resolveAppearance({ avatarUrl: longUrl }).avatarUrl).toBe(DEFAULT_APPEARANCE.avatarUrl);
  });

  it("keeps a valid theme combo", () => {
    const r = resolveAppearance({ theme: { shape: "sharp", density: "compact" } });
    expect(r.theme).toEqual({ shape: "sharp", density: "compact" });
  });

  it("falls back per-field for invalid theme shape/density", () => {
    const r = resolveAppearance({ theme: { shape: "round-ish", density: "compact" } });
    expect(r.theme.shape).toBe(DEFAULT_APPEARANCE.theme.shape);
    expect(r.theme.density).toBe("compact");
  });

  it("falls back to the full default theme when missing or not an object", () => {
    expect(resolveAppearance({}).theme).toEqual(DEFAULT_APPEARANCE.theme);
    expect(resolveAppearance({ theme: "nope" }).theme).toEqual(DEFAULT_APPEARANCE.theme);
  });

  it("keeps valid darkMode values and falls back to auto otherwise", () => {
    expect(resolveAppearance({ darkMode: "light" }).darkMode).toBe("light");
    expect(resolveAppearance({ darkMode: "dark" }).darkMode).toBe("dark");
    expect(resolveAppearance({ darkMode: "auto" }).darkMode).toBe("auto");
    expect(resolveAppearance({ darkMode: "midnight" }).darkMode).toBe("auto");
  });
});
