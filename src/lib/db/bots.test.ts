import { describe, it, expect } from "vitest";
import { mapRowToBot, normalizeOrigins } from "@/lib/db/bots";

describe("normalizeOrigins", () => {
  it("trims, drops empties, and lowercases hosts", () => {
    expect(normalizeOrigins([" https://Shop.com ", "", "  "])).toEqual([
      "https://shop.com",
    ]);
  });

  it("strips trailing slashes", () => {
    expect(normalizeOrigins(["https://shop.com/"])).toEqual(["https://shop.com"]);
  });

  it("de-duplicates case-insensitively", () => {
    expect(
      normalizeOrigins(["https://shop.com", "https://SHOP.com/"])
    ).toEqual(["https://shop.com"]);
  });

  it("returns an empty array for no valid origins", () => {
    expect(normalizeOrigins(["", "   "])).toEqual([]);
  });
});

describe("mapRowToBot", () => {
  it("maps a well-formed row", () => {
    const bot = mapRowToBot({
      id: "b1",
      owner_id: "u1",
      name: "Support",
      persona: "helpful",
      allowed_tools: ["search_products"],
      allowed_origins: ["https://shop.com"],
      appearance: { accent: "#ff0000" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(bot).toEqual({
      id: "b1",
      owner_id: "u1",
      name: "Support",
      persona: "helpful",
      allowed_tools: ["search_products"],
      allowed_origins: ["https://shop.com"],
      appearance: { accent: "#ff0000" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
  });

  it("defaults missing persona and array fields", () => {
    const bot = mapRowToBot({
      id: "b2",
      owner_id: "u2",
      name: "Bare",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(bot.persona).toBe("");
    expect(bot.allowed_tools).toEqual([]);
    expect(bot.allowed_origins).toEqual([]);
    expect(bot.appearance).toEqual({});
  });

  it("coerces non-string array entries to strings", () => {
    const bot = mapRowToBot({
      id: 5,
      owner_id: "u3",
      name: "Coerce",
      allowed_tools: [1, 2],
      allowed_origins: [],
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(bot.id).toBe("5");
    expect(bot.allowed_tools).toEqual(["1", "2"]);
  });
});
