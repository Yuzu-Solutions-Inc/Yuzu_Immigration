export const LIST_PAGE_SIZE = 50;
export const LIST_SCAN_CHUNK = 1000;
export const LIST_IN_FILTER_CAP = 200;
/** Runaway guard for decrypt-scan loops if `.range()` is ignored. */
export const LIST_SCAN_MAX_ROWS = 1_000_000;

export type ListPage<T> = {
  items: T[];
  total: number;
};

export function emptyListPage<T>(): ListPage<T> {
  return { items: [], total: 0 };
}

export function clampListOffset(offset: number | undefined) {
  if (offset == null || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.floor(offset);
}

export async function fetchAllInChunks<T>(
  fetchChunk: (
    from: number,
    to: number,
  ) => Promise<{ rows: T[]; error: string | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const to = from + LIST_SCAN_CHUNK - 1;
    const { rows: chunk, error } = await fetchChunk(from, to);
    if (error) return { rows: [], error };
    if (chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < LIST_SCAN_CHUNK) break;
    if (rows.length >= LIST_SCAN_MAX_ROWS) {
      console.error("fetchAllInChunks: hit LIST_SCAN_MAX_ROWS");
      break;
    }
    from += LIST_SCAN_CHUNK;
  }
  return { rows, error: null };
}

export function clampListLimit(limit: number | undefined) {
  if (limit == null || !Number.isFinite(limit)) return LIST_PAGE_SIZE;
  return Math.min(Math.max(1, Math.floor(limit)), 100);
}

export function listRange(offset: number, limit: number) {
  return { from: offset, to: offset + limit - 1 } as const;
}

export function sliceListPage<T>(
  rows: T[],
  offset: number,
  limit: number,
): ListPage<T> {
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
  };
}

export function compareNullableIsoDates(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

export function docsListPercent(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/** Narrow chain used to apply SQL filters without using `any`. */
export type ListFilterQuery = {
  eq: (column: string, value: unknown) => ListFilterQuery;
  is: (column: string, value: null) => ListFilterQuery;
  not: (column: string, operator: string, value: unknown) => ListFilterQuery;
  lt: (column: string, value: string) => ListFilterQuery;
  lte: (column: string, value: string) => ListFilterQuery;
  gte: (column: string, value: string) => ListFilterQuery;
  in: (column: string, values: readonly string[]) => ListFilterQuery;
};

export function asListFilterQuery(query: object): ListFilterQuery {
  return query as ListFilterQuery;
}
