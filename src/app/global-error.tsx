"use client";

import { useEffect } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { StatusPage } from "@/components/status/status-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { fontClassName } from "@/lib/fonts";
import { cn } from "@/lib/utils";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error.digest ?? error.name);
  }, [error]);

  return (
    <html lang="en" className={`${fontClassName} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <StatusPage
          title="This page couldn’t load"
          body="Something went wrong on our side. Try again, or go back home if the problem continues."
          logo={
            <a
              href="/en"
              className="inline-flex w-fit transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Yuzu Immigration"
            >
              <BrandLogo href={null} size="sm" />
            </a>
          }
          actions={
            <>
              <Button type="button" onClick={reset}>
                Try again
              </Button>
              <a href="/en" className={cn(buttonVariants({ variant: "outline" }))}>
                Back to home
              </a>
            </>
          }
          footer={
            error.digest ? (
              <p className="text-xs text-muted-foreground">
                Reference: {error.digest}
              </p>
            ) : null
          }
        />
      </body>
    </html>
  );
}
