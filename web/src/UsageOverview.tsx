import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { compact, metric, number, text, type RecordValue } from "./api";
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

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : "";
  // Fritsch–Carlson tangents keep the curve monotone between points: no
  // overshoot dips below zero or fake peaks between sparse buckets.
  const n = pts.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    slopes.push(dx === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx);
  }
  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < n - 1; i++)
    tangents.push(slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2);
  tangents.push(slopes[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const a = tangents[i] / slopes[i];
      const b = tangents[i + 1] / slopes[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const r = 3 / h;
        tangents[i] = r * a * slopes[i];
        tangents[i + 1] = r * b * slopes[i];
      }
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const c1x = pts[i][0] + dx / 3;
    const c1y = pts[i][1] + (tangents[i] * dx) / 3;
    const c2x = pts[i + 1][0] - dx / 3;
    const c2y = pts[i + 1][1] - (tangents[i + 1] * dx) / 3;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const nums = values.map((value) => value ?? 0);
  if (nums.length < 2) return null;
  const max = Math.max(1, ...nums);
  const pts = nums.map((v, i): [number, number] => [
    (i * 100) / (nums.length - 1),
    26 - (v / max) * 22,
  ]);
  return (
    <svg className={s.spark} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={smoothPath(pts)}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function KpiValue({
  label,
  display,
  exact,
}: {
  label: string;
  display: string;
  exact: string | null;
}) {
  return (
    <strong className={s.kpiValue} tabIndex={exact === null ? undefined : 0}>
      {display}
      {exact !== null && (
        <span className={s.kpiTip} role="tooltip">
          <b>{label}</b>
          {exact}
        </span>
      )}
    </strong>
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
  const cards: [string, string, string, string | null, string, (number | null)[], string][] = [
    [
      t("dash.kpi.requests"),
      "arrow",
      compact(summary.requests),
      metric(number(summary.requests)),
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
      rate === null ? null : `${(rate * 100).toFixed(2)}%`,
      t("dash.p95Latency", { value: p95 === null ? "—" : `${(p95 / 1000).toFixed(1)}s` }),
      rateSpark,
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.failures"),
      "alert",
      compact(summary.error),
      metric(number(summary.error)),
      t("dash.errorBuckets", { n: errorBuckets }),
      sparkOf("error"),
      "var(--error)",
    ],
    [
      t("dash.kpi.credit"),
      "leaf",
      compact(summary.credit),
      metric(number(summary.credit)),
      t("dash.vsPrevious", { pct: delta(number(summary.credit), number(previous?.credit)) ?? "—" }),
      sparkOf("credit"),
      "var(--series-credit)",
    ],
    [
      t("dash.kpi.totalTokens"),
      "model",
      compact(total),
      metric(total),
      t("dash.reasoningSub", { value: metric(summary.reasoning_tokens) }),
      sparkOf("total_tokens"),
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.inputTokens"),
      "down",
      compact(input),
      metric(input),
      t("dash.shareOf", { pct: share(input, total) ?? "—" }),
      sparkOf("input_tokens"),
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.outputTokens"),
      "up",
      compact(summary.output_tokens),
      metric(number(summary.output_tokens)),
      t("dash.shareOf", { pct: share(number(summary.output_tokens), total) ?? "—" }),
      sparkOf("output_tokens"),
      "var(--series-tokens)",
    ],
    [
      t("dash.kpi.cacheTokens"),
      "cache",
      compact(cacheTotal),
      metric(cacheTotal),
      t("dash.cacheHitRate", { pct: share(cacheRead, input) ?? "—" }),
      cacheSpark,
      "var(--series-tokens)",
    ],
  ];
  return (
    <div className={s.kpiGrid}>
      {cards.map(([label, icon, value, exactText, sub, spark, color]) => (
        <section className={s.kpiCard} key={label}>
          <div>
            <span>{label}</span>
            <span>
              <Icon name={icon} />
            </span>
          </div>
          <KpiValue label={label} display={value} exact={exactText} />
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

const LEFT = 40,
  HOUR_STEP = 3600,
  RIGHT_PAD = 88,
  NARROW_RIGHT_PAD = 46,
  TOP = 14,
  BOTTOM = 168,
  CHART_HEIGHT = 210;

export function UsageTrend({
  rows,
  hourlyRows,
  hourlyPartial = false,
  granularity = "day",
  partial = false,
}: {
  rows: RecordValue[];
  hourlyRows?: RecordValue[];
  hourlyPartial?: boolean;
  granularity?: string;
  partial?: boolean;
}) {
  const t = useT();
  const id = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // ViewBox matches the rendered pixel width, so SVG text/lines keep their
  // designed size and tooltip percentages line up with the cursor.
  const [width, setWidth] = useState(780);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(320, Math.round(entries[0].contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const narrow = width < 520;
  const RIGHT = Math.max(LEFT + 60, width - (narrow ? NARROW_RIGHT_PAD : RIGHT_PAD));
  const [selection, setSelection] = useState<{ rows: RecordValue[]; index: number } | null>(null);
  const [zoom, setZoom] = useState<{ rows: RecordValue[]; domain: [number, number] } | null>(null);
  const domain = zoom?.rows === rows ? zoom.domain : null;
  const setDomain = (d: [number, number] | null) => setZoom(d ? { rows, domain: d } : null);

  const bucketsValid =
    rows.length > 2 &&
    number(rows[0].bucket) !== null &&
    (number(rows.at(-1)?.bucket) ?? 0) > (number(rows[0].bucket) ?? 0);
  const fullStart = bucketsValid ? Number(rows[0].bucket) : 0;
  const fullEnd = bucketsValid ? Number(rows.at(-1)?.bucket) : rows.length - 1;
  const step = granularity === "hour" ? 3600 : 86400;

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !bucketsValid) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (!rect.width) return;
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - LEFT) / (RIGHT - LEFT)));
      setZoom((prev) => {
        const current = prev?.rows === rows ? prev.domain : null;
        const [ds, de] = current ?? [fullStart, fullEnd];
        const span = de - ds;
        const fullSpan = fullEnd - fullStart;
        const minSpan = (hourlyRows?.length ? HOUR_STEP : step) * 4;
        const next = Math.min(fullSpan, Math.max(minSpan, span * (e.deltaY < 0 ? 0.75 : 1.3)));
        if (next >= fullSpan) return null;
        const anchor = ds + frac * span;
        let start = anchor - frac * next;
        start = Math.min(fullEnd - next, Math.max(fullStart, start));
        return { rows, domain: [start, start + next] };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  if (!rows.length)
    return <Empty title={partial ? t("trend.partialRange") : t("trend.emptyRange")} />;

  const [ds, de] = domain ?? [fullStart, fullEnd];
  // Zooming into a narrow window swaps in hourly buckets; zooming back out
  // returns to the daily series, so the curve always uses fitting granularity.
  const hourlyInWindow =
    domain && granularity !== "hour" && hourlyRows?.length
      ? hourlyRows.filter((r) => {
          const b = number(r.bucket);
          return b === null || (b >= ds - HOUR_STEP / 2 && b <= de + HOUR_STEP / 2);
        }).length
      : 0;
  const displayRows =
    domain && de - ds <= 48 * HOUR_STEP && hourlyInWindow >= 4 ? (hourlyRows ?? rows) : rows;
  const displayPartial = displayRows === rows ? partial : hourlyPartial;
  const displayStep = displayRows === rows ? step : HOUR_STEP;
  const active = selection?.rows === displayRows ? selection.index : null;
  const visible = displayRows.filter((r) => {
    const b = number(r.bucket);
    return b === null || (b >= ds - displayStep / 2 && b <= de + displayStep / 2);
  });
  const maxOf = (key: string) => Math.max(1, ...visible.map((r) => number(r[key]) ?? 0));
  const maxima: Record<string, number> = Object.fromEntries(
    TREND_SERIES.map(({ key }) => [key, maxOf(key)]),
  );
  const xAt = (index: number) => {
    if (displayRows.length === 1) return (LEFT + RIGHT) / 2;
    const b = number(displayRows[index].bucket);
    if (bucketsValid && b !== null) return LEFT + ((b - ds) * (RIGHT - LEFT)) / (de - ds);
    return LEFT + (index * (RIGHT - LEFT)) / (displayRows.length - 1);
  };
  const yAt = (key: string, index: number) =>
    BOTTOM - ((number(displayRows[index][key]) ?? 0) / (maxima[key] ?? 1)) * (BOTTOM - TOP);
  const pathOf = (key: string) =>
    smoothPath(displayRows.map((_, i): [number, number] => [xAt(i), yAt(key, i)]));
  const choose = (index: number) =>
    setSelection({
      rows: displayRows,
      index: Math.max(0, Math.min(displayRows.length - 1, index)),
    });
  const pointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) * width) / rect.width;
    let closest = 0;
    for (let i = 1; i < displayRows.length; i++)
      if (Math.abs(x - xAt(i)) < Math.abs(x - xAt(closest))) closest = i;
    const tolerance = bucketsValid ? ((RIGHT - LEFT) * displayStep) / (de - ds) / 2 : 30;
    if (displayPartial && Math.abs(x - xAt(closest)) > tolerance) setSelection(null);
    else choose(closest);
  };
  const selected = active === null ? null : displayRows[active];
  const ticks = [0, 1, 2, 3, 4];
  return (
    <>
      <div className={s.chartHead}>
        <div className={s.chartLegend}>
          {TREND_SERIES.map(({ key, labelKey, color }) => (
            <span key={key}>
              <i className={s.legendDot} style={{ background: color }} />
              {t(labelKey)}
            </span>
          ))}
        </div>
        {domain ? (
          <button type="button" className={s.zoomReset} onClick={() => setDomain(null)}>
            {t("dash.zoomReset")}
          </button>
        ) : (
          bucketsValid && <span className={s.zoomHint}>{t("dash.zoomHint")}</span>
        )}
      </div>
      <div className={s.chartInteractive} ref={wrapRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          className={s.chart}
          role="img"
          tabIndex={0}
          aria-label={
            displayRows !== rows || granularity === "hour"
              ? t("dash.usageTrend.hourly")
              : t("dash.usageTrend.daily")
          }
          aria-describedby={`${id}-hint${selected ? ` ${id}-tooltip` : ""}`}
          onPointerMove={pointer}
          onPointerDown={pointer}
          onDoubleClick={() => setDomain(null)}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") setSelection(null);
          }}
          onFocus={() => choose(0)}
          onBlur={() => setSelection(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setSelection(null);
              setDomain(null);
              return;
            }
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
            e.preventDefault();
            choose(
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? displayRows.length - 1
                  : (active ?? 0) + (e.key === "ArrowRight" ? 1 : -1),
            );
          }}
        >
          <text x={LEFT} y={BOTTOM + 18} textAnchor="start">
            {text(visible[0]?.date ?? displayRows[0].date)}
          </text>
          {displayRows.length > 1 && (
            <text x={RIGHT} y={BOTTOM + 18} textAnchor="end">
              {text(visible.at(-1)?.date ?? displayRows.at(-1)?.date)}
            </text>
          )}
          <clipPath id={`${id}-clip`}>
            <rect x={LEFT} y={0} width={RIGHT - LEFT} height={BOTTOM + 6} />
          </clipPath>
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
                  {compact(Math.round((maxima.requests * i) / 4))}
                </text>
                <text x={RIGHT + 6} y={y + 3} fill="var(--series-credit)">
                  {compact((maxima.credit * i) / 4)}
                </text>
                {!narrow && (
                  <text x={RIGHT + 48} y={y + 3} fill="var(--series-tokens)">
                    {compact((maxima.total_tokens * i) / 4)}
                  </text>
                )}
              </g>
            );
          })}
          <g clipPath={`url(#${id}-clip)`}>
            {displayRows.length > 1 &&
              !displayPartial &&
              TREND_SERIES.map(({ key, color }) => (
                <path
                  key={key}
                  data-series={key}
                  d={pathOf(key)}
                  stroke={color}
                  strokeWidth="1.75"
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            {visible.length <= 62 &&
              TREND_SERIES.map(({ key, color }) => (
                <g key={key} data-series={key}>
                  {displayRows.map((_, i) => (
                    <circle key={i} cx={xAt(i)} cy={yAt(key, i)} r="2" fill={color} />
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
          </g>
        </svg>
        {selected && active !== null && (
          <div
            className={s.chartTooltip}
            id={`${id}-tooltip`}
            role="tooltip"
            style={{
              left: `${Math.min(96, Math.max(4, (xAt(active) / width) * 100))}%`,
            }}
            data-edge={
              xAt(active) / width < 0.15 ? "left" : xAt(active) / width > 0.85 ? "right" : "center"
            }
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
      <p className={s.srOnly} id={`${id}-hint`}>
        指向或点按查看时段；滚轮缩放区间，双击或 Esc 复位；键盘左右方向键逐点查看，Home 和 End
        跳到首尾。
      </p>
      <details className={s.chartData}>
        <summary>{t("dash.trendData")}</summary>
        <table>
          <thead>
            <tr>
              <th>
                {displayRows !== rows || granularity === "hour" ? "时段（UTC）" : "日期（UTC）"}
              </th>
              <th>{t("dash.kpi.requests")}</th>
              <th>{t("dash.kpi.totalTokens")}</th>
              <th>{t("dash.kpi.credit")}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r, i) => (
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
