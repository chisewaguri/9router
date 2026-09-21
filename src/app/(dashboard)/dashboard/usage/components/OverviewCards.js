"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { fmtCompact, fmtCost, fmtInt, fmtMs, fmtPct, fmtTps } from "@/shared/utils/usageFormat";
import { TOKEN_ROLE, cacheHitRate, tokenComposition } from "./usagePalette";

/** A labelled figure. Label on top, value large, detail underneath. */
function Metric({ label, value, detail, valueClass = "", title }) {
  return (
    <div className="flex min-w-0 flex-col gap-1" title={title}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`truncate text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
      {detail && <span className="truncate text-xs text-text-muted">{detail}</span>}
    </div>
  );
}

Metric.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  detail: PropTypes.string,
  valueClass: PropTypes.string,
  title: PropTypes.string,
};

/**
 * One bar showing where the tokens went. Reading input, cached and output as
 * proportions of the same bar is faster than comparing four separate numbers.
 */
function CompositionBar({ stats }) {
  const { total, segments } = tokenComposition({
    inputTokens: stats.totalPromptTokens,
    outputTokens: stats.totalCompletionTokens,
    cachedTokens: stats.totalCachedTokens,
  });

  if (!total) {
    return (
      <Card className="p-4">
        <span className="text-sm text-text-muted">No tokens recorded in this period.</span>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-text-main">Token mix</span>
        <span className="text-xs text-text-muted tabular-nums">{fmtInt(total)} tokens total</span>
      </div>

      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={segments.map((s) => `${TOKEN_ROLE[s.role].label} ${fmtPct(s.pct)}`).join(", ")}
      >
        {segments.map((s) => (
          <div
            key={s.role}
            className={TOKEN_ROLE[s.role].bg}
            style={{ width: `${s.pct}%` }}
            title={`${TOKEN_ROLE[s.role].label}: ${fmtInt(s.value)} (${fmtPct(s.pct)})`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.role} className="flex items-center gap-2" title={TOKEN_ROLE[s.role].hint}>
            <span className={`size-2 rounded-full ${TOKEN_ROLE[s.role].bg}`} />
            <span className="text-xs text-text-muted">{TOKEN_ROLE[s.role].label}</span>
            <span className="text-xs font-medium tabular-nums text-text-main">{fmtCompact(s.value)}</span>
            <span className="text-xs tabular-nums text-text-muted">{fmtPct(s.pct)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

CompositionBar.propTypes = { stats: PropTypes.object.isRequired };

export default function OverviewCards({ stats }) {
  const hitRate = cacheHitRate({
    inputTokens: stats.totalPromptTokens,
    cachedTokens: stats.totalCachedTokens,
  });
  const cachedShare = stats.totalPromptTokens ? stats.totalCachedTokens / stats.totalPromptTokens : 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <Metric
            label="Requests"
            value={fmtInt(stats.totalRequests)}
            detail={stats.avgDurationMs ? `${fmtMs(stats.avgDurationMs)} average` : "no timing yet"}
          />
        </Card>

        <Card className="p-4">
          <Metric
            label="Input tokens"
            value={fmtCompact(stats.totalPromptTokens)}
            title={`${fmtInt(stats.totalPromptTokens)} input tokens`}
            valueClass={TOKEN_ROLE.input.text}
            detail={
              cachedShare > 0
                ? `${fmtCompact(stats.totalCachedTokens)} cached (${fmtPct(cachedShare * 100)})`
                : "no cache hits"
            }
          />
        </Card>

        <Card className="p-4">
          <Metric
            label="Output tokens"
            value={fmtCompact(stats.totalCompletionTokens)}
            title={`${fmtInt(stats.totalCompletionTokens)} output tokens`}
            valueClass={TOKEN_ROLE.output.text}
            detail={stats.avgTps ? `${fmtTps(stats.avgTps)} tok/s average` : "no throughput yet"}
          />
        </Card>

        <Card className="p-4">
          <Metric
            label="Est. cost"
            value={fmtCost(stats.totalCost)}
            valueClass={TOKEN_ROLE.cost.text}
            title={TOKEN_ROLE.cost.hint}
            detail={stats.avgTtftMs ? `${fmtMs(stats.avgTtftMs)} to first token` : "pricing estimate"}
          />
        </Card>
      </div>

      <CompositionBar stats={stats} />

      {hitRate !== null && (
        <p className="px-1 text-xs text-text-muted">
          Cache served {fmtPct(hitRate)} of input tokens, billed at a reduced rate.
        </p>
      )}

      {stats.timedRequests > 0 && stats.timedRequests < stats.totalRequests && (
        <p className="px-1 text-xs text-text-muted">
          Throughput and latency use the {fmtInt(stats.timedRequests)} of {fmtInt(stats.totalRequests)} requests
          that recorded timing. Older rows carry token counts only.
        </p>
      )}
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
};
