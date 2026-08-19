import { MAX_SIGNATURE_IMAGE_CHARS } from "@/lib/contracts/types";

export async function fileToSignaturePngDataUrl(file: File): Promise<string> {
  const type = file.type.toLowerCase();
  if (type && !type.startsWith("image/")) {
    throw new Error("invalid_signature");
  }
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (width < 8 || height < 8) throw new Error("invalid_signature");
    const maxWidth = 640;
    if (width > maxWidth) {
      height = Math.max(1, Math.round((height * maxWidth) / width));
      width = maxWidth;
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("invalid_signature");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length <= MAX_SIGNATURE_IMAGE_CHARS) return dataUrl;
      width = Math.max(80, Math.round(width * 0.75));
      height = Math.max(32, Math.round(height * 0.75));
    }
    throw new Error("invalid_signature");
  } finally {
    bitmap.close();
  }
}
