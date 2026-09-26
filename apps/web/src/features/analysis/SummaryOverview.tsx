import type { AnalysisOverview, RelevanceLevel } from "@mdiw/shared";
import { joinList } from "@mdiw/shared";

const RELEVANCE: Readonly<Record<RelevanceLevel, { label: string; tone: string }>> = {
  high: { label: "High relevance", tone: "badge--ok" },
  medium: { label: "Medium relevance", tone: "badge--warn" },
  low: { label: "Low relevance", tone: "badge--neutral" },
};

/** The Summary tab: a plain-language answer first, then the details that back it up. */
export function SummaryOverview({ overview }: { overview: AnalysisOverview }) {
  const single = overview.documents.length === 1;
  const { differences, missing, notFoundAnywhere, matches, keyDocument, documents } = overview;

  return (
    <div className="overview">
      <section className="overview__glance" aria-labelledby="glance-title">
        <h4 id="glance-title" className="overview__heading">At a glance</h4>
        <p className="overview__headline">{overview.headline}</p>
      </section>

      {differences.length > 0 && (
        <section className="overview__section" aria-labelledby="diff-title">
          <h4 id="diff-title" className="overview__heading">
            <span className="badge badge--error">Different</span> {differences.length === 1 ? "1 difference" : `${differences.length} differences`}
          </h4>
          <ul className="overview__list">
            {differences.map((d) => (
              <li key={d.fieldKey}>
                <strong>{d.label}</strong>
                <ul className="overview__values">
                  {d.values.map((v) => (
                    <li key={v.documentId}>
                      <span className="overview__value">{v.value}</span>{" "}
                      <span className="overview__file">in {v.filename}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="overview__section" aria-labelledby="missing-title">
          <h4 id="missing-title" className="overview__heading">
            <span className="badge badge--warn">Missing</span> Stated in some documents only
          </h4>
          <ul className="overview__list">
            {missing.map((m) => (
              <li key={m.fieldKey}>
                <strong>{m.label}</strong>: not in {joinList(m.missingFrom)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {matches.length > 0 && (
        <section className="overview__section" aria-labelledby="found-title">
          <h4 id="found-title" className="overview__heading">
            <span className="badge badge--ok">{single ? "Found" : "Agree"}</span>{" "}
            {single ? "In the document" : "Same wherever stated"}
          </h4>
          <ul className="overview__list">
            {matches.map((m) => (
              <li key={m.fieldKey}>
                <strong>{m.label}</strong>: <span className="overview__value">{m.value}</span>
                {!single && (
                  <span className="overview__file">
                    {" "}
                    ({m.foundIn} of {documents.length} documents)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notFoundAnywhere.length > 0 && (
        <section className="overview__section" aria-labelledby="none-title">
          <h4 id="none-title" className="overview__heading">
            <span className="badge badge--neutral">Not found</span> {single ? "Not in the document" : "Not in any document"}
          </h4>
          <p className="overview__plain">{joinList(notFoundAnywhere.map((n) => n.label))}</p>
        </section>
      )}

      {keyDocument !== null && !single && (
        <section className="overview__section overview__key" aria-labelledby="key-title">
          <h4 id="key-title" className="overview__heading">
            <span className="badge badge--info">AI</span> Key document: {keyDocument.filename}
          </h4>
          <p className="overview__plain">{keyDocument.reason}</p>
        </section>
      )}

      <section className="overview__section" aria-labelledby="docs-title">
        <h4 id="docs-title" className="overview__heading">{single ? "The document" : "Each document"}</h4>
        <ul className="doc-summaries">
          {documents.map((doc) => (
            <li key={doc.documentId} className="doc-summary">
              <div className="doc-summary__head">
                <h5 className="doc-summary__name">{doc.filename}</h5>
                <span className={`badge ${RELEVANCE[doc.relevanceLevel].tone}`}>{RELEVANCE[doc.relevanceLevel].label}</span>
              </div>
              {doc.pointsTotal > 0 && (
                <p className="doc-summary__meta">
                  {doc.pointsFound} of {doc.pointsTotal} requested points found
                </p>
              )}
              <p className="doc-summary__text">{doc.summary}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
