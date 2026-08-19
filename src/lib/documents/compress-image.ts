import { guessMimeFromFilename } from "@/lib/documents/catalog";

/** Skip photos that are already small enough to store as-is. */
export const IMAGE_COMPRESS_SKIP_BYTES = 400 * 1024;

/** Long-edge cap after resize (px). IRCC scans stay readable well below this. */
export const IMAGE_COMPRESS_MAX_EDGE = 2500;

const OUTPUT_TYPE = "image/jpeg";
const QUALITY = 0.8;
const QUALITY_LOW = 0.7;
const RETRY_BYTES = 2.5 * 1024 * 1024;

const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function jpegFilename(name: string): string {
  const trimmed = name.trim() || "document";
  const base = trimmed.replace(/\.[^.]+$/u, "").trim() || "document";
  return `${base}.jpg`;
}

export function isCompressibleClientImage(file: File): boolean {
  const mime = file.type || guessMimeFromFilename(file.name) || "";
  return COMPRESSIBLE_TYPES.has(mime);
}

export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) {
    return { width, height };
  }
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("toBlob_failed"));
          return;
        }
        resolve(blob);
      },
      OUTPUT_TYPE,
      quality,
    );
  });
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return await createImageBitmap(file);
  }
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Shrink camera photos in the browser before encryption. PDFs, tiny files,
 * and HEIC that the browser cannot decode are returned unchanged.
 */
export async function compressClientDocument(file: File): Promise<File> {
  if (file.size <= IMAGE_COMPRESS_SKIP_BYTES) return file;
  if (!isCompressibleClientImage(file)) return file;
  if (
    typeof document === "undefined" ||
    typeof createImageBitmap !== "function"
  ) {
    return file;
  }

  try {
    const bitmap = await decodeBitmap(file);
    try {
      const { width, height } = scaleToMaxEdge(
        bitmap.width,
        bitmap.height,
        IMAGE_COMPRESS_MAX_EDGE,
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;

      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      let blob = await canvasToJpeg(canvas, QUALITY);
      if (blob.size > RETRY_BYTES) {
        blob = await canvasToJpeg(canvas, QUALITY_LOW);
      }
      releaseCanvas(canvas);

      if (blob.size >= file.size) return file;

      return new File([blob], jpegFilename(file.name), {
        type: OUTPUT_TYPE,
        lastModified: Date.now(),
      });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
