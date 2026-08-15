"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  reviewDocumentRequestAction,
  type DocumentsActionState,
} from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const initial: DocumentsActionState = {};

export function DocumentReviewActions({
  requestId,
  projectId,
  locale,
  canReview,
}: {
  requestId: string;
  projectId: string;
  locale: string;
  canReview: boolean;
}) {
  const t = useTranslations("documents");
  const [denyOpen, setDenyOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [state, action, pending] = useActionState(
    reviewDocumentRequestAction,
    initial,
  );

  useEffect(() => {
    if (state.message === "reviewed") {
      setDenyOpen(false);
      setComment("");
    }
  }, [state.message]);

  if (!canReview) return null;

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      comment_required: t("review.commentRequired"),
      not_reviewable: t("review.notReviewable"),
      email_failed: t("review.emailFailed"),
      review_failed: t("review.failed"),
      unauthorized: t("errors.generic"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5">
        <form action={action} className="contents">
          <input type="hidden" name="requestId" value={requestId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {t("review.approve")}
          </Button>
        </form>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setComment("");
            setDenyOpen(true);
          }}
        >
          {t("review.deny")}
        </Button>
      </div>

      <Dialog open={denyOpen} onOpenChange={setDenyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("review.denyTitle")}</DialogTitle>
            <DialogDescription>{t("review.denyHelp")}</DialogDescription>
          </DialogHeader>
          <form action={action} className="space-y-4">
            <input type="hidden" name="requestId" value={requestId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="decision" value="deny" />
            <Textarea
              name="comment"
              required
              minLength={1}
              maxLength={1000}
              rows={4}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t("review.commentPlaceholder")}
              aria-label={t("review.commentLabel")}
            />
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDenyOpen(false)}
                disabled={pending}
              >
                {t("review.cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending || comment.trim().length === 0}
              >
                {pending ? t("review.denying") : t("review.confirmDeny")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
