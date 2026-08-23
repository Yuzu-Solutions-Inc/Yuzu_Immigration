"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

export function ListLoadMore({
  hasMore,
  loading,
  onLoadMore,
  loadMoreLabel,
  loadingLabel,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  loadMoreLabel: string;
  loadingLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = ref.current;
    if (!el) return;
    const scrollRoot = el.closest("[data-list-scroll]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      {
        root: scrollRoot instanceof Element ? scrollRoot : null,
        rootMargin: "240px",
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="flex justify-center py-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={onLoadMore}
      >
        {loading ? loadingLabel : loadMoreLabel}
      </Button>
    </div>
  );
}
