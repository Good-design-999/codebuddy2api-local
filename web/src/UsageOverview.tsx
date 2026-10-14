import { useId, useState, type PointerEvent } from "react";
import { metric, number, text, type RecordValue } from "./api";
import { Empty, Icon } from "./components";
import { useT } from "./i18n";
import s from "./ui.module.scss";

function delta(current: number | null, previous: number | null): string | null {
  if (current === null || previous === null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function share(part: number | null, total: number | null): string | null {
  if (part === null || total === null || total <= 0) return null;
  return `${((part / total) * 100).toFixed(1)}%`;
}

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const nums = values.map((value) => value ?? 0);
  if (nums.length < 2) return null;
  const max = Math.max(1, ...nums);
  const points = nums
    .map(
      (v, i) => `${((i * 100) / (nums.length - 1)).toFixed(1)},${(26 - (v / max) * 22).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg className={s.spark} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KpiCards({
  summary,
  previous,
  series,
}: {
  summary: RecordValue;
  previous: RecordValue | null;
  series: RecordValue[];
}) {
  const t = useT();
  const rate = number(summary.success_rate);
  const p95 = number(summary.p95_duration_ms);
  const total = number(summary.total_tokens);
  const input = number(summary.input_tokens);
  const cacheRead = number(summary.cache_read_tokens);
  const cacheWrite = number(summary.cache_creation_tokens);
  const cacheTotal =
    cacheRead === null && cacheWrite === null ? null : (cacheRead ?? 0) + (cacheWrite ?? 0);
  const errorBuckets = series.filter((row) => (number(row.error) ?? 0) > 0).length;
  const sparkOf = (key: string) => series.map((row) => number(row[key]));
  const cacheSpark = series.map((row) =>
    number(row.cache_read_tokens) === null && number(row.cache_creation_tokens) === null
      ? null
      : (number(row.cache_read_tokens) ?? 0) + (number(row.cache_creation_tokens) ?? 0),
  );
  const rateSpark = series.map((row) => {
    const requests = number(row.requests);
    return requests ? (number(row.success) ?? 0) / requests : null;
  });
  const cards: [string, string, string, string, (number | null)[], string][] = [
    [
      t("dash.kpi.requests"),
      "arrow",
      metric(summary.requests),
      t("dash.vsPrevious", {
        pct: delta(number(summary.requests), number(previous?.requests)) ?? "—",
      }),
      sparkOf("requests"),
      "var(--series-requests)",
    ],
    [
      t("dash.kpi.successRate"),
      "shield",
      rate === null ? "—" : `${(rate * 100).toFixed(1)}%`,
      t("dash.p95Latency", {
        value: p95 === null ? "—" : `${(p95 / 1000).toFixed(1)}s`,
      }),
      rateSpark,
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.failures"),
      "alert",
      metric(summary.error),
      t("dash.errorBuckets", { n: errorBuckets }),
      sparkOf("error"),
      "var(--error)",
    ],
    [
      t("dash.kpi.credit"),
      "leaf",
      metric(summary.credit),
      t("dash.vsPrevious", { pct: delta(number(summary.credit), number(previous?.credit)) ?? "—" }),
      sparkOf("credit"),
      "var(--series-credit)",
    ],
    [
      t("dash.kpi.totalTokens"),
      "model",
      metric(total),
      t("dash.reasoningSub", { value: metric(summary.reasoning_tokens) }),
      sparkOf("total_tokens"),
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.inputTokens"),
      "down",
      metric(input),
      t("dash.shareOf", { pct: share(input, total) ?? "—" }),
      sparkOf("input_tokens"),
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.outputTokens"),
      "up",
      metric(summary.output_tokens),
      t("dash.shareOf", { pct: share(number(summary.output_tokens), total) ?? "—" }),
      sparkOf("output_tokens"),
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.cacheTokens"),
      "cache",
      metric(cacheTotal),
      t("dash.cacheHitRate", { pct: share(cacheRead, input) ?? "—" }),
      cacheSpark,
      "var(--series-tokens)",
    ],
  ];
  return (
    <div className={s.kpiGrid}>
      {cards.map(([label, icon, value, sub, spark, color]) => (
        <section className={s.kpiCard} key={label}>
          <div>
            <span>{label}</span>
            <span>
              <Icon name={icon} />
            </span>
          </div>
          <strong>{value}</strong>
          <small>{sub}</small>
          <Spark values={spark} color={color} />
        </section>
      ))}
    </div>
  );
}

const TREND_SERIES = [
  { key: "requests", labelKey: "dash.kpi.requests", color: "var(--series-requests)" },
  { key: "total_tokens", labelKey: "dash.kpi.totalTokens", color: "var(--series-tokens)" },
  { key: "credit", labelKey: "dash.kpi.credit", color: "var(--series-credit)" },
] as const;

export function UsageTrend({
  rows,
  granularity = "day",
  partial = false,
}: {
  rows: RecordValue[];
  granularity?: string;
  partial?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [selection, setSelection] = useState<{ rows: RecordValue[]; index: number } | null>(null);
  const active = selection?.rows === rows ? selection.index : null;
  if (!rows.length)
    return <Empty title={partial ? t("trend.partialRange") : t("trend.emptyRange")} />;
  const LEFT = 56,
    RIGHT = 648,
    TOP = 14,
    BOTTOM = 172;
  const maxOf = (key: string) => Math.max(1, ...rows.map((r) => number(r[key]) ?? 0));
  const maxima: Record<string, number> = Object.fromEntries(
    TREND_SERIES.map(({ key }) => [key, maxOf(key)]),
  );
  const first = number(rows[0].bucket),
    last = number(rows.at(-1)?.bucket);
  const xAt = (index: number) =>
    rows.length === 1
      ? (LEFT + RIGHT) / 2
      : first !== null && last !== null && last > first && number(rows[index].bucket) !== null
        ? LEFT + ((Number(rows[index].bucket) - first) * (RIGHT - LEFT)) / (last - first)
        : LEFT + (index * (RIGHT - LEFT)) / (rows.length - 1);
  const yAt = (key: string, index: number) =>
    BOTTOM - ((number(rows[index][key]) ?? 0) / (maxima[key] ?? 1)) * (BOTTOM - TOP);
  const pointsOf = (key: string) => rows.map((_, i) => `${xAt(i)},${yAt(key, i)}`).join(" ");
  const choose = (index: number) =>
    setSelection({ rows, index: Math.max(0, Math.min(rows.length - 1, index)) });
  const pointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) * 780) / rect.width;
    let closest = 0;
    for (let i = 1; i < rows.length; i++)
      if (Math.abs(x - xAt(i)) < Math.abs(x - xAt(closest))) closest = i;
    const step = granularity === "hour" ? 3600 : 86400;
    const tolerance =
      first !== null && last !== null && last > first
        ? ((RIGHT - LEFT) * step) / (last - first) / 2
        : 30;
    if (partial && Math.abs(x - xAt(closest)) > tolerance) setSelection(null);
    else choose(closest);
  };
  const selected = active === null ? null : rows[active];
  const ticks = [0, 1, 2, 3, 4];
  return (
    <>
      <div className={s.chartInteractive}>
        <svg
          viewBox="0 0 780 210"
          preserveAspectRatio="none"
          className={s.chart}
          role="img"
          tabIndex={0}
          aria-label={
            granularity === "hour" ? t("dash.usageTrend.hourly") : t("dash.usageTrend.daily")
          }
          aria-describedby={`${id}-hint${selected ? ` ${id}-tooltip` : ""}`}
          onPointerMove={pointer}
          onPointerDown={pointer}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") setSelection(null);
          }}
          onFocus={() => choose(0)}
          onBlur={() => setSelection(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSelection(null);
              return;
            }
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            choose(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? rows.length - 1
                  : (active ?? 0) + (e.key === "ArrowRight" ? 1 : -1),
            );
          }}
        >
          {ticks.map((i) => {
            const y = BOTTOM - (i * (BOTTOM - TOP)) / 4;
            return (
              <g key={i}>
                <line
                  x1={LEFT}
                  y1={y}
                  x2={RIGHT}
                  y2={y}
                  stroke="var(--line)"
                  strokeDasharray="4 5"
                />
                <text x={LEFT - 6} y={y + 3} textAnchor="end" fill="var(--series-requests)">
                  {metric((maxima.requests * i) / 4)}
                </text>
                <text x={RIGHT + 8} y={y + 3} fill="var(--series-credit)">
                  {metric((maxima.credit * i) / 4)}
                </text>
                <text x={RIGHT + 76} y={y + 3} fill="var(--series-tokens)">
                  {metric((maxima.total_tokens * i) / 4)}
                </text>
              </g>
            );
          })}
          {rows.length > 1 &&
            !partial &&
            TREND_SERIES.map(({ key, color }) => (
              <polyline
                key={key}
                data-series={key}
                points={pointsOf(key)}
                stroke={color}
                strokeWidth="2.5"
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          {rows.length <= 62 &&
            TREND_SERIES.map(({ key, color }) => (
              <g key={key} data-series={key}>
                {rows.map((_, i) => (
                  <circle key={i} cx={xAt(i)} cy={yAt(key, i)} r="2.5" fill={color} />
                ))}
              </g>
            ))}
          {active !== null && (
            <g aria-hidden="true">
              <line
                x1={xAt(active)}
                x2={xAt(active)}
                y1={TOP + 6}
                y2={BOTTOM}
                stroke="var(--accent)"
                strokeDasharray="3 4"
              />
              {TREND_SERIES.map(({ key, color }) => (
                <circle
                  key={key}
                  cx={xAt(active)}
                  cy={yAt(key, active)}
                  r="5.5"
                  fill="var(--surface)"
                  stroke={color}
                  strokeWidth="2.5"
                />
              ))}
            </g>
          )}
        </svg>
        {selected && active !== null && (
          <div
            className={s.chartTooltip}
            id={`${id}-tooltip`}
            role="tooltip"
            style={{ left: `${Math.min(92, Math.max(4, (xAt(active) / 780) * 100))}%` }}
            data-edge={xAt(active) < 220 ? "left" : xAt(active) > 560 ? "right" : "center"}
          >
            <strong>{text(selected.date)} · UTC</strong>
            <dl>
              {TREND_SERIES.map(({ key, labelKey, color }) => (
                <div key={key}>
                  <dt>
                    <i className={s.legendDot} style={{ background: color }} />
                    {t(labelKey)}
                  </dt>
                  <dd>{metric(selected[key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
      <div className={s.chartLegend}>
        {TREND_SERIES.map(({ key, labelKey, color }) => (
          <span key={key}>
            <i className={s.legendDot} style={{ background: color }} />
            {t(labelKey)}
          </span>
        ))}
      </div>
      <p className={s.srOnly} id={`${id}-hint`}>
        指向或点按查看时段；键盘左右方向键逐点查看，Home 和 End 跳到首尾，Esc 关闭提示。
      </p>
      <div className={s.chartAxis}>
        <span>{text(rows[0].date)}</span>
        {rows.length > 1 && <span>{text(rows.at(-1)?.date)}</span>}
      </div>
      <details className={s.chartData}>
        <summary>{t("dash.trendData")}</summary>
        <table>
          <thead>
            <tr>
              <th>{granularity === "hour" ? "时段（UTC）" : "日期（UTC）"}</th>
              <th>{t("dash.kpi.requests")}</th>
              <th>{t("dash.kpi.totalTokens")}</th>
              <th>{t("dash.kpi.credit")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{text(r.date)}</td>
                <td>{metric(r.requests)}</td>
                <td>{metric(r.total_tokens)}</td>
                <td>{metric(r.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
