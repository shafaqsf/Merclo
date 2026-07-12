import { describe, expect, it, vi, beforeEach } from "vitest";

const eqDel = vi.fn(() => ({ error: null }));
let maybeSingleResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabase: () => ({
    from: () => ({ delete: () => ({ eq: eqDel }) }),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => maybeSingleResult,
        }),
      }),
    }),
  }),
}));

describe("deleteConversationForOwner", () => {
  beforeEach(() => {
    eqDel.mockClear();
    maybeSingleResult = { data: null, error: null };
  });

  it("returns false and does not delete when the user does not own it", async () => {
    const mod = await import("./conversations");
    maybeSingleResult = { data: null, error: null };

    const result = await mod.deleteConversationForOwner("c1");

    expect(result).toBe(false);
    expect(eqDel).not.toHaveBeenCalled();
  });

  it("deletes and returns true when the user owns it", async () => {
    const mod = await import("./conversations");
    maybeSingleResult = {
      data: {
        id: "c1",
        bot_id: "b1",
        messages: [],
        status: "active",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      error: null,
    };

    const result = await mod.deleteConversationForOwner("c1");

    expect(result).toBe(true);
    expect(eqDel).toHaveBeenCalledWith("id", "c1");
  });
});
