import type { Analysis, Finding } from "@mdiw/shared";
import type { DocumentFacts, FilenameOf } from "./findings";
import { basisOf, comparisonStatus, sourceFor } from "./findings";

/** A finding as plain text: title, basis, detail, then each source with its value and quote. */
export function findingToText(finding: Finding, filenameOf: FilenameOf): string {
  const lines = [`${finding.title} [${basisOf(finding).label}]`];
  if (finding.detail !== null && finding.detail !== finding.title) lines.push(finding.detail);
  for (const source of finding.sources) {
    const value = source.value === null ? "" : `: ${source.value}`;
    lines.push(`- ${filenameOf(source.documentId)}${value}`);
    if (source.quote !== null) lines.push(`  "${source.quote}"`);
  }
  return lines.join("\n");
}

export function findingsToText(findings: readonly Finding[], filenameOf: FilenameOf): string {
  return findings.map((f) => findingToText(f, filenameOf)).join("\n\n");
}

export function factsToText(groups: readonly DocumentFacts[], filenameOf: FilenameOf): string {
  return groups
    .filter((group) => group.findings.length > 0)
    .map((group) => `## ${group.document.filename}\n\n${findingsToText(group.findings, filenameOf)}`)
    .join("\n\n");
}

export function summaryToText(analysis: Analysis, keyDocument: Finding | null, filenameOf: FilenameOf): string {
  const parts: string[] = [`Instruction: ${analysis.instruction}`];
  if (keyDocument !== null) parts.push(findingToText(keyDocument, filenameOf));
  for (const doc of analysis.documents) {
    parts.push(`${doc.filename} (relevance ${Math.round(doc.relevance * 100)}%)\n${doc.summary}`);
  }
  return parts.join("\n\n");
}

function markdownCell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();
}

/** The comparison table as Markdown: one row per field, one column per document, plus status. */
export function comparisonToMarkdown(analysis: Analysis, comparisons: readonly Finding[]): string {
  const header = ["Field", ...analysis.documents.map((d) => d.filename), "Status"].map(markdownCell);
  const rows = comparisons.map((finding) => [
    finding.title,
    ...analysis.documents.map((d) => sourceFor(finding, d.documentId)?.value ?? "—"),
    comparisonStatus(finding) ?? finding.detail ?? "",
  ]);
  const line = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;
  return [
    line(header),
    line(header.map(() => "---")),
    ...rows.map((cells) => line(cells.map(markdownCell))),
  ].join("\n");
}
