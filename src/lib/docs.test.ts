import { describe, expect, it } from "vitest";
import { HOW_IT_WORKS, SETUP_STEPS } from "./docs";

describe("docs content", () => {
  it("has explainer cards with a title and description", () => {
    expect(HOW_IT_WORKS.length).toBeGreaterThan(0);
    for (const card of HOW_IT_WORKS) {
      expect(card.title.trim()).not.toBe("");
      expect(card.description.trim()).not.toBe("");
    }
  });

  it("has setup steps with title, description, cta and an internal href", () => {
    expect(SETUP_STEPS.length).toBeGreaterThan(0);
    for (const step of SETUP_STEPS) {
      expect(step.title.trim()).not.toBe("");
      expect(step.description.trim()).not.toBe("");
      expect(step.cta.trim()).not.toBe("");
      expect(step.href.startsWith("/dashboard")).toBe(true);
    }
  });
});
