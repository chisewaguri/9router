"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import Card from "@/shared/components/Card";
import { fmtCompact, fmtCost, fmtInt, fmtTps } from "@/shared/utils/usageFormat";
import { TOKEN_ROLE } from "./usagePalette";

const MODES = [
  { value: "tokens", label: "Tokens" },
  { value: "tps", label: "Tok/s" },
  { value: "cost", label: "Cost" },
];

// Recharts draws from these, so they must resolve to concrete colors.
const SERIES = {
  input: TOKEN_ROLE.input.hex,
  output: TOKEN_ROLE.output.hex,
  tps: TOKEN_ROLE.output.hex,
  cost: TOKEN_ROLE.cost.hex,
};

function ChartTooltip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
      <p className="mb-2 font-semibold text-text-main">{label}</p>
      <dl className="flex flex-col gap-1">
        {mode === "tokens" && (
          <>
            <Row term={TOKEN_ROLE.input.label} value={fmtInt(row.inputTokens)} swatch={SERIES.input} />
            <Row term={TOKEN_ROLE.output.label} value={fmtInt(row.outputTokens)} swatch={SERIES.output} />
            <Row term="Total" value={fmtInt(row.tokens)} />
          </>
        )}
        {mode === "tps" && <Row term="Throughput" value={row.tps ? `${fmtTps(row.tps)} tok/s` : "not recorded"} swatch={SERIES.tps} />}
        {mode === "cost" && <Row term="Estimated" value={fmtCost(row.cost)} swatch={SERIES.cost} />}
        <Row term="Requests" value={fmtInt(row.requests)} />
      </dl>
    </div>
  );
}

function Row({ term, value, swatch }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <dt className="flex items-center gap-1.5 text-text-muted">
        {swatch && <span className="size-2 rounded-full" style={{ backgroundColor: swatch }} />}
        {term}
      </dt>
      <dd className="tabular-nums text-text-main">{value}</dd>
    </div>
  );
}

Row.propTypes = { term: PropTypes.string.isRequired, value: PropTypes.string.isRequired, swatch: PropTypes.string };

const axisTick = { fontSize: 10, fill: "currentColor", fillOpacity: 0.5 };

export default function UsageChart({ period = "7d" }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("tokens");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage/chart?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error("Failed to fetch chart data:", e);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const hasData = data.some((d) => d.tokens > 0 || d.cost > 0);
  const hasTps = data.some((d) => d.tps);

  return (
    <Card className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-main">Trend</span>
        <div className="grid grid-cols-3 items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${mode === m.value ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center text-sm text-text-muted">Loading chart...</div>
      ) : !hasData ? (
        <div className="flex h-56 items-center justify-center text-sm text-text-muted">
          No usage in this period yet.
        </div>
      ) : mode === "tps" && !hasTps ? (
        <div className="flex h-56 items-center justify-center text-sm text-text-muted">
          Throughput appears once requests record their duration.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={224}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradInput" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES.input} stopOpacity={0.25} />
                <stop offset="95%" stopColor={SERIES.input} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradOutput" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES.output} stopOpacity={0.25} />
                <stop offset="95%" stopColor={SERIES.output} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={mode === "cost" ? fmtCost : mode === "tps" ? fmtTps : fmtCompact}
            />
            <Tooltip content={<ChartTooltip mode={mode} />} />
            {mode !== "cost" && (
              <Legend
                verticalAlign="top"
                height={24}
                iconType="plainline"
                wrapperStyle={{ fontSize: 11 }}
                formatter={(value) => <span className="text-text-muted">{value}</span>}
              />
            )}

            {mode === "tokens" && (
              <>
                <Area
                  type="monotone" dataKey="inputTokens" name={TOKEN_ROLE.input.label}
                  stroke={SERIES.input} strokeWidth={2} fill="url(#gradInput)" dot={false} activeDot={{ r: 3 }}
                />
                <Area
                  type="monotone" dataKey="outputTokens" name={TOKEN_ROLE.output.label}
                  stroke={SERIES.output} strokeWidth={2} fill="url(#gradOutput)" dot={false} activeDot={{ r: 3 }}
                />
              </>
            )}

            {mode === "tps" && (
              <Area
                type="monotone" dataKey="tps" name="tok/s"
                stroke={SERIES.tps} strokeWidth={2} fill="url(#gradOutput)" dot={false} activeDot={{ r: 3 }}
                connectNulls
              />
            )}

            {mode === "cost" && (
              <Area
                type="monotone" dataKey="cost" name={TOKEN_ROLE.cost.label}
                stroke={SERIES.cost} strokeWidth={2} fill="url(#gradInput)" dot={false} activeDot={{ r: 3 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
};
