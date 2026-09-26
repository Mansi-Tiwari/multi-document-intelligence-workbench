import { joinList } from "@mdiw/shared";
import type { Analysis, AnalysisOverview, Finding } from "@mdiw/shared";
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

/** The Summary tab as plain text, in the same order as on screen. */
export function overviewToText(instruction: string, overview: AnalysisOverview): string {
  const single = overview.documents.length === 1;
  const parts: string[] = [`Instruction: ${instruction}`, `At a glance: ${overview.headline}`];
  if (overview.differences.length > 0) {
    parts.push(
      ["Differences:", ...overview.differences.map((d) => `- ${d.label}: ${d.values.map((v) => `${v.value} (${v.filename})`).join(" vs ")}`)].join("\n"),
    );
  }
  if (overview.missing.length > 0) {
    parts.push(["Missing:", ...overview.missing.map((m) => `- ${m.label}: not in ${joinList(m.missingFrom)}`)].join("\n"));
  }
  if (overview.matches.length > 0) {
    parts.push(
      [
        single ? "Found:" : "Agree:",
        ...overview.matches.map((m) => `- ${m.label}: ${m.value}${single ? "" : ` (${m.foundIn} of ${overview.documents.length} documents)`}`),
      ].join("\n"),
    );
  }
  if (overview.notFoundAnywhere.length > 0) {
    parts.push(`${single ? "Not in the document" : "Not in any document"}: ${joinList(overview.notFoundAnywhere.map((n) => n.label))}`);
  }
  if (overview.keyDocument !== null && !single) {
    parts.push(`Key document [AI]: ${overview.keyDocument.filename} (${overview.keyDocument.reason})`);
  }
  for (const doc of overview.documents) {
    parts.push(`${doc.filename} (${doc.relevanceLevel} relevance, ${doc.pointsFound} of ${doc.pointsTotal} points found)\n${doc.summary}`);
  }
  if (overview.skipped.length > 0) {
    parts.push(["Skipped:", ...overview.skipped.map((s) => `- ${s.name}: ${s.message}`)].join("\n"));
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
