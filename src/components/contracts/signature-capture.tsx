"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fileToSignaturePngDataUrl } from "@/lib/contracts/signature-image";

export type SignatureCaptureKind = "typed" | "drawn" | "uploaded";

export function SignatureCapture({
  kind,
  onKindChange,
  typedName,
  onTypedNameChange,
  image,
  onImageChange,
  nameHint,
  onError,
}: {
  kind: SignatureCaptureKind;
  onKindChange: (kind: SignatureCaptureKind) => void;
  typedName: string;
  onTypedNameChange: (value: string) => void;
  image: string;
  onImageChange: (value: string) => void;
  nameHint?: string;
  onError?: (key: string) => void;
}) {
  const t = useTranslations("signContract");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function exportCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onImageChange(canvas.toDataURL("image/png"));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onImageChange("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={kind === "typed" ? "default" : "outline"}
          onClick={() => onKindChange("typed")}
        >
          {t("typeName")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === "drawn" ? "default" : "outline"}
          onClick={() => onKindChange("drawn")}
        >
          {t("drawName")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={kind === "uploaded" ? "default" : "outline"}
          onClick={() => onKindChange("uploaded")}
        >
          {t("uploadName")}
        </Button>
      </div>
      <Field>
        <FieldLabel htmlFor="signature-legal-name" required>
          {t("legalName")}
        </FieldLabel>
        <Input
          id="signature-legal-name"
          value={typedName}
          onChange={(event) => onTypedNameChange(event.target.value)}
          required
          maxLength={120}
        />
        {nameHint ? <FieldHint>{nameHint}</FieldHint> : null}
      </Field>
      {kind === "drawn" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("drawHint")}</p>
          <canvas
            ref={canvasRef}
            width={640}
            height={180}
            className="h-36 w-full touch-none rounded-xl border border-input bg-canvas"
            onPointerDown={(event) => {
              drawing.current = true;
              const ctx = canvasRef.current?.getContext("2d");
              if (!ctx) return;
              const { x, y } = point(event);
              ctx.strokeStyle = "#1f2a26";
              ctx.lineWidth = 2.2;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(x, y);
            }}
            onPointerMove={(event) => {
              if (!drawing.current) return;
              const ctx = canvasRef.current?.getContext("2d");
              if (!ctx) return;
              const { x, y } = point(event);
              ctx.lineTo(x, y);
              ctx.stroke();
            }}
            onPointerUp={() => {
              drawing.current = false;
              exportCanvas();
            }}
            onPointerLeave={() => {
              drawing.current = false;
              exportCanvas();
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
            {t("clearDraw")}
          </Button>
        </div>
      ) : null}
      {kind === "uploaded" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("uploadHint")}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="hidden"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              try {
                onImageChange(await fileToSignaturePngDataUrl(file));
              } catch {
                onError?.("invalid_signature");
              }
            }}
          />
          {image ? (
            <img
              src={image}
              alt=""
              className="h-24 max-w-full rounded-xl border border-border bg-canvas object-contain px-3 py-2"
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              {t("uploadName")}
            </Button>
            {image ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onImageChange("")}
              >
                {t("clearDraw")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
