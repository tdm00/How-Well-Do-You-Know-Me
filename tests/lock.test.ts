import { describe, expect, it } from "vitest";
import { checkLock } from "@/lib/lock";

describe("checkLock", () => {
  it("accepts a trimmed pair during the answer phase", () => {
    const result = checkLock({
      phase: "answering",
      alreadyLocked: false,
      own: "  pizza ",
      prediction: " tacos ",
    });
    expect(result).toEqual({ ok: true, own: "pizza", prediction: "tacos" });
  });

  it("blocks edits after lock", () => {
    expect(
      checkLock({ phase: "answering", alreadyLocked: true, own: "pizza", prediction: "tacos" }),
    ).toEqual({ ok: false, reason: "already-locked" });
  });

  it("blocks locks outside the answer phase", () => {
    for (const phase of ["setup", "revealing", "final"]) {
      expect(checkLock({ phase, alreadyLocked: false, own: "pizza", prediction: "tacos" }).ok).toBe(false);
    }
  });

  it("blocks an empty side and overlong text", () => {
    expect(checkLock({ phase: "answering", alreadyLocked: false, own: "   ", prediction: "tacos" })).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(checkLock({ phase: "answering", alreadyLocked: false, own: "pizza", prediction: "" })).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(
      checkLock({
        phase: "answering",
        alreadyLocked: false,
        own: "x".repeat(121),
        prediction: "tacos",
      }),
    ).toEqual({ ok: false, reason: "too-long" });
  });
});
