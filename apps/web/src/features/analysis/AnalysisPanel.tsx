import { useState } from "react";
import type { CreateAnalysisRequest, CreateAnalysisResponse, DocumentSummary } from "@mdiw/shared";
import { createAnalysis } from "../../api/analyses";
import { ErrorBanner } from "../../components/ErrorBanner";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { AnalysisEmptyState } from "./AnalysisEmptyState";
import { InstructionForm } from "./InstructionForm";
import { ResultsView } from "./ResultsView";

interface AnalysisPanelProps {
  selected: readonly DocumentSummary[];
  onDeselect: (documentId: string) => void;
}

const analyze = (signal: AbortSignal, request: CreateAnalysisRequest) => createAnalysis(request, signal);

export function AnalysisPanel({ selected, onDeselect }: AnalysisPanelProps) {
  const { state, run, reset } = useAsyncAction(analyze);
  const [result, setResult] = useState<{ id: string; response: CreateAnalysisResponse } | null>(null);

  const submit = async (request: CreateAnalysisRequest) => {
    const response = await run(request);
    if (response !== undefined) setResult({ id: response.analysis.id, response });
  };

  return (
    <section className="panel" aria-labelledby="analysis-heading">
      <h2 className="panel__title" id="analysis-heading">
        Analysis
      </h2>
      <InstructionForm
        selected={selected}
        pending={state.status === "pending"}
        onDeselect={onDeselect}
        onSubmit={(request) => void submit(request)}
      />
      {state.status === "error" && state.error.code !== "ABORTED" && (
        <ErrorBanner error={state.error} onDismiss={reset} />
      )}
      {result === null ? <AnalysisEmptyState /> : <ResultsView key={result.id} result={result.response} />}
    </section>
  );
}
