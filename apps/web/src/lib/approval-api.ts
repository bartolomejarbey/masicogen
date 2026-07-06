import { z } from "zod";

const commentSchema = z.string().trim().max(1000).optional().nullable();

export const menuVersionApprovalRequestSchema = z.object({
  menuVersionId: z.string().uuid(),
  comment: commentSchema
});

export const deckVersionApprovalRequestSchema = z.object({
  deckVersionId: z.string().uuid(),
  comment: commentSchema
});

export const screenPublishRequestSchema = z.object({
  deckVersionId: z.string().uuid(),
  exportId: z.string().uuid(),
  comment: commentSchema
});

export type MenuVersionApprovalRequest = z.infer<typeof menuVersionApprovalRequestSchema>;
export type DeckVersionApprovalRequest = z.infer<typeof deckVersionApprovalRequestSchema>;
export type ScreenPublishRequest = z.infer<typeof screenPublishRequestSchema>;

export type ApprovalRpcError = {
  code?: string;
  message: string;
};

export function normalizeApprovalComment(comment: string | null | undefined) {
  const trimmed = comment?.trim();
  return trimmed ? trimmed : null;
}

export function zodIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

export function approvalRpcStatus(error: ApprovalRpcError) {
  switch (error.code) {
    case "28000":
      return 401;
    case "42501":
      return 403;
    case "P0002":
      return 404;
    case "22023":
    case "23502":
    case "23514":
      return 400;
    default:
      return 500;
  }
}
