"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}

import Badge from "./Badge";
import Card from "./Card";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import { fmtCompact, fmtInt, fmtAgo, computeTps, fmtTps } from "@/shared/utils/usageFormat";
import dynamic from "next/dynamic";
// Lazy-load: keeps @xyflow/react out of the shared bundle until topology renders
const ProviderTopology = dynamic(() => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"), { ssr: false });
import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";

// Auto-update time display without re-rendering the parent
function TimeAgo({ timestamp }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return <>{fmtAgo(timestamp)}</>;
}

function RecentRequests({ requests = [] }) {
  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" padding="none">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <span className="text-sm font-semibold text-text-main">Recent requests</span>
      </div>

      {!requests.length ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-muted">
          No requests recorded yet. Send one through the router to see it here.
        </div>
      ) : (
        <div className="max-h-[420px] flex-1 overflow-y-auto">
          <table className="w-full min-w-[420px] border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
                <th scope="col" className="w-6 px-4 py-2" />
                <th scope="col" className="px-2 py-2 text-left font-semibold">Model</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">In</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Out</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Tok/s</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {requests.map((r, i) => {
                const ok = !r.status || r.status === "ok" || r.status === "success";
                const tps = computeTps(r.completionTokens, r.latencyMs, r.ttftMs);
                return (
                  <tr key={i} className="transition-colors hover:bg-surface-2/40">
                    <td className="py-2 pl-4">
                      <span
                        className={`material-symbols-outlined text-[15px] ${ok ? "text-success" : "text-error"}`}
                        title={ok ? "Succeeded" : `Failed: ${r.status}`}
                        aria-label={ok ? "Succeeded" : `Failed: ${r.status}`}
                      >
                        {ok ? "check_circle" : "error"}
                      </span>
                    </td>
                    <td className="max-w-[160px] truncate px-2 py-2 font-mono" title={r.model}>{r.model}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-muted" title={fmtInt(r.promptTokens)}>
                      {fmtCompact(r.promptTokens)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-text-main" title={fmtInt(r.completionTokens)}>
                      {fmtCompact(r.completionTokens)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {tps ? <span className="text-text-main">{fmtTps(tps)}</span> : <span className="text-text-subtle">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-text-muted">
                      <TimeAgo timestamp={r.timestamp} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Throughput for an aggregate. Prefers the server's figure, which already
 * divides only the tokens whose duration was measured; recomputing from totals
 * here would divide untimed tokens by other rows' time.
 */
function tpsOf(entry) {
  if (!entry) return null;
  if (entry.avgTps) return entry.avgTps;
  const timed = entry.timedCompletionTokens;
  if (timed > 0) {
    const decodeMs = (entry.latencyMs || 0) - (entry.ttftMs || 0);
    if (decodeMs > 0) return timed / (decodeMs / 1000);
  }
  const total = entry.latencyMs || 0;
  return total > 0 ? computeTps(entry.completionTokens, total, entry.ttftMs || 0) : null;
}

function sortData(dataMap, pendingMap = {}, sortBy, sortOrder) {
  return Object.entries(dataMap || {})
    .map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      // cost split is a token-share allocation of the (rate-accurate) server
      // total, not a per-rate recompute. cached is a subset of prompt, so peel
      // it out of the input share.
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
      const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
      const outputCost = totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return {
        ...data,
        key,
        totalTokens,
        totalCost,
        inputCost,
        cachedCost,
        outputCost,
        tps: tpsOf(data),
        pending: pendingMap[key] || 0,
      };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item, keyField) {
  switch (keyField) {
    case "rawModel": return item.rawModel || "Unknown model";
    case "accountName": return item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown account";
    case "keyName": return item.keyName || "Unknown key";
    case "endpoint": return item.endpoint || "Unknown endpoint";
    default: return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data, keyField) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: {
          requests: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0,
          cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0,
          latencyMs: 0, ttftMs: 0, timedCompletionTokens: 0, lastUsed: null, pending: 0, tps: null,
        },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.cachedCost += item.cachedCost || 0;
    s.outputCost += item.outputCost || 0;
    s.latencyMs += item.latencyMs || 0;
    s.ttftMs += item.ttftMs || 0;
    s.timedCompletionTokens += item.timedCompletionTokens || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups).map((group) => ({
    ...group,
    summary: { ...group.summary, tps: tpsOf(group.summary) },
  }));
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "lastUsed", label: "Last used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "accountName", label: "Account" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "lastUsed", label: "Last used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API key" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "lastUsed", label: "Last used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "lastUsed", label: "Last used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "By model" },
  { value: "account", label: "By account" },
  { value: "apiKey", label: "By API key" },
  { value: "endpoint", label: "By endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

const IDENTITY_CELL = "px-4 py-2.5";

export default function UsageStats({ period: periodProp, setPeriod: setPeriodProp, hidePeriodSelector = false } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "requests";
  const sortOrder = searchParams.get("sortOrder") || "desc";

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("tokens");
  const [providers, setProviders] = useState([]);
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Fetch connected providers once, deduplicate by provider type
  useEffect(() => {
    Promise.all([
      fetch("/api/providers").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/provider-nodes").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, nodesData]) => {
        const nodeNameMap = {};
        for (const node of nodesData?.nodes || []) nodeNameMap[node.id] = node.name;
        const seen = new Set();
        const unique = (d?.connections || [])
          .filter((c) => {
            if (c.isActive === false) return false;
            if (!isLLMProvider(c.provider)) return false;
            if (seen.has(c.provider)) return false;
            seen.add(c.provider);
            return true;
          })
          .map((c) => ({ ...c, nodeName: nodeNameMap[c.provider] || null }));
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    fetch(`/api/usage/stats?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [period]);

  // SSE - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoading(false);

    return () => es.close();
  }, []);

  const toggleSort = useCallback((tableType, field) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sortBy") === field) {
      params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      params.set("sortBy", field);
      params.set("sortOrder", "desc");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const activeTableConfig = useMemo(() => {
    if (!stats) return null;

    const identity = {
      model: {
        columns: MODEL_COLUMNS,
        data: () => sortData(stats.byModel, stats.pending?.byModel || {}, sortBy, sortOrder),
        groupBy: "rawModel",
        storageKey: "usage-stats:expanded-models",
        emptyMessage: "No usage recorded yet. Requests appear here after your first call.",
      },
      account: {
        columns: ACCOUNT_COLUMNS,
        data: () => sortData(stats.byAccount, {}, sortBy, sortOrder),
        groupBy: "accountName",
        storageKey: "usage-stats:expanded-accounts",
        emptyMessage: "No account-level usage recorded yet.",
      },
      apiKey: {
        columns: API_KEY_COLUMNS,
        data: () => sortData(stats.byApiKey, {}, sortBy, sortOrder),
        groupBy: "keyName",
        storageKey: "usage-stats:expanded-apikeys",
        emptyMessage: "No API-key usage recorded yet.",
      },
      endpoint: {
        columns: ENDPOINT_COLUMNS,
        data: () => sortData(stats.byEndpoint, {}, sortBy, sortOrder),
        groupBy: "endpoint",
        storageKey: "usage-stats:expanded-endpoints",
        emptyMessage: "No endpoint usage recorded yet.",
      },
    };

    const cfg = identity[tableView] || identity.model;
    const grouped = groupDataByKey(cfg.data(), cfg.groupBy);

    // Last-used cell is shared by every grouping, so it renders from the group.
    const lastUsedCell = (group) => (
      <td className={`${IDENTITY_CELL} whitespace-nowrap text-right text-text-muted`}>
        {fmtAgo(group.summary.lastUsed)}
      </td>
    );

    const providersCell = (provider, pending) => (
      <td className={IDENTITY_CELL}>
        <Badge variant={pending > 0 ? "primary" : "neutral"} size="sm">{provider || "unknown"}</Badge>
      </td>
    );

    // Summary rows collapse rows that differ in this column, so say that
    // instead of leaving an unexplained gap.
    const variesCell = () => (
      <td className={`${IDENTITY_CELL} text-xs text-text-subtle`} title="Varies across the rows in this group">—</td>
    );

    switch (tableView) {
      case "account":
        return {
          columns: cfg.columns, groupedData: grouped, storageKey: cfg.storageKey, emptyMessage: cfg.emptyMessage,
          renderSummaryCells: (group) => (
            <>
              {variesCell()}
              {providersCell(group.summary.provider)}
              {lastUsedCell(group)}
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`${IDENTITY_CELL} font-medium text-text-main`}>{item.accountName}</td>
              <td className={`${IDENTITY_CELL} font-mono text-xs text-text-muted`}>{item.rawModel}</td>
              {providersCell(item.provider, item.pending)}
              {lastUsedCell({ summary: item })}
            </>
          ),
        };
      case "apiKey":
        return {
          columns: cfg.columns, groupedData: grouped, storageKey: cfg.storageKey, emptyMessage: cfg.emptyMessage,
          renderSummaryCells: (group) => (
            <>
              {variesCell()}
              {providersCell(group.summary.provider)}
              {lastUsedCell(group)}
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`${IDENTITY_CELL} font-medium text-text-main`}>{item.keyName}</td>
              <td className={`${IDENTITY_CELL} font-mono text-xs text-text-muted`}>{item.rawModel}</td>
              {providersCell(item.provider, item.pending)}
              {lastUsedCell({ summary: item })}
            </>
          ),
        };
      case "endpoint":
        return {
          columns: cfg.columns, groupedData: grouped, storageKey: cfg.storageKey, emptyMessage: cfg.emptyMessage,
          renderSummaryCells: (group) => (
            <>
              {variesCell()}
              {providersCell(group.summary.provider)}
              {lastUsedCell(group)}
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`${IDENTITY_CELL} font-mono text-xs text-text-main`}>{item.endpoint}</td>
              <td className={`${IDENTITY_CELL} font-mono text-xs text-text-muted`}>{item.rawModel}</td>
              {providersCell(item.provider, item.pending)}
              {lastUsedCell({ summary: item })}
            </>
          ),
        };
      case "model":
      default:
        return {
          columns: MODEL_COLUMNS, groupedData: grouped, storageKey: cfg.storageKey, emptyMessage: cfg.emptyMessage,
          renderSummaryCells: (group) => (
            <>
              {variesCell()}
              {lastUsedCell(group)}
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className={`${IDENTITY_CELL} font-mono text-xs text-text-main`}>{item.rawModel}</td>
              {providersCell(item.provider, item.pending)}
              {lastUsedCell({ summary: item })}
            </>
          ),
        };
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading) {
    return (
      <Card className="p-6">
        <p className="text-text-main">Usage statistics could not be loaded.</p>
        <p className="mt-1 text-sm text-text-muted">
          Check that the database is reachable, then reload the page.
        </p>
      </Card>
    );
  }

  const spinner = (
    <div className="flex items-center justify-center py-12 text-text-muted">
      <span className="material-symbols-outlined animate-spin text-[32px]">progress_activity</span>
      <span className="sr-only">Loading usage statistics</span>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-surface-2 p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <span className="material-symbols-outlined animate-spin text-[16px] text-text-muted" aria-label="Refreshing">progress_activity</span>
          )}
        </div>
      )}

      {loading ? spinner : <OverviewCards stats={stats} />}

      {loading ? spinner : (
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <ProviderTopology
            providers={providers}
            activeRequests={stats.activeRequests || []}
            lastProvider={stats.recentRequests?.[0]?.provider || ""}
            errorProvider={stats.errorProvider || ""}
          />
          <RecentRequests requests={stats.recentRequests || []} />
        </div>
      )}

      {loading ? spinner : <UsageChart period={period} />}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <label htmlFor="usage-grouping" className="sr-only">Group usage by</label>
            <select
              id="usage-grouping"
              value={tableView}
              onChange={(e) => setTableView(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary/40 sm:w-auto"
              style={{ colorScheme: "auto" }}
            >
              {TABLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 items-center gap-1 rounded-lg border border-border bg-surface-2 p-1 sm:flex">
            <button
              onClick={() => setViewMode("tokens")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${viewMode === "tokens" ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Tokens
            </button>
            <button
              onClick={() => setViewMode("costs")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${viewMode === "costs" ? "bg-surface text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}
            >
              Costs
            </button>
          </div>
        </div>
        {loading ? spinner : activeTableConfig && (
          <UsageTable
            columns={activeTableConfig.columns}
            groupedData={activeTableConfig.groupedData}
            tableType={tableView}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onToggleSort={toggleSort}
            viewMode={viewMode}
            storageKey={activeTableConfig.storageKey}
            renderSummaryCells={activeTableConfig.renderSummaryCells}
            renderDetailCells={activeTableConfig.renderDetailCells}
            emptyMessage={activeTableConfig.emptyMessage}
          />
        )}
      </div>
    </div>
  );
}
