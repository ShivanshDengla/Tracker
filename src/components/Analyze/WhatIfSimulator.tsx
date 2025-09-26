'use client';

import { useMemo, useState } from 'react';

type InputSummary = {
  totalUsd: number;
  topSymbol?: string;
  topUsd: number;
  stableUsd: number;
  chains: Array<[string, number]>;
};

function gradeFromScore(score: number) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'E';
}

function scoreFrom(totalUsd: number, topShare: number, stableShare: number, chainCount: number) {
  let score = 90;
  if (topShare > 0.6) score -= 20; else if (topShare > 0.4) score -= 10;
  if (stableShare < 0.1) score -= 10; else if (stableShare > 0.8) score -= 5;
  if (chainCount < 2) score -= 5;
  if (totalUsd < 10) score = Math.min(score, 70);
  return Math.max(0, Math.min(100, score));
}

export function WhatIfSimulator({ summary }: { summary: InputSummary | null }) {
  const [trimTopPct, setTrimTopPct] = useState(10); // % of top asset to trim
  const [addStableUsd, setAddStableUsd] = useState(0); // Additional USD moved into stables

  const sim = useMemo(() => {
    if (!summary) return null;
    const total = summary.totalUsd;
    const topUsd = summary.topUsd;
    const stableUsd = summary.stableUsd;
    const chains = summary.chains.length;

    const trimmed = topUsd * (1 - trimTopPct / 100);
    const newStable = stableUsd + addStableUsd;
    // Assume we swap from top asset into stables (keep total constant for what-if)
    const postTopUsd = Math.max(0, trimmed - addStableUsd);
    const postTotal = total; // what-if keeps total constant
    const postTopShare = postTotal > 0 ? postTopUsd / postTotal : 0;
    const postStableShare = postTotal > 0 ? newStable / postTotal : 0;
    const postScore = scoreFrom(postTotal, postTopShare, postStableShare, chains);
    const preScore = scoreFrom(total, topUsd / (total || 1), stableUsd / (total || 1), chains);
    return { preScore, postScore, postTopShare, postStableShare };
  }, [summary, trimTopPct, addStableUsd]);

  if (!summary) return null;

  return (
    <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <h2 className="text-base font-semibold mb-1">What-if Simulator</h2>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
        Simulate trimming your top asset and increasing stables. See score impact instantly.
      </p>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>Trim top asset ({summary.topSymbol || 'Top'})</span>
            <span>{trimTopPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={trimTopPct}
            onChange={(e) => setTrimTopPct(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>Move to stables ($)</span>
            <span>${addStableUsd}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.round(summary.topUsd)}
            step={Math.max(1, Math.round((summary.topUsd || 100) / 20))}
            value={addStableUsd}
            onChange={(e) => setAddStableUsd(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {sim && (
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 text-center">
              <p className="text-xs text-zinc-500 mb-1">Before</p>
              <p className="text-lg font-semibold">{sim.preScore}/100</p>
              <p className="text-xs">Grade {gradeFromScore(sim.preScore)}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 text-center">
              <p className="text-xs text-zinc-500 mb-1">After</p>
              <p className="text-lg font-semibold">{sim.postScore}/100</p>
              <p className="text-xs">Grade {gradeFromScore(sim.postScore)}</p>
            </div>
          </div>
        )}

        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          Suggested action: swap approximately ${addStableUsd} from {summary.topSymbol || 'top asset'} into a stablecoin.
        </div>
      </div>
    </section>
  );
}


