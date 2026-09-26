import { ErrorCodeSchema } from "@mdiw/shared";
import { describe, expect, it } from "vitest";
import { errorTitle } from "./errors";

describe("errorTitle", () => {
  it("has a title for every server error code", () => {
    for (const code of ErrorCodeSchema.options) {
      expect(errorTitle(code)).not.toBe("");
    }
  });

  it("describes client-only failures", () => {
    expect(errorTitle("NETWORK_ERROR")).toBe("Can't reach the server");
    expect(errorTitle("INVALID_RESPONSE")).toMatch(/unexpected/i);
  });
});
