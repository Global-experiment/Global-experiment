/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight at
 * once, preserving input order in the result. Used to preload Documentation
 * article bodies from Notion without firing one request per article at
 * once (client feedback item 16) — Notion's guidance is an average of ~3
 * requests/second, so a small worker pool is used instead of
 * `Promise.all`, which has no such limit.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
