import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import {
  critiquePrompts,
  screenshotAuditTargets,
  type ScreenshotAuditTarget
} from "../packages/shared/src/readiness";
import {
  visualAuditPresentations,
  visualAuditTemplates
} from "../packages/shared/src/visual-audit";

type InteractiveKind = "button" | "anchor" | "link";

type InteractiveElement = {
  kind: InteractiveKind;
  file: string;
  line: number;
  routeHint: string;
  label: string;
  href: string | null;
  typeAttr: string | null;
  disabled: boolean;
  hasOnClick: boolean;
  hasAriaLabel: boolean;
  targetBlank: boolean;
  rel: string | null;
  issues: string[];
};

type ScreenshotArtifact = {
  target: ScreenshotAuditTarget;
  viewport: "desktop" | "mobile";
  path: string;
  exists: boolean;
  dimensions: string | null;
};

const outputDir = "audit-artifacts";
const markdownOutputPath = join(outputDir, "ui-interaction-audit.md");
const jsonOutputPath = join(outputDir, "ui-interaction-inventory.json");
const scanRoots = ["apps/web/src/app", "apps/web/src/components"];
const fileExtensions = new Set([".tsx", ".ts"]);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const files = (await Promise.all(scanRoots.map((root) => collectFiles(root)))).flat();
  const elements = (await Promise.all(files.map(readInteractiveElements))).flat();
  const screenshotArtifacts = collectScreenshotArtifacts();
  const report = buildReport(elements, screenshotArtifacts);

  await mkdir(outputDir, { recursive: true });
  await writeFile(markdownOutputPath, report, "utf8");
  await writeFile(
    jsonOutputPath,
    `${JSON.stringify({ elements, screenshotArtifacts }, null, 2)}\n`,
    "utf8"
  );

  console.log(`UI interaction audit written to ${markdownOutputPath}`);
  console.log(`UI interaction inventory written to ${jsonOutputPath}`);
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(path);
      }

      if (entry.isFile() && fileExtensions.has(extname(entry.name))) {
        return [path];
      }

      return [];
    })
  );

  return nested.flat();
}

async function readInteractiveElements(file: string): Promise<InteractiveElement[]> {
  const source = await readFile(file, "utf8");
  const elements: InteractiveElement[] = [];

  elements.push(...extractElements(source, file, "button", "button"));
  elements.push(...extractElements(source, file, "anchor", "a"));
  elements.push(...extractElements(source, file, "link", "Link"));

  return elements;
}

function extractElements(
  source: string,
  file: string,
  kind: InteractiveKind,
  tagName: string
): InteractiveElement[] {
  const elements: InteractiveElement[] = [];
  const openToken = `<${tagName}`;
  const closeToken = `</${tagName}>`;
  let searchIndex = 0;

  while (searchIndex < source.length) {
    const start = source.indexOf(openToken, searchIndex);
    if (start === -1) {
      break;
    }

    const nextChar = source[start + openToken.length];
    if (nextChar && !/[\s>]/.test(nextChar)) {
      searchIndex = start + openToken.length;
      continue;
    }

    const openEnd = findOpeningTagEnd(source, start + openToken.length);
    if (openEnd === -1) {
      break;
    }

    const closeStart = source.indexOf(closeToken, openEnd + 1);
    if (closeStart === -1) {
      searchIndex = openEnd + 1;
      continue;
    }

    const attrs = source.slice(start + openToken.length, openEnd);
    const body = source.slice(openEnd + 1, closeStart);
    const label = extractLabel(body, attrs);
    const href = extractAttribute(attrs, "href");
    const rel = extractAttribute(attrs, "rel");
    const element: InteractiveElement = {
      kind,
      file,
      line: lineForIndex(source, start),
      routeHint: routeHintForFile(file),
      label,
      href,
      typeAttr: extractAttribute(attrs, "type"),
      disabled: /\bdisabled(?:\s|=|>|$)/.test(attrs),
      hasOnClick: /\bonClick=/.test(attrs),
      hasAriaLabel: /\baria-label=/.test(attrs),
      targetBlank: /target=["']_blank["']/.test(attrs),
      rel,
      issues: []
    };

    element.issues = evaluateElement(element);
    elements.push(element);
    searchIndex = closeStart + closeToken.length;
  }

  return elements;
}

function findOpeningTagEnd(source: string, startIndex: number) {
  let braceDepth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const previous = source[index - 1];

    if (quote) {
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }

    if (char === ">" && braceDepth === 0) {
      return index;
    }
  }

  return -1;
}

function extractLabel(body: string, attrs: string) {
  const visibleText = body
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  if (visibleText) {
    return visibleText;
  }

  const bodyWithoutTags = body.replace(/<[^>]+>/g, " ");
  const dynamicParts = [...bodyWithoutTags.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);

  if (dynamicParts.length > 0) {
    return `{${dynamicParts.join(" + ")}}`;
  }

  return extractAttribute(attrs, "aria-label") ?? "";
}

function extractAttribute(attrs: string, name: string) {
  const pattern = new RegExp(`${name}=("([^"]*)"|'([^']*)'|\\{([^}]*)\\})`);
  const match = attrs.match(pattern);
  return match?.[2] ?? match?.[3] ?? match?.[4]?.trim() ?? null;
}

function lineForIndex(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function routeHintForFile(file: string) {
  const normalized = file.replaceAll("\\", "/");
  const appPrefix = "apps/web/src/app/";

  if (normalized.startsWith(appPrefix) && normalized.endsWith("/page.tsx")) {
    const route = normalized.slice(appPrefix.length, -"/page.tsx".length);
    if (!route) {
      return "/";
    }

    return `/${route.replace(/\[[^\]]+\]/g, (segment) => `:${segment.slice(1, -1)}`)}`;
  }

  if (normalized.includes("apps/web/src/components/")) {
    return `component:${normalized.split("/").at(-1)?.replace(/\.(tsx|ts)$/, "") ?? "unknown"}`;
  }

  return relative(process.cwd(), file);
}

function evaluateElement(element: InteractiveElement) {
  const issues: string[] = [];
  const labelLength = element.label.length;

  if (!element.label && !element.hasAriaLabel) {
    issues.push("missing_visible_label_or_aria_label");
  }

  if (labelLength > 42) {
    issues.push("label_too_long_for_fast_scan");
  }

  if (
    element.kind === "button" &&
    !element.disabled &&
    !element.hasOnClick &&
    !element.href &&
    element.typeAttr !== "submit"
  ) {
    issues.push("button_has_no_detected_action");
  }

  if (element.disabled && !explainsDisabledState(element.label)) {
    issues.push("disabled_state_needs_clearer_reason");
  }

  if ((element.kind === "anchor" || element.kind === "link") && !element.href) {
    issues.push("link_missing_static_href");
  }

  if (element.targetBlank && !/(noopener|noreferrer)/.test(element.rel ?? "")) {
    issues.push("target_blank_missing_rel");
  }

  if (element.href?.startsWith("/api/")) {
    issues.push("direct_api_link_needs_runtime_access_check");
  }

  if (element.href === "#") {
    issues.push("placeholder_href");
  }

  return issues;
}

function explainsDisabledState(label: string) {
  return /(zatím|není|bude|čeká|čekáme|nenapojeno|připrav|production|produkční|nejdřív|po schválení|demo)/i.test(
    label
  );
}

function collectScreenshotArtifacts(): ScreenshotArtifact[] {
  return screenshotAuditTargets.flatMap((target) => [
    artifactFor(target, "desktop", target.desktopArtifact),
    artifactFor(target, "mobile", target.mobileArtifact)
  ]);
}

function artifactFor(
  target: ScreenshotAuditTarget,
  viewport: "desktop" | "mobile",
  path: string
): ScreenshotArtifact {
  return {
    target,
    viewport,
    path,
    exists: existsSync(path),
    dimensions: existsSync(path) ? readImageDimensions(path) : null
  };
}

function readImageDimensions(path: string) {
  const buffer = readFileSync(path);
  if (isPng(buffer)) {
    return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
  }

  if (isJpeg(buffer)) {
    return readJpegDimensions(buffer);
  }

  return null;
}

function isPng(buffer: Buffer) {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8;
}

function readJpegDimensions(buffer: Buffer) {
  let offset = 2;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);

    if (frameMarkers.has(marker)) {
      return `${buffer.readUInt16BE(offset + 7)}x${buffer.readUInt16BE(offset + 5)}`;
    }

    if (length < 2) {
      return null;
    }

    offset += 2 + length;
  }

  return null;
}

function buildReport(elements: InteractiveElement[], artifacts: ScreenshotArtifact[]) {
  const issueElements = elements.filter((element) => element.issues.length > 0);
  const missingArtifacts = artifacts.filter((artifact) => !artifact.exists);
  const disabledElements = elements.filter((element) => element.disabled);
  const directApiLinks = elements.filter((element) =>
    element.issues.includes("direct_api_link_needs_runtime_access_check")
  );
  const routeGroups = groupBy(elements, (element) => element.routeHint);

  const lines = [
    "# MASI-CO TV Studio UI Interaction Audit",
    "",
    "This report is deliberately skeptical. It inventories visible controls and screenshot proof points, then highlights what still needs human/browser/OCR review.",
    "",
    "## Summary",
    "",
    `- Screenshot targets: ${screenshotAuditTargets.length}`,
    `- Screenshot artifacts checked: ${artifacts.length}`,
    `- Missing screenshot artifacts: ${missingArtifacts.length}`,
    `- Interactive elements inventoried: ${elements.length}`,
    `- Disabled controls: ${disabledElements.length}`,
    `- Elements with audit issues: ${issueElements.length}`,
    `- Visual audit presentations/templates: ${visualAuditPresentations.length}/${visualAuditTemplates.length}`,
    "",
    "## Critical Notes",
    "",
    ...criticalNotes(missingArtifacts, issueElements, directApiLinks),
    "",
    "## Screenshot Evidence",
    "",
    ...artifacts.flatMap((artifact) => [
      `- ${artifact.viewport} ${artifact.target.label} (${artifact.target.route}): ${artifact.exists ? "exists" : "missing"}${artifact.dimensions ? `, ${artifact.dimensions}` : ""} - ${artifact.path}`
    ]),
    "",
    "## Interactive Inventory",
    "",
    ...Array.from(routeGroups.entries()).flatMap(([route, routeElements]) => [
      `### ${route}`,
      "",
      ...routeElements.map(formatElementLine),
      ""
    ]),
    "## Elements Requiring Critique",
    "",
    ...(issueElements.length > 0
      ? issueElements.flatMap((element) => [
          `- ${element.file}:${element.line} ${element.kind} "${element.label || "(bez popisku)"}"`,
          `  Issues: ${element.issues.join(", ")}`
        ])
      : ["- None detected by static pass. Browser click-through is still required."]),
    "",
    "## OCR / 3m Readability Council Prompts",
    "",
    ...critiquePrompts.flatMap((prompt) => [
      `### ${prompt.round}`,
      "",
      `- Question: ${prompt.question}`,
      `- Why it matters: ${prompt.whyItMatters}`,
      ""
    ]),
    "## Next Browser Pass",
    "",
    "- Capture fresh desktop and mobile screenshots for every screenshot target after each material UI change.",
    "- Click every enabled control once in demo mode and record whether it mutates state, navigates, downloads, or is decorative.",
    "- OCR or manually transcribe screenshot text from three-metre viewing distance and flag text that cannot be read in under three seconds.",
    "- Verify that disabled production controls explain why they are disabled and what unlocks them.",
    "- Compare the TV player with and without a token so demo content never masks a production authorization failure."
  ];

  return `${lines.join("\n")}\n`;
}

function criticalNotes(
  missingArtifacts: ScreenshotArtifact[],
  issueElements: InteractiveElement[],
  directApiLinks: InteractiveElement[]
) {
  const notes: string[] = [];

  if (missingArtifacts.length > 0) {
    notes.push(`- Missing screenshot artifacts must be regenerated: ${missingArtifacts.map((artifact) => artifact.path).join(", ")}`);
  } else {
    notes.push("- All configured screenshot artifact paths currently exist.");
  }

  if (issueElements.length > 0) {
    notes.push(`- Static scan found ${issueElements.length} controls needing critique before production confidence.`);
  } else {
    notes.push("- Static scan found no obvious label/action/link issues, but this does not prove browser behavior.");
  }

  if (directApiLinks.length > 0) {
    notes.push(`- ${directApiLinks.length} UI links point directly at API routes; verify auth, content type, and failure states in browser.`);
  }

  if (visualAuditPresentations.length !== 10 || visualAuditTemplates.length !== 10) {
    notes.push("- The 10+10 visual audit data contract is broken and must be restored.");
  } else {
    notes.push("- The 10+10 visual audit data contract is intact.");
  }

  return notes;
}

function formatElementLine(element: InteractiveElement) {
  const state = element.disabled ? "disabled" : "enabled";
  const target = element.href ? ` -> ${element.href}` : "";
  const issues = element.issues.length > 0 ? ` [${element.issues.join(", ")}]` : "";
  return `- ${element.file}:${element.line} ${element.kind} ${state} "${element.label || "(bez popisku)"}"${target}${issues}`;
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K) {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}
