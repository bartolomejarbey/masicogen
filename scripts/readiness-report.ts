import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  critiquePrompts,
  readinessFindings,
  readinessGates,
  screenshotAuditTargets,
  type ReadinessSeverity,
  type ReadinessStatus
} from "../packages/shared/src/readiness";

const outputDir = "audit-artifacts";
const outputPath = join(outputDir, "readiness-report.md");

const severityOrder: ReadinessSeverity[] = ["P0", "P1", "P2"];
const statusOrder: ReadinessStatus[] = ["open", "partial", "passing"];

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, buildReport(), "utf8");

  console.log(`Readiness report written to ${outputPath}`);
}

function buildReport() {
  const lines = [
    "# MASI-CO TV Studio Readiness Report",
    "",
    "This report is intentionally critical. A passing build is not treated as proof that the product is production-ready.",
    "",
    "## Risk Summary",
    "",
    ...severityOrder.map((severity) => {
      const count = readinessFindings.filter((finding) => finding.severity === severity).length;
      return `- ${severity}: ${count}`;
    }),
    "",
    "## Gate Summary",
    "",
    ...statusOrder.map((status) => {
      const count = readinessGates.filter((gate) => gate.status === status).length;
      return `- ${status}: ${count}`;
    }),
    "",
    "## Findings",
    "",
    ...readinessFindings.flatMap((finding) => [
      `### ${finding.severity} - ${finding.title}`,
      "",
      `- Category: ${finding.category}`,
      `- Status: ${finding.status}`,
      `- Evidence: ${finding.evidence}`,
      `- Impact: ${finding.impact}`,
      `- Next action: ${finding.nextAction}`,
      ""
    ]),
    "## Gates",
    "",
    ...readinessGates.flatMap((gate) => [
      `### ${gate.label}`,
      "",
      `- Status: ${gate.status}`,
      `- Owner: ${gate.owner}`,
      `- Evidence: ${gate.evidence}`,
      ""
    ]),
    "## Screenshot Targets",
    "",
    ...screenshotAuditTargets.flatMap((target) => [
      `### ${target.label}`,
      "",
      `- Route: ${target.route}`,
      `- Desktop artifact: ${artifactLine(target.desktopArtifact)}`,
      `- Mobile artifact: ${artifactLine(target.mobileArtifact)}`,
      `- Must check: ${target.mustCheck.join(", ")}`,
      ""
    ]),
    "## Critique Prompts",
    "",
    ...critiquePrompts.flatMap((prompt) => [
      `### ${prompt.round}`,
      "",
      `- Question: ${prompt.question}`,
      `- Why it matters: ${prompt.whyItMatters}`,
      ""
    ])
  ];

  return `${lines.join("\n")}\n`;
}

function artifactLine(path: string) {
  return existsSync(path) ? `${path} (exists)` : `${path} (missing)`;
}
