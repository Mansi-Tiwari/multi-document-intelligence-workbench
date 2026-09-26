import type { DatabaseSync } from "node:sqlite";
import { AnalysisSchema, type Analysis, type AnalysisSummary, type FindingSource } from "@mdiw/shared";
import type { AnalysisRepository } from "../../ports/AnalysisRepository";
import { withTransaction } from "./database";
import {
  AnalysisDocumentRowSchema,
  AnalysisFieldRowSchema,
  AnalysisRowSchema,
  AnalysisSummaryRowSchema,
  FindingRowSchema,
  FindingSourceRowSchema,
} from "./rows";

export class SqliteAnalysisRepository implements AnalysisRepository {
  constructor(private readonly db: DatabaseSync) {}

  save(input: Analysis): void {
    // Enforces what SQLite can't: source counts per scope, fieldKey rules, sources ⊆ documents.
    const analysis = AnalysisSchema.parse(input);
    const { db } = this;

    withTransaction(db, () => {
      db.prepare("INSERT INTO analyses (id, instruction, provider, model, created_at) VALUES (?, ?, ?, ?, ?)").run(
        analysis.id,
        analysis.instruction,
        analysis.provider,
        analysis.model,
        analysis.createdAt,
      );

      const insertField = db.prepare(
        "INSERT INTO analysis_fields (analysis_id, position, key, description) VALUES (?, ?, ?, ?)",
      );
      analysis.fields.forEach((field, position) => {
        insertField.run(analysis.id, position, field.key, field.description);
      });

      const insertDocument = db.prepare(
        `INSERT INTO analysis_documents (analysis_id, document_id, position, filename, summary, relevance)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      analysis.documents.forEach((doc, position) => {
        insertDocument.run(analysis.id, doc.documentId, position, doc.filename, doc.summary, doc.relevance);
      });

      const insertFinding = db.prepare(
        `INSERT INTO findings (id, analysis_id, position, scope, kind, field_key, title, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertSource = db.prepare(
        `INSERT INTO finding_sources (finding_id, analysis_id, document_id, position, value, quote)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      analysis.findings.forEach((finding, position) => {
        insertFinding.run(
          finding.id,
          analysis.id,
          position,
          finding.scope,
          finding.kind,
          finding.fieldKey,
          finding.title,
          finding.detail,
        );
        finding.sources.forEach((source, sourcePosition) => {
          insertSource.run(finding.id, analysis.id, source.documentId, sourcePosition, source.value, source.quote);
        });
      });
    });
  }

  findById(id: string): Analysis | null {
    const { db } = this;
    const analysisRow = db
      .prepare("SELECT id, instruction, provider, model, created_at FROM analyses WHERE id = ?")
      .get(id);
    if (analysisRow === undefined) return null;
    const header = AnalysisRowSchema.parse(analysisRow);

    const fields = db
      .prepare("SELECT key, description FROM analysis_fields WHERE analysis_id = ? ORDER BY position")
      .all(id)
      .map((row) => AnalysisFieldRowSchema.parse(row));

    const documents = db
      .prepare(
        `SELECT document_id, filename, summary, relevance
         FROM analysis_documents WHERE analysis_id = ? ORDER BY position`,
      )
      .all(id)
      .map((row) => AnalysisDocumentRowSchema.parse(row));

    const sourcesByFinding = new Map<string, FindingSource[]>();
    db.prepare(
      `SELECT finding_id, document_id, value, quote
       FROM finding_sources WHERE analysis_id = ? ORDER BY finding_id, position`,
    )
      .all(id)
      .forEach((row) => {
        const { findingId, source } = FindingSourceRowSchema.parse(row);
        const list = sourcesByFinding.get(findingId);
        if (list === undefined) sourcesByFinding.set(findingId, [source]);
        else list.push(source);
      });

    const findings = db
      .prepare(
        `SELECT id, scope, kind, field_key, title, detail
         FROM findings WHERE analysis_id = ? ORDER BY position`,
      )
      .all(id)
      .map((row) => {
        const finding = FindingRowSchema.parse(row);
        return { ...finding, sources: sourcesByFinding.get(finding.id) ?? [] };
      });

    // Validate the reassembled aggregate so corrupt rows never become domain objects.
    return AnalysisSchema.parse({ ...header, fields, documents, findings });
  }

  list(): AnalysisSummary[] {
    return this.db
      .prepare(
        `SELECT a.id, a.instruction, a.provider, a.model, a.created_at,
           (SELECT COUNT(*) FROM analysis_documents d WHERE d.analysis_id = a.id) AS document_count,
           (SELECT COUNT(*) FROM findings f WHERE f.analysis_id = a.id) AS finding_count
         FROM analyses a
         ORDER BY a.created_at DESC, a.rowid DESC`,
      )
      .all()
      .map((row) => AnalysisSummaryRowSchema.parse(row));
  }
}
