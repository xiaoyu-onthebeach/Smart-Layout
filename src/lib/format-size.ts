/** A banner size as shown in the UI: "600 × 500" (the multiplication sign, not the letter x). */
export function formatSize(width: number, height: number): string {
  return `${width} × ${height}`;
}

/** Normalizes a typed size search ("600 × 500", "600X500"…) to the "600x500" form sizes are
 * matched against. */
export function normalizeSizeQuery(query: string): string {
  return query.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, '');
}
