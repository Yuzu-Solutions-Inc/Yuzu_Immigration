import type { DocumentDocKey, ProgramFamily } from "@/db/schema";

/** Max plaintext size accepted for client document uploads (10 MiB). */
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type DocumentAllowedMime =
  (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number];

export const CLIENT_DOCUMENTS_BUCKET = "client-documents";

export type DefaultDocumentSeed = {
  docKey: Exclude<DocumentDocKey, "custom">;
  sortOrder: number;
  isRequired: boolean;
};

/**
 * Default per-person documents for every program family.
 * Program-specific extras can be layered later without changing the API.
 */
export function defaultDocumentsForProgram(
  _programFamily: ProgramFamily | string,
): DefaultDocumentSeed[] {
  return [
    { docKey: "passport", sortOrder: 10, isRequired: true },
    { docKey: "photo", sortOrder: 20, isRequired: true },
  ];
}

export function isAllowedDocumentMime(
  value: string,
): value is DocumentAllowedMime {
  return (DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

export function guessMimeFromFilename(name: string): DocumentAllowedMime | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return null;
}

export function sanitizeUploadFilename(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "document";
  return base.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
}
