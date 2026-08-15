"use client";

import { useEffect } from "react";

export default function ShareFillError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Share fill route error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
      <h1 className="font-heading text-2xl font-semibold text-brand">
        This page couldn&apos;t load
      </h1>
      <p className="text-[15px] text-muted-foreground">
        A server error occurred. Reload to try again, or contact your
        consultant if the problem continues.
      </p>
      <button
        type="button"
        onClick={reset}
        className="text-sm font-medium text-action hover:underline"
      >
        Reload
      </button>
    </div>
  );
}
