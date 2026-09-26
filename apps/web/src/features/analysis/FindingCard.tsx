import type { Finding } from "@mdiw/shared";
import { Badge } from "../../components/Badge";
import { CopyButton } from "../../components/CopyButton";
import { findingToText } from "./copyText";
import type { FilenameOf } from "./findings";
import { basisOf } from "./findings";

export type CopyFn = (text: string, what: string) => Promise<boolean>;

export function BasisBadge({ finding }: { finding: Finding }) {
  const basis = basisOf(finding);
  return (
    <Badge tone={basis.label === "Fact" ? "ok" : "info"} title={basis.description}>
      <span aria-hidden="true">{basis.label}</span>
      <span className="visually-hidden">{basis.description}</span>
    </Badge>
  );
}

interface FindingCardProps {
  finding: Finding;
  filenameOf: FilenameOf;
  onCopy: CopyFn;
  /** Hide the per-source value (e.g. "missing info" sources never have one). */
  showValues?: boolean;
  highlight?: boolean;
}

/** One finding: title, Fact/AI basis, detail, and every source file with its value and quote. */
export function FindingCard({ finding, filenameOf, onCopy, showValues = true, highlight = false }: FindingCardProps) {
  const showDetail = finding.detail !== null && finding.detail !== finding.title && finding.kind !== "field_value";
  return (
    <article className={`finding${highlight ? " finding--highlight" : ""}`}>
      <header className="finding__header">
        <h4 className="finding__title">{finding.title}</h4>
        <div className="finding__tools">
          <BasisBadge finding={finding} />
          <CopyButton
            label={`Copy finding: ${finding.title}`}
            onCopy={() => onCopy(findingToText(finding, filenameOf), "finding")}
          />
        </div>
      </header>
      {showDetail && <p className="finding__detail">{finding.detail}</p>}
      <ul className="sources" aria-label="Sources">
        {finding.sources.map((source) => (
          <li key={source.documentId} className="source">
            <p className="source__line">
              <span className="source__file">{filenameOf(source.documentId)}</span>
              {showValues && source.value !== null && (
                <>
                  {": "}
                  <span className="source__value">{source.value}</span>
                </>
              )}
            </p>
            {source.quote !== null && <blockquote className="source__quote">{source.quote}</blockquote>}
          </li>
        ))}
      </ul>
    </article>
  );
}
