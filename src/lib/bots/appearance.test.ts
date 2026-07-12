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
});
