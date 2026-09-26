import type {
  Analysis,
  AnalysisSummary,
  CreateAnalysisRequest,
  CreateAnalysisResponse,
  SkippedDocument,
} from "@mdiw/shared";
import { buildFindings, findUnverifiedQuotes } from "../domain/crossDocument";
import type { DocumentResult } from "../domain/crossDocument";
import type { StoredDocument } from "../domain/document";
import { LlmError, NotFoundError, NothingToAnalyzeError } from "../domain/errors";
import type { AnalysisRepository } from "../ports/AnalysisRepository";
import type { DocumentRepository } from "../ports/DocumentRepository";
import type { LlmProvider } from "../ports/LlmProvider";
import { mapWithConcurrency } from "./concurrency";

export interface AnalysisServiceDeps {
  documents: DocumentRepository;
  analyses: AnalysisRepository;
  llm: LlmProvider;
  newId: () => string;
  now: () => Date;
  /** Max documents analysed in parallel (each in its own LLM call). */
  concurrency: number;
}

type PerDocument =
  | { ok: true; result: DocumentResult }
  | { ok: false; skipped: SkippedDocument };

/**
 * Synchronous analysis:
 * 1. load the requested documents (unknown ids are skipped as `not_found`);
 * 2. plan fields from the instruction ALONE;
 * 3. analyse every document in its OWN LLM call (never merged into one prompt);
 *    a document whose call fails, or whose quotes can't be found in its own text,
 *    is skipped as `analysis_failed` instead of failing the whole request;
 * 4. compare the validated per-document results in pure domain code;
 * 5. save everything in one transaction.
 */
export class AnalysisService {
  constructor(private readonly deps: AnalysisServiceDeps) {}

  async create(request: CreateAnalysisRequest): Promise<CreateAnalysisResponse> {
    const { instruction, documentIds } = request;
    const found = this.deps.documents.findManyByIds(documentIds);
    const foundIds = new Set(found.map((d) => d.id));
    const notFound: SkippedDocument[] = documentIds
      .filter((id) => !foundIds.has(id))
      .map((documentId) => ({
        documentId,
        filename: null,
        reason: "not_found",
        message: "Document not found. Only files uploaded with status ok can be analysed.",
      }));

    if (found.length === 0) throw nothingToAnalyze(notFound);

    const fields = await this.deps.llm.planFields({ instruction });

    const perDocument = await mapWithConcurrency(found, this.deps.concurrency, (doc) =>
      this.analyzeOne(doc, instruction, fields),
    );

    const results = perDocument.flatMap((p) => (p.ok ? [p.result] : []));
    const failed = perDocument.flatMap((p) => (p.ok ? [] : [p.skipped]));
    const skippedById = new Map([...notFound, ...failed].map((s) => [s.documentId, s]));
    const skipped = documentIds.flatMap((id) => {
      const s = skippedById.get(id);
      return s ? [s] : [];
    });

    if (results.length === 0) throw nothingToAnalyze(skipped);

    const analysis: Analysis = {
      id: this.deps.newId(),
      instruction,
      provider: this.deps.llm.name,
      model: this.deps.llm.model,
      createdAt: this.deps.now().toISOString(),
      fields,
      documents: results.map((r) => ({
        documentId: r.documentId,
        filename: r.filename,
        summary: r.summary,
        relevance: r.relevance,
      })),
      findings: buildFindings(fields, results, this.deps.newId),
    };
    this.deps.analyses.save(analysis);
    return { analysis, skipped };
  }

  get(id: string): Analysis {
    const analysis = this.deps.analyses.findById(id);
    if (analysis === null) throw new NotFoundError("Analysis not found.");
    return analysis;
  }

  list(): AnalysisSummary[] {
    return this.deps.analyses.list();
  }

  private async analyzeOne(
    doc: StoredDocument,
    instruction: string,
    fields: Analysis["fields"],
  ): Promise<PerDocument> {
    const failed = (message: string): PerDocument => ({
      ok: false,
      skipped: { documentId: doc.id, filename: doc.filename, reason: "analysis_failed", message },
    });

    let output;
    try {
      output = await this.deps.llm.analyzeDocument({
        instruction,
        fields,
        document: { id: doc.id, filename: doc.filename, kind: doc.kind, text: doc.text },
      });
    } catch (error) {
      if (error instanceof LlmError) return failed(error.message);
      throw error;
    }

    const result: DocumentResult = {
      documentId: doc.id,
      filename: doc.filename,
      summary: output.summary,
      relevance: output.relevance,
      fields: output.fields,
      keyFacts: output.keyFacts,
    };

    // Defense in depth: providers already reject fabricated quotes, but the service
    // guarantees it regardless of the provider implementation.
    const unverified = findUnverifiedQuotes(result, doc.text);
    if (unverified.length > 0) {
      return failed(`The AI quoted text that does not appear in this document (${unverified.length} quote(s)).`);
    }
    return { ok: true, result };
  }
}

function nothingToAnalyze(skipped: readonly SkippedDocument[]): NothingToAnalyzeError {
  return new NothingToAnalyzeError(
    "None of the selected documents could be analysed.",
    skipped.map((s) => ({ path: `documentIds.${s.documentId}`, message: `${s.filename ?? s.documentId}: ${s.message}` })),
  );
}
