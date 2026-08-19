"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  signContractPublicAction,
  type SignContractState,
} from "@/app/actions/sign-contract";
import { SignatureCapture, type SignatureCaptureKind } from "@/components/contracts/signature-capture";
import { Button } from "@/components/ui/button";
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
  const [kind, setKind] = useState<SignatureCaptureKind>("typed");
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

  const closed =
    payload.alreadySigned ||
    payload.completed ||
    payload.declined ||
    payload.expired ||
    payload.voided ||
    payload.waitingOnPrevious;

  const storedKind = kind === "typed" ? "typed" : "drawn";

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
          <input type="hidden" name="kind" value={storedKind} />
          <input type="hidden" name="image" value={image} />
          <input type="hidden" name="typedName" value={typedName} />
          <p className="text-sm font-medium">{t("signAs", { name: payload.signerName })}</p>
          <SignatureCapture
            kind={kind}
            onKindChange={setKind}
            typedName={typedName}
            onTypedNameChange={setTypedName}
            image={image}
            onImageChange={setImage}
            nameHint={t("legalNameHint")}
            onError={(key) => toast.error(t(`errors.${key}`))}
          />
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
