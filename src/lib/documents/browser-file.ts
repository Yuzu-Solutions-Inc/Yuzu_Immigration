export type DocumentFilePayload = {
  base64: string;
  filename: string;
  contentType: string;
};

export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function base64ToBlob(base64: string, contentType: string): Blob {
  return new Blob([base64ToBytes(base64)], { type: contentType });
}

export function isBrowserPreviewable(contentType: string): boolean {
  return (
    contentType === "application/pdf" ||
    contentType === "image/jpeg" ||
    contentType === "image/png" ||
    contentType === "image/webp"
  );
}

export function triggerBrowserDownload(payload: DocumentFilePayload) {
  const blob = base64ToBlob(payload.base64, payload.contentType);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.filename;
  a.click();
  URL.revokeObjectURL(url);
}
