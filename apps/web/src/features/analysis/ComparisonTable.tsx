import type { Analysis, Finding } from "@mdiw/shared";
import { Badge } from "../../components/Badge";
import type { BadgeTone } from "../../components/Badge";
import { CopyButton } from "../../components/CopyButton";
import { findingToText } from "./copyText";
import type { CopyFn } from "./FindingCard";
import { BasisBadge } from "./FindingCard";
import type { ComparisonStatus, FilenameOf } from "./findings";
import { comparisonStatus, sourceFor } from "./findings";

const STATUS_TONE: Record<ComparisonStatus, BadgeTone> = {
  consistent: "ok",
  discrepancy: "error",
  partial: "warn",
  missing: "neutral",
};

function StatusPill({ finding }: { finding: Finding }) {
  const status = comparisonStatus(finding);
  if (status === null) return finding.detail === null ? null : <Badge tone="neutral">{finding.detail}</Badge>;
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

interface ComparisonTableProps {
  analysis: Analysis;
  comparisons: readonly Finding[];
  filenameOf: FilenameOf;
  onCopy: CopyFn;
}

/** One row per field, one column per document. Scrolls horizontally inside its own container. */
export function ComparisonTable({ analysis, comparisons, filenameOf, onCopy }: ComparisonTableProps) {
  return (
    <div className="table-scroll" role="region" aria-label="Comparison table" tabIndex={0}>
      <table className="comparison">
        <thead>
          <tr>
            <th scope="col">Field</th>
            {analysis.documents.map((doc) => (
              <th scope="col" key={doc.documentId}>
                {doc.filename}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparisons.map((finding) => (
            <tr key={finding.id}>
              <th scope="row">
                <span className="comparison__field">{finding.title}</span>
                <span className="comparison__tags">
                  <StatusPill finding={finding} />
                  <BasisBadge finding={finding} />
                  <CopyButton
                    label={`Copy row: ${finding.title}`}
                    onCopy={() => onCopy(findingToText(finding, filenameOf), "row")}
                  />
                </span>
              </th>
              {analysis.documents.map((doc) => {
                const source = sourceFor(finding, doc.documentId);
                return (
                  <td key={doc.documentId}>
                    {source?.value == null ? (
                      <span className="comparison__empty" aria-label="Not found">
                        —
                      </span>
                    ) : (
                      <span className="comparison__value">{source.value}</span>
                    )}
                    {source?.quote != null && <blockquote className="source__quote">{source.quote}</blockquote>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
