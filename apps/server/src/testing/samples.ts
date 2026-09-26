import { readFileSync } from "node:fs";
import request from "supertest";
import type { Express } from "express";
import { UploadDocumentsResponseSchema } from "@mdiw/shared";
import type { UploadDocumentsResponse } from "@mdiw/shared";

/** The three readable samples; `corrupt.pdf` is loaded separately as a rejection case. */
export const SAMPLE_FILES = ["application-form.txt", "bank-statement.csv", "licence.pdf"] as const;
export type SampleFile = (typeof SAMPLE_FILES)[number];

export function loadSample(name: SampleFile | "corrupt.pdf"): Buffer {
  return readFileSync(new URL(`./samples/${name}`, import.meta.url));
}

/** Uploads files through the real HTTP route and returns the parsed response. */
export async function uploadFiles(
  app: Express,
  files: readonly { name: string; bytes: Buffer | Uint8Array }[],
): Promise<UploadDocumentsResponse> {
  let req = request(app).post("/api/documents");
  for (const f of files) req = req.attach("files", Buffer.from(f.bytes), f.name);
  const res = await req;
  return UploadDocumentsResponseSchema.parse(res.body);
}

/** Uploads the three sample documents and returns their ids by filename. */
export async function uploadSamples(app: Express): Promise<Record<SampleFile, string>> {
  const body = await uploadFiles(app, SAMPLE_FILES.map((name) => ({ name, bytes: loadSample(name) })));
  const ids: Partial<Record<SampleFile, string>> = {};
  for (const r of body.results) {
    if (r.status !== "ok") throw new Error(`sample ${r.filename} was rejected: ${r.reason}`);
    const name = SAMPLE_FILES.find((n) => n === r.filename);
    if (name) ids[name] = r.document.id;
  }
  const { "application-form.txt": form, "bank-statement.csv": bank, "licence.pdf": licence } = ids;
  if (!form || !bank || !licence) throw new Error("not all samples uploaded");
  return { "application-form.txt": form, "bank-statement.csv": bank, "licence.pdf": licence };
}
