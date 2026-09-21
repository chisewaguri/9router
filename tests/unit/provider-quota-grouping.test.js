import { describe, expect, it } from "vitest";
import { groupConnectionsByProvider } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const connection = (id, provider, extra = {}) => ({ id, provider, isActive: true, ...extra });

const quotaEntry = (quotas) => ({ quotas });

describe("quota accounts grouped by provider", () => {
  it("keeps providers in first-seen order and accounts in row order", () => {
    const connections = [
      connection("a1", "antigravity", { name: "first" }),
      connection("c1", "codex", { name: "codex one" }),
      connection("a2", "antigravity", { name: "second" }),
    ];

    const groups = groupConnectionsByProvider(connections, {});

    expect(groups.map((g) => g.provider)).toEqual(["antigravity", "codex"]);
    expect(groups[0].connections.map((c) => c.name)).toEqual(["first", "second"]);
    expect(groups[0].total).toBe(2);
    expect(groups[1].total).toBe(1);
  });

  it("counts turned-off accounts without dropping them", () => {
    const connections = [
      connection("a1", "codex", { isActive: true }),
      connection("a2", "codex", { isActive: false }),
    ];

    const [group] = groupConnectionsByProvider(connections, {});

    expect(group.total).toBe(2);
    expect(group.inactive).toBe(1);
  });

  it("flags a provider when any account has a window at or below the depleted threshold", () => {
    const connections = [connection("a1", "antigravity"), connection("a2", "antigravity")];
    const quotaData = {
      a1: quotaEntry([{ name: "Gemini", used: 200, total: 1000 }]),
      // 3% left, at or below DEPLETED_QUOTA_THRESHOLD (5)
      a2: quotaEntry([{ name: "Claude", used: 970, total: 1000 }]),
    };

    const [group] = groupConnectionsByProvider(connections, quotaData);

    expect(group.depleted).toBe(1);
  });

  it("reports the soonest reset across the provider's accounts", () => {
    const connections = [connection("a1", "codex"), connection("a2", "codex")];
    const quotaData = {
      a1: quotaEntry([{ name: "5h", used: 1, total: 10, resetAt: "2026-07-04T06:00:00Z" }]),
      a2: quotaEntry([{ name: "5h", used: 1, total: 10, resetAt: "2026-07-04T02:00:00Z" }]),
    };

    const [group] = groupConnectionsByProvider(connections, quotaData);

    expect(group.nextReset).toBe(new Date("2026-07-04T02:00:00Z").getTime());
  });

  it("reports no reset when an account has not loaded its quota yet", () => {
    const [group] = groupConnectionsByProvider([connection("a1", "codex")], {});

    expect(group.nextReset).toBeNull();
    expect(group.depleted).toBe(0);
  });
});
