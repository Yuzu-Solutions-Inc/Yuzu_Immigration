"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ListPage } from "@/lib/lists/pagination";

type Identified = { id: string };

export function usePagedList<T extends Identified>({
  initial,
  depsKey,
  fetchPage,
}: {
  initial: ListPage<T>;
  depsKey: string;
  fetchPage: (offset: number) => Promise<ListPage<T>>;
}) {
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);
  const skipFirstDeps = useRef(true);

  useEffect(() => {
    if (skipFirstDeps.current) {
      skipFirstDeps.current = false;
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setLoadingMore(false);
    void fetchPage(0)
      .then((page) => {
        if (id !== requestId.current) return;
        setItems(page.items);
        setTotal(page.total);
        setLoading(false);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });
  }, [depsKey, fetchPage]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    const offset = items.length;
    const id = ++requestId.current;
    setLoadingMore(true);
    void fetchPage(offset)
      .then((page) => {
        if (id !== requestId.current) return;
        setItems((prev) => {
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...page.items.filter((row) => !seen.has(row.id))];
        });
        setTotal(page.total);
        setLoadingMore(false);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setLoadingMore(false);
      });
  }, [fetchPage, hasMore, items.length, loading, loadingMore]);

  return { items, total, loading, loadingMore, hasMore, loadMore };
}
