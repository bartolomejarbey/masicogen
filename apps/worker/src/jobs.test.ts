import { describe, expect, it } from "vitest";
import { getFailureStatus } from "./jobs";

describe("render job state machine", () => {
  it("retries failed work until the max attempt is reached", () => {
    expect(getFailureStatus(1, 3)).toBe("retrying");
    expect(getFailureStatus(2, 3)).toBe("retrying");
    expect(getFailureStatus(3, 3)).toBe("failed");
  });
});
