import { describe, expect, it } from "vitest";
import { mapRowToCopilotThread } from "./copilot-conversations";

describe("mapRowToCopilotThread", () => {
  it("maps a full row into a typed thread", () => {
    const t = mapRowToCopilotThread({
      id: "t1",
      owner_id: "u1",
      items: [{ role: "user", content: "hi" }],
      pending_state: null,
      mode: "auto",
      created_at: "2026-07-12T00:00:00Z",
      updated_at: "2026-07-12T00:00:00Z",
    });
    expect(t.id).toBe("t1");
    expect(t.owner_id).toBe("u1");
    expect(t.items).toEqual([{ role: "user", content: "hi" }]);
    expect(t.pending_state).toBeNull();
    expect(t.mode).toBe("auto");
  });

  it("defaults items to [] and mode to 'accept' for missing/invalid values", () => {
    const t = mapRowToCopilotThread({
      id: "t2",
      owner_id: "u1",
      items: null,
      pending_state: "state-string",
      mode: "bogus",
      created_at: "x",
      updated_at: "x",
    });
    expect(t.items).toEqual([]);
    expect(t.mode).toBe("accept");
    expect(t.pending_state).toBe("state-string");
  });
});
