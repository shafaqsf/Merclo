import { describe, it, expect } from "vitest";
import { isAuthDisabled, devUserEmail } from "./access";

describe("isAuthDisabled", () => {
  it("is false when the flag is unset", () => {
    expect(isAuthDisabled({})).toBe(false);
  });

  it("is true only for the exact string 'true'", () => {
    expect(isAuthDisabled({ DASHBOARD_AUTH_DISABLED: "true" })).toBe(true);
    expect(isAuthDisabled({ DASHBOARD_AUTH_DISABLED: "TRUE" })).toBe(false);
    expect(isAuthDisabled({ DASHBOARD_AUTH_DISABLED: "1" })).toBe(false);
    expect(isAuthDisabled({ DASHBOARD_AUTH_DISABLED: "false" })).toBe(false);
    expect(isAuthDisabled({ DASHBOARD_AUTH_DISABLED: "" })).toBe(false);
  });
});

describe("devUserEmail", () => {
  it("falls back to a default when unset", () => {
    expect(devUserEmail({})).toBe("dev@merclo.local");
  });

  it("uses the configured email when provided", () => {
    expect(devUserEmail({ DASHBOARD_DEV_EMAIL: "me@example.com" })).toBe(
      "me@example.com"
    );
  });
});
