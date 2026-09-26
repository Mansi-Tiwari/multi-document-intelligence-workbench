const SECTIONS = [
  ["Per-document summaries", "What each document says about your instruction, with a relevance score."],
  ["Comparison", "A table with one row per requested field and one column per document."],
  ["Discrepancies", "Fields whose values differ between documents."],
  ["Missing info", "Fields some documents mention and others don't."],
  ["Key document", "The document most relevant to your instruction, and why."],
  ["Key facts", "Important facts from each document, each with its source and quote."],
] as const;

export function AnalysisEmptyState() {
  return (
    <div className="empty-state">
      <h3 className="subheading">What you'll get</h3>
      <p className="empty-state__lead">Select documents and write an instruction. Results appear here:</p>
      <dl className="empty-state__list">
        {SECTIONS.map(([term, description]) => (
          <div key={term} className="empty-state__item">
            <dt>{term}</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
