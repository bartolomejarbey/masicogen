import { parsePastedMenuText, validateMenuForApproval } from "@masico/shared";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export const textMenuImportRequestSchema = z.object({
  locationId: uuidSchema,
  canteenId: uuidSchema,
  menuDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceText: z.string().trim().min(1).max(20_000)
});

export type TextMenuImportRequest = z.infer<typeof textMenuImportRequestSchema>;

export function buildTextMenuImportPayload(input: TextMenuImportRequest) {
  const menu = parsePastedMenuText(input.sourceText, input.menuDate);
  const issues = validateMenuForApproval(menu);
  const itemCount = menu.sections.reduce((total, section) => total + section.items.length, 0);

  return {
    menu,
    issues,
    itemCount,
    warningCount: new Set([...menu.warnings, ...issues.map((issue) => issue.message)]).size
  };
}
