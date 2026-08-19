"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  signContractPublicAction,
  type SignContractState,
} from "@/app/actions/sign-contract";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PublicSignPayload } from "@/lib/contracts/sign";

const initialState: SignContractState = {};

export function SignContractForm({
  token,
  payload,
}: {
  token: string;
  payload: PublicSignPayload;
}) {
  const t = useTranslations("signContract");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [kind, setKind] = useState<"typed" | "drawn">("typed");
  const [typedName, setTypedName] = useState(payload.signerName);
  const [consent, setConsent] = useState(false);
  const [image, setImage] = useState("");
  const [state, formAction, pending] = useActionState(
    signContractPublicAction,
    initialState,
  );

  useEffect(() => {
    if (state.error) toast.error(t(`errors.${state.error}`));
    if (state.message === "declined") toast.message(t("declinedToast"));
  }, [state, t]);

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
    setImage(canvas.toDataURL("image/png"));
  }

  const closed =
    payload.alreadySigned ||
    payload.completed ||
    payload.declined ||
    payload.expired ||
    payload.voided ||
    payload.waitingOnPrevious;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {payload.organizationName}
        </p>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {payload.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("hashLabel")}: <span className="font-mono text-xs">{payload.filledSha256}</span>
        </p>
      </div>

      <article
        className="rounded-xl border border-border bg-surface px-6 py-5 text-sm leading-relaxed shadow-elevated [&_[data-sign]]:my-4 [&_[data-sign]]:rounded-xl [&_[data-sign]]:border [&_[data-sign]]:border-dashed [&_[data-sign]]:border-border [&_[data-sign]]:px-4 [&_[data-sign]]:py-6 [&_[data-sign]]:text-xs [&_[data-sign]]:text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: payload.filledHtml }}
      />

      {payload.waitingOnPrevious ? (
        <p className="text-sm text-muted-foreground">{t("waiting")}</p>
      ) : null}
      {payload.alreadySigned || payload.completed ? (
        <p className="text-sm text-muted-foreground">{t("alreadySigned")}</p>
      ) : null}
      {payload.expired ? (
        <p className="text-sm text-muted-foreground">{t("expired")}</p>
      ) : null}
      {payload.voided ? (
        <p className="text-sm text-muted-foreground">{t("voided")}</p>
      ) : null}
      {payload.declined ? (
        <p className="text-sm text-muted-foreground">{t("declined")}</p>
      ) : null}

      {state.message === "signed" || state.message === "completed" ? (
        <p className="text-sm text-muted-foreground">
          {state.message === "completed" ? t("completedThanks") : t("signedThanks")}
        </p>
      ) : null}

      {!closed && !state.message ? (
        <form action={formAction} className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="image" value={image} />
          <p className="text-sm font-medium">{t("signAs", { name: payload.signerName })}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={kind === "typed" ? "default" : "outline"}
              onClick={() => setKind("typed")}
            >
              {t("typeName")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={kind === "drawn" ? "default" : "outline"}
              onClick={() => setKind("drawn")}
            >
              {t("drawName")}
            </Button>
          </div>
          <Field>
            <FieldLabel htmlFor="typed-name" required>
              {t("legalName")}
            </FieldLabel>
            <Input
              id="typed-name"
              name="typedName"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
              required
              maxLength={120}
            />
            <FieldHint>{t("legalNameHint")}</FieldHint>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const canvas = canvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (!canvas || !ctx) return;
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  setImage("");
                }}
              >
                {t("clearDraw")}
              </Button>
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="consent"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-4 rounded border-input"
              required
            />
            <span>{t("consent")}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || !consent}>
              {pending ? t("signing") : t("sign")}
            </Button>
            <Button
              type="submit"
              name="decline"
              value="on"
              variant="outline"
              disabled={pending}
              formNoValidate
            >
              {t("decline")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
