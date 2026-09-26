import { useState } from "react";
import { summarizeAnalysis } from "@mdiw/shared";
import type { CreateAnalysisResponse, Finding } from "@mdiw/shared";
import { CopyButton } from "../../components/CopyButton";
import { useCopy } from "../../hooks/useCopy";
import { ComparisonTable } from "./ComparisonTable";
import { comparisonToMarkdown, factsToText, findingsToText, overviewToText } from "./copyText";
import type { CopyFn } from "./FindingCard";
import { FindingCard } from "./FindingCard";
import type { FilenameOf, ResultTabId } from "./findings";
import { RESULT_TABS, filenameLookup, groupFindings, skippedLabel, tabCounts } from "./findings";
import { SummaryOverview } from "./SummaryOverview";
import { ResultTabs } from "./ResultTabs";

function SkippedNotice({ skipped }: { skipped: CreateAnalysisResponse["skipped"] }) {
  if (skipped.length === 0) return null;
  return (
    <div className="notice notice--warn" role="note">
      <p className="notice__title">
        Skipped {skipped.length} {skipped.length === 1 ? "file" : "files"}
      </p>
      <ul className="notice__list">
        {skipped.map((item) => (
          <li key={item.documentId}>
            <span className="source__file">{skippedLabel(item)}</span>: {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabToolbar({ description, onCopyAll, copyLabel }: { description: string; onCopyAll?: () => Promise<boolean>; copyLabel: string }) {
  return (
    <div className="tab-toolbar">
      <p className="tab-toolbar__desc">{description}</p>
      {onCopyAll !== undefined && <CopyButton label={copyLabel} text="Copy all" onCopy={onCopyAll} />}
    </div>
  );
}

function FindingList({
  findings,
  filenameOf,
  onCopy,
  empty,
  showValues = true,
}: {
  findings: readonly Finding[];
  filenameOf: FilenameOf;
  onCopy: CopyFn;
  empty: string;
  showValues?: boolean;
}) {
  if (findings.length === 0) return <p className="empty-note">{empty}</p>;
  return (
    <div className="finding-list">
      {findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} filenameOf={filenameOf} onCopy={onCopy} showValues={showValues} />
      ))}
    </div>
  );
}

/** The analysis result: skipped files, then tabbed views over the findings. */
export function ResultsView({ result }: { result: CreateAnalysisResponse }) {
  const [tab, setTab] = useState<ResultTabId>("summary");
  const { copy, message } = useCopy();
  const { analysis, skipped } = result;
  const grouped = groupFindings(analysis);
  const counts = tabCounts(analysis, grouped);
  const filenameOf = filenameLookup(analysis);
  const tabs = RESULT_TABS.map((t) => ({ ...t, count: counts[t.id] }));
  const overview = summarizeAnalysis(analysis, skipped);

  let panel;
  switch (tab) {
    case "summary":
      panel = (
        <>
          <TabToolbar
            description="A plain-language answer, then what each document says."
            copyLabel="Copy summary"
            onCopyAll={() => copy(overviewToText(analysis.instruction, overview), "summary")}
          />
          <SummaryOverview overview={overview} />
        </>
      );
      break;
    case "comparison":
      panel = (
        <>
          <TabToolbar
            description="One row per field, one column per document."
            copyLabel="Copy comparison table as Markdown"
            {...(grouped.comparison.length > 0
              ? { onCopyAll: () => copy(comparisonToMarkdown(analysis, grouped.comparison), "comparison table") }
              : {})}
          />
          {grouped.comparison.length === 0 ? (
            <p className="empty-note">No fields were compared.</p>
          ) : (
            <ComparisonTable analysis={analysis} comparisons={grouped.comparison} filenameOf={filenameOf} onCopy={copy} />
          )}
        </>
      );
      break;
    case "discrepancies":
      panel = (
        <>
          <TabToolbar
            description="Fields with different values in different documents."
            copyLabel="Copy all discrepancies"
            {...(grouped.discrepancies.length > 0
              ? { onCopyAll: () => copy(findingsToText(grouped.discrepancies, filenameOf), "discrepancies") }
              : {})}
          />
          <FindingList findings={grouped.discrepancies} filenameOf={filenameOf} onCopy={copy} empty="No discrepancies found." />
        </>
      );
      break;
    case "missing":
      panel = (
        <>
          <TabToolbar
            description="Fields that some or all documents don't mention. Listed files lack the field."
            copyLabel="Copy all missing info"
            {...(grouped.missing.length > 0
              ? { onCopyAll: () => copy(findingsToText(grouped.missing, filenameOf), "missing info") }
              : {})}
          />
          <FindingList
            findings={grouped.missing}
            filenameOf={filenameOf}
            onCopy={copy}
            showValues={false}
            empty="Every field was found in every document."
          />
        </>
      );
      break;
    case "facts":
      panel = (
        <>
          <TabToolbar
            description="Requested field values and key facts, grouped by document."
            copyLabel="Copy all key facts"
            {...(counts.facts > 0 ? { onCopyAll: () => copy(factsToText(grouped.factsByDocument, filenameOf), "key facts") } : {})}
          />
          {grouped.factsByDocument.map((group) => (
            <section key={group.document.documentId} className="fact-group" aria-label={group.document.filename}>
              <h4 className="fact-group__title">{group.document.filename}</h4>
              <FindingList
                findings={group.findings}
                filenameOf={filenameOf}
                onCopy={copy}
                empty="No facts or field values found in this document."
              />
            </section>
          ))}
        </>
      );
      break;
  }

  return (
    <section className="results" aria-label="Analysis results">
      <p className="results__meta">
        {analysis.provider === "mock" ? "Mock provider" : "Anthropic"} · {analysis.model} ·{" "}
        {new Date(analysis.createdAt).toLocaleString()}
      </p>
      <SkippedNotice skipped={skipped} />
      <ResultTabs tabs={tabs} active={tab} onChange={setTab} label="Analysis results">
        {panel}
      </ResultTabs>
      <p className="live-note" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
