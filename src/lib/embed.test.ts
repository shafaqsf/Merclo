import { describe, expect, it } from "vitest";
import { buildEmbedSnippet } from "./embed";

describe("buildEmbedSnippet", () => {
  it("builds a script tag with the bot id and app url", () => {
    expect(buildEmbedSnippet("bot_123", "https://app.merclo.com")).toBe(
      '<script src="https://app.merclo.com/widget.js" data-bot-id="bot_123" defer></script>'
    );
  });

  it("strips trailing slashes from the app url", () => {
    expect(buildEmbedSnippet("abc", "https://app.merclo.com/")).toBe(
      '<script src="https://app.merclo.com/widget.js" data-bot-id="abc" defer></script>'
    );
  });

  it("handles multiple trailing slashes", () => {
    expect(buildEmbedSnippet("x", "http://localhost:3000///")).toBe(
      '<script src="http://localhost:3000/widget.js" data-bot-id="x" defer></script>'
    );
  });
});
