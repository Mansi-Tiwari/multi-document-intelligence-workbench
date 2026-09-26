import { describe, expect, it } from "vitest";
import { INSTRUCTION_MAX, INSTRUCTION_MIN, checkAnalysisRequest, validateInstruction } from "./instruction";

const ID_A = "00000000-0000-4000-8000-00000000000a";
const ID_B = "00000000-0000-4000-8000-00000000000b";

describe("validateInstruction", () => {
  it("reads the limits from the shared schema", () => {
    expect(INSTRUCTION_MIN).toBe(3);
    expect(INSTRUCTION_MAX).toBe(2000);
  });

  it("accepts a valid instruction (after trimming)", () => {
    expect(validateInstruction("  Compare totals  ")).toBeNull();
  });

  it("explains empty, short and long instructions", () => {
    expect(validateInstruction("   ")).toMatch(/write an instruction/i);
    expect(validateInstruction("ab")).toBe("The instruction must be at least 3 characters.");
    expect(validateInstruction("x".repeat(2001))).toMatch(/at most 2000 characters \(it has 2001\)/);
  });
});

describe("checkAnalysisRequest", () => {
  it("requires at least one and at most 10 documents", () => {
    const none = checkAnalysisRequest("Compare totals", []);
    expect(none.ok ? "" : none.reason).toMatch(/at least one/);
    const eleven = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const tooMany = checkAnalysisRequest("Compare totals", eleven);
    expect(tooMany.ok ? "" : tooMany.reason).toMatch(/at most 10/);
  });

  it("reports instruction problems once documents are selected", () => {
    expect(checkAnalysisRequest("ab", [ID_A])).toEqual({ ok: false, reason: "The instruction must be at least 3 characters." });
  });

  it("returns the trimmed, validated request", () => {
    expect(checkAnalysisRequest("  Compare totals ", [ID_A, ID_B])).toEqual({
      ok: true,
      request: { instruction: "Compare totals", documentIds: [ID_A, ID_B] },
    });
  });
});
