"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { TOUR_OPEN_NAV_EVENT, type TourStep } from "@/lib/onboarding/tour";
import { cn } from "@/lib/utils";

const PAD = 8;

function pathMatches(pathname: string, route: string) {
  if (route === "/home") {
    return pathname === "/home" || pathname === "/";
  }
  return pathname === route || pathname.startsWith(`${route}/`);
}

function findVisibleTourTarget(target: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(
    `[data-tour="${CSS.escape(target)}"]`,
  );
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) return el;
  }
  return null;
}

function needsNavDrawer(target: string) {
  if (target === "nav-settings" || target === "nav-payments") return false;
  return target.startsWith("nav-") || target.startsWith("new-");
}

export function ProductTour({
  steps,
  onFinish,
  onSkip,
}: {
  steps: TourStep[];
  onFinish: () => void;
  onSkip: () => void;
}) {
  const t = useTranslations("tour");
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const askedNav = useRef<string | null>(null);
  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = findVisibleTourTarget(step.target);
    if (!el) {
      setRect(null);
      if (needsNavDrawer(step.target) && askedNav.current !== step.id) {
        askedNav.current = step.id;
        window.dispatchEvent(new Event(TOUR_OPEN_NAV_EVENT));
      }
      return;
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    setRect(el.getBoundingClientRect());
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    if (!pathMatches(pathname, step.route)) {
      router.push(step.route);
      return;
    }
    const id = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, pathname, measure, router]);

  useEffect(() => {
    if (!step?.clickTarget) return;
    const el = findVisibleTourTarget(step.target);
    if (!el) return;
    const onClick = () => {
      setIndex((current) => Math.min(current + 1, steps.length));
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [step, steps.length, rect]);

  useEffect(() => {
    if (!step) return;
    let tries = 0;
    let timer = 0;
    const tick = () => {
      if (findVisibleTourTarget(step.target)) {
        measure();
        return;
      }
      if (tries++ < 40) timer = window.setTimeout(tick, 50);
    };
    timer = window.setTimeout(tick, 30);
    return () => window.clearTimeout(timer);
  }, [step, measure]);

  useEffect(() => {
    if (index >= steps.length && steps.length > 0) onFinish();
  }, [index, steps.length, onFinish]);

  if (!step || steps.length === 0) return null;

  const hole = rect
    ? {
        top: Math.max(rect.top - PAD, 8),
        left: Math.max(rect.left - PAD, 8),
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  const tooltipStyle = hole
    ? {
        top: Math.min(hole.top + hole.height + 12, window.innerHeight - 220),
        left: Math.min(Math.max(hole.left, 16), window.innerWidth - 336),
      }
    : { top: 96, left: 24 };

  const last = index >= steps.length - 1;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      {hole ? (
        <>
          <div
            className="pointer-events-auto absolute bg-brand/50"
            style={{ top: 0, left: 0, right: 0, height: hole.top }}
            aria-hidden
          />
          <div
            className="pointer-events-auto absolute bg-brand/50"
            style={{
              top: hole.top,
              left: 0,
              width: hole.left,
              height: hole.height,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-auto absolute bg-brand/50"
            style={{
              top: hole.top,
              left: hole.left + hole.width,
              right: 0,
              height: hole.height,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-auto absolute bg-brand/50"
            style={{
              top: hole.top + hole.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute rounded-xl ring-2 ring-action"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
            aria-hidden
          />
        </>
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-brand/50" aria-hidden />
      )}

      <div
        className={cn(
          "pointer-events-auto absolute z-[61] w-[min(20rem,calc(100vw-2rem))] rounded-xl bg-surface p-4 shadow-elevated ring-1 ring-foreground/10",
        )}
        style={tooltipStyle}
      >
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("kicker", { current: index + 1, total: steps.length })}
        </p>
        <h2 id="tour-title" className="font-heading mt-1 text-base font-semibold text-brand">
          {t(`steps.${step.id}.title`)}
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {t(`steps.${step.id}.body`)}
        </p>
        {step.clickTarget ? (
          <p className="mt-2 text-sm font-medium text-action">{t("clickHint")}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
            >
              {t("back")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (last) onFinish();
                else setIndex((current) => current + 1);
              }}
            >
              {last ? t("done") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
