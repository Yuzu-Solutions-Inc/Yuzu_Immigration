"use client";

import { useEffect, useRef } from "react";

import { BrandMark } from "@/components/brand/brand-mark";

/** Mouse-tracked orbs and optional paper planes behind a dark band. */
export function HeroAtmosphere({ planes = true }: { planes?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const section = root?.closest("section");
    if (!root || !section) return;

    let frame = 0;
    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = section.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        root.style.setProperty("--lp-mx", x.toFixed(3));
        root.style.setProperty("--lp-my", y.toFixed(3));
      });
    };

    section.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      section.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="lp-atmosphere pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="lp-parallax lp-parallax-slow absolute inset-0">
        <div className="lp-orb lp-orb-indigo" />
        <div className="lp-orb lp-orb-emerald" />
        <div className="lp-orb lp-orb-amber" />
      </div>
      {planes ? (
        <div className="lp-parallax lp-parallax-fast absolute inset-0">
          <div className="lp-plane lp-plane-a">
            <BrandMark inverted className="size-10 sm:size-12" />
          </div>
          <div className="lp-plane lp-plane-b">
            <BrandMark inverted className="size-7 sm:size-8" />
          </div>
          <div className="lp-plane lp-plane-c">
            <BrandMark inverted className="size-5" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
