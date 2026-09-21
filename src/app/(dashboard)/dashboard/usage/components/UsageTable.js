"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { fmtCompact, fmtCost, fmtInt, fmtAgo, fmtTps } from "@/shared/utils/usageFormat";
import { TOKEN_ROLE } from "./usagePalette";

/**
 * Metric columns live here, once, instead of being re-declared per grouping.
 * Every grouping then reads the same way: how many calls, what went in, what
 * came out, how fast, what it cost.
 */
const METRIC_COLUMNS = [
  { field: "requests", label: "Requests", format: "int" },
  { field: "promptTokens", label: "Input", format: "tokens", role: "input" },
  { field: "completionTokens", label: "Output", format: "tokens", role: "output" },
  { field: "tps", label: "Tok/s", format: "tps" },
  { field: "cost", label: "Est. cost", format: "cost", role: "cost" },
];

function SortIcon({ field, currentSort, currentOrder }) {
  if (currentSort !== field) {
    return <span className="ml-1 text-text-subtle" aria-hidden="true">↕</span>;
  }
  return (
    <span className="ml-1 text-primary" aria-hidden="true">
      {currentOrder === "asc" ? "↑" : "↓"}
    </span>
  );
}

SortIcon.propTypes = {
  field: PropTypes.string.isRequired,
  currentSort: PropTypes.string.isRequired,
  currentOrder: PropTypes.string.isRequired,
};

/** Input cell carries its cache hit as a quieter second line. */
function InputCell({ item, viewMode, isSummary }) {
  if (isSummary && item.promptTokens === undefined) {
    return <td className="px-4 py-2.5 text-right text-text-subtle">—</td>;
  }
  if (viewMode === "costs") {
    return (
      <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
        {item.inputCost === undefined ? "—" : fmtCost(item.inputCost)}
      </td>
    );
  }
  const cached = item.cachedTokens || 0;
  const cachedPct = item.promptTokens ? (cached / item.promptTokens) * 100 : 0;
  return (
    <td className="px-4 py-2.5 text-right tabular-nums">
      <span className="text-text-main" title={fmtInt(item.promptTokens)}>{fmtCompact(item.promptTokens)}</span>
      {cached > 0 && (
        <span className="ml-1.5 text-[11px] text-info" title={`${fmtInt(cached)} cached (${cachedPct.toFixed(0)}%)`}>
          ↻{fmtCompact(cached)}
        </span>
      )}
    </td>
  );
}

InputCell.propTypes = {
  item: PropTypes.object.isRequired,
  viewMode: PropTypes.string.isRequired,
  isSummary: PropTypes.bool,
};

function OutputCell({ item, viewMode, isSummary }) {
  if (isSummary && item.completionTokens === undefined) {
    return <td className="px-4 py-2.5 text-right text-text-subtle">—</td>;
  }
  if (viewMode === "costs") {
    return (
      <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
        {item.outputCost === undefined ? "—" : fmtCost(item.outputCost)}
      </td>
    );
  }
  return (
    <td className="px-4 py-2.5 text-right tabular-nums text-text-main" title={fmtInt(item.completionTokens)}>
      {fmtCompact(item.completionTokens)}
    </td>
  );
}

OutputCell.propTypes = InputCell.propTypes;

function MetricCells({ item, viewMode, isSummary }) {
  return (
    <>
      <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">
        {isSummary && item.requests === undefined ? "—" : fmtInt(item.requests)}
      </td>
      <InputCell item={item} viewMode={viewMode} isSummary={isSummary} />
      <OutputCell item={item} viewMode={viewMode} isSummary={isSummary} />
      <td className="px-4 py-2.5 text-right tabular-nums">
        {item.tps ? (
          <span className="text-text-main" title={`${fmtTps(item.tps)} output tokens per second`}>{fmtTps(item.tps)}</span>
        ) : (
          <span className="text-text-subtle" title="No timing recorded for these requests">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-warning">
        {fmtCost(item.cost ?? item.totalCost)}
      </td>
    </>
  );
}

MetricCells.propTypes = {
  item: PropTypes.object.isRequired,
  viewMode: PropTypes.string.isRequired,
  isSummary: PropTypes.bool,
};

/**
 * Sortable usage table with expandable group rows.
 *
 * Metric columns are shared across every grouping; callers only supply the
 * identity columns that differ (model, account, key, endpoint).
 */
export default function UsageTable({
  columns,
  groupedData,
  tableType,
  sortBy,
  sortOrder,
  onToggleSort,
  viewMode,
  storageKey,
  renderDetailCells,
  renderSummaryCells,
  emptyMessage,
}) {
  const [expanded, setExpanded] = useState(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setExpanded(new Set(JSON.parse(saved)));
    } catch (e) {
      console.error(`Failed to load ${storageKey}:`, e);
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]));
    } catch (e) {
      console.error(`Failed to save ${storageKey}:`, e);
    }
  }, [expanded, storageKey]);

  const toggleGroup = useCallback((groupKey) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const totalColSpan = columns.length + METRIC_COLUMNS.length;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border bg-bg-subtle/40 text-[11px] uppercase tracking-wide text-text-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.field}
                  scope="col"
                  aria-sort={sortBy === col.field ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                  className="px-4 py-3 font-semibold"
                >
                  <button
                    type="button"
                    onClick={() => onToggleSort(tableType, col.field)}
                    className="inline-flex w-full items-center gap-0.5 rounded-sm text-inherit hover:text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
                    style={{ justifyContent: col.align === "right" ? "flex-end" : "flex-start" }}
                  >
                    {col.label}
                    <SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
                  </button>
                </th>
              ))}
              {METRIC_COLUMNS.map((col) => (
                <th
                  key={col.field}
                  scope="col"
                  aria-sort={sortBy === col.field ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                  className="px-4 py-3 text-right font-semibold"
                >
                  <button
                    type="button"
                    onClick={() => onToggleSort(tableType, col.field)}
                    className="inline-flex w-full items-center justify-end gap-0.5 rounded-sm text-inherit hover:text-text-main focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60"
                  >
                    <span className={col.role ? TOKEN_ROLE[col.role].text : ""}>{col.label}</span>
                    <SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groupedData.map((group) => (
              <Fragment key={group.groupKey}>
                <tr
                  className="cursor-pointer bg-surface-2/40 transition-colors hover:bg-surface-2/70"
                  onClick={() => toggleGroup(group.groupKey)}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`material-symbols-outlined text-[18px] text-text-muted transition-transform ${expanded.has(group.groupKey) ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      >
                        chevron_right
                      </span>
                      <span className="font-medium text-text-main">{group.groupKey}</span>
                      {group.items.length > 1 && (
                        <span className="text-[11px] text-text-muted">{group.items.length} entries</span>
                      )}
                      {group.summary.pending > 0 && (
                        <span className="material-symbols-outlined animate-spin text-[14px] text-primary" aria-label="request in flight">
                          progress_activity
                        </span>
                      )}
                    </div>
                  </td>
                  {renderSummaryCells(group)}
                  <MetricCells item={group.summary} viewMode={viewMode} isSummary />
                </tr>

                {expanded.has(group.groupKey) &&
                  group.items.map((item) => (
                    <tr key={`detail-${item.key}`} className="transition-colors hover:bg-surface-2/30">
                      {renderDetailCells(item)}
                      <MetricCells item={item} viewMode={viewMode} />
                    </tr>
                  ))}
              </Fragment>
            ))}

            {groupedData.length === 0 && (
              <tr>
                <td colSpan={totalColSpan} className="px-4 py-10 text-center text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

UsageTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.shape({
    field: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    align: PropTypes.string,
  })).isRequired,
  groupedData: PropTypes.array.isRequired,
  tableType: PropTypes.string.isRequired,
  sortBy: PropTypes.string.isRequired,
  sortOrder: PropTypes.string.isRequired,
  onToggleSort: PropTypes.func.isRequired,
  viewMode: PropTypes.string.isRequired,
  storageKey: PropTypes.string.isRequired,
  renderDetailCells: PropTypes.func.isRequired,
  renderSummaryCells: PropTypes.func.isRequired,
  emptyMessage: PropTypes.string.isRequired,
};
