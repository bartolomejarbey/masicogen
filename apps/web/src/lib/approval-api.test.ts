import { describe, expect, it } from "vitest";
import {
  approvalRpcStatus,
  menuVersionApprovalRequestSchema,
  normalizeApprovalComment,
  screenPublishRequestSchema,
  zodIssues
} from "./approval-api";

describe("approval API helpers", () => {
  it("validates menu approval requests and trims optional comments", () => {
    const request = menuVersionApprovalRequestSchema.parse({
      menuVersionId: "00000000-0000-4000-8000-000000000101",
      comment: "  Cena překontrolována.  "
    });

    expect(request.comment).toBe("Cena překontrolována.");
    expect(normalizeApprovalComment(request.comment)).toBe("Cena překontrolována.");
    expect(normalizeApprovalComment("   ")).toBeNull();
  });

  it("rejects publish requests without UUID deck/export ids", () => {
    const result = screenPublishRequestSchema.safeParse({
      deckVersionId: "deck-demo",
      exportId: "export-demo",
      comment: "OK"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(zodIssues(result.error).map((issue) => issue.path)).toEqual([
        "deckVersionId",
        "exportId"
      ]);
    }
  });

  it("maps Supabase RPC error codes to browser API statuses", () => {
    expect(approvalRpcStatus({ code: "28000", message: "auth" })).toBe(401);
    expect(approvalRpcStatus({ code: "42501", message: "forbidden" })).toBe(403);
    expect(approvalRpcStatus({ code: "P0002", message: "missing" })).toBe(404);
    expect(approvalRpcStatus({ code: "23514", message: "invalid state" })).toBe(400);
    expect(approvalRpcStatus({ code: "XX000", message: "boom" })).toBe(500);
  });
});
