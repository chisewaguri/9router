// One formatting vocabulary for every usage surface. Dashboards must agree on
// units and precision, or the same number reads as two different numbers.

/** Exact integer with thousands separators. */
export function fmtInt(n) {
  return new Intl.NumberFormat().format(Math.round(Number(n) || 0));
}

/**
 * Compact magnitude for scan-heavy columns: 210823 → "211K".
 * Precision loosens as the number grows so digits stay meaningful.
 */
export function fmtCompact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs < 1000) return fmtInt(v);
  for (const [size, suffix] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]]) {
    if (abs >= size) {
      const scaled = v / size;
      const scaledAbs = Math.abs(scaled);
      const decimals = scaledAbs < 10 ? 2 : scaledAbs < 100 ? 1 : 0;
      return `${scaled.toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")}${suffix}`;
    }
  }
  return fmtInt(v);
}

/** Cost with precision that survives sub-cent spend. */
export function fmtCost(n) {
  const v = Number(n) || 0;
  if (v === 0) return "$0";
  const abs = Math.abs(v);
  if (abs >= 1) return `$${v.toFixed(2)}`;
  if (abs >= 0.01) return `$${v.toFixed(3)}`;
  if (abs >= 0.0001) return `$${v.toFixed(4)}`;
  return "<$0.0001";
}

/** Duration across ms/s/min without losing the unit. */
export function fmtMs(ms) {
  const v = Number(ms) || 0;
  if (v <= 0) return "—";
  if (v < 1000) return `${Math.round(v)} ms`;
  if (v < 60000) return `${(v / 1000).toFixed(1)} s`;
  const mins = Math.floor(v / 60000);
  const secs = Math.round((v % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Generation throughput. Measured against decode time (total minus
 * time-to-first-token) so a slow first token does not masquerade as slow output.
 * Returns null when the sample cannot support a rate.
 */
export function computeTps(completionTokens, durationMs, ttftMs) {
  const out = Number(completionTokens) || 0;
  const total = Number(durationMs) || 0;
  if (!out || !total) return null;
  const decodeMs = Math.max(1, total - (Number(ttftMs) || 0));
  return out / (decodeMs / 1000);
}

/** Numeric form of a throughput rate; unit lives in the column header. */
export function fmtTps(tps) {
  const v = Number(tps);
  if (!Number.isFinite(v) || v <= 0) return "—";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/** Percentage 0-100 with restrained precision. */
export function fmtPct(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "—";
  if (v >= 99.95 || v === 0) return `${v.toFixed(0)}%`;
  if (v >= 10) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
}

/** Relative time for fresh rows; absolute date once recency stops mattering. */
export function fmtAgo(iso) {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Never";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
