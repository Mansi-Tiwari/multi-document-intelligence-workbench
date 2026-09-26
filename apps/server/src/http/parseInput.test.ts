import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ValidationError } from "../domain/errors";
import { parseInput } from "./parseInput";

const Schema = z.object({ name: z.string().trim().min(1), count: z.coerce.number().int() });

describe("parseInput", () => {
  it("returns the parsed output", () => {
    expect(parseInput(Schema, { name: "  a ", count: "3" })).toEqual({ name: "a", count: 3 });
  });

  it("throws a ValidationError with issues", () => {
    try {
      parseInput(Schema, { name: "", count: "x" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (!(error instanceof ValidationError)) return;
      expect(error.status).toBe(400);
      expect(error.issues?.map((issue) => issue.path)).toEqual(["name", "count"]);
    }
  });
});
