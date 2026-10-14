import { useState } from "react";
import { list, metric, number, object, text, useResource, type RecordValue } from "../api";
import {
  Badge,
  Empty,
  Fields,
  Icon,
  PageTitle,
  Panel,
  ResourceState,
  profileLabel,
} from "../components";
import s from "../ui.module.scss";
function normalize(value: unknown): RecordValue & {
  summary: RecordValue;
  previous: RecordValue | null;
  series: RecordValue[];
  models: RecordValue[];
  profiles: RecordValue[];
  health: RecordValue;
  storage: RecordValue;
  range: RecordValue;
} {
  const d = object(value);
  for (const field of ["series", "models", "profiles"]) {
    if (list(d[field], field).some((row) => number(row.requests) === null))
      throw new Error(`${field} 中存在未知请求量，不能绘制为 0`);
  }
  return {
    ...d,
    summary: object(d.summary, t("dash.summary")),
    previous:
      d.previous === null || d.previous === undefined ? null : object(d.previous, "上周期汇总"),
    series: list(d.series, "趋势"),
    models: list(d.models, "模型排行"),
    profiles: list(d.profiles, t("dash.profileUsage")),
    health: object(d.health, "健康状态"),
    storage: object(d.storage, "存储状态"),
    range: d.range === undefined ? {} : object(d.range, t("dash.window")),
  };
}
function Health({ data }: { data: RecordValue }) {
  const t = useT();
  if (!Array.isArray(data.credentials)) return <Fields data={data} />;
  const credentials = list(data.credentials);
  if (!credentials.length) return <Empty title={t("dash.credentialHealthEmpty")} />;
  return (
    <div className={`${s.healthList} ${s.panelScroll}`}>
      {credentials.map((c, i) => (
        <div key={i}>
          <div>
            <strong>{text(c.name ?? c.filename)}</strong>
            <small>{profileLabel(text(c.profile))}</small>
          </div>
          <div>
            <Badge tone={c.enabled === false ? "neutral" : c.health === "ready" ? "good" : "warn"}>
              {c.enabled === false
                ? t("dash.status.manual")
                : c.health === "ready"
                  ? t("dash.status.ready")
                  : text(c.health)}
            </Badge>
            {Array.isArray(c.cooldowns) && c.cooldowns.length > 0 && (
              <small>{t("dash.modelCooldowns", { n: c.cooldowns.length })}</small>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
function OfficialCredits({ value }: { value: unknown }) {
  const t = useT();
  const rows = Object.entries(object(value));
  if (!rows.length) return <Empty title={t("dash.balanceSnapshotEmpty")} />;
  return (
    <div className={`${s.tableWrap} ${s.panelScroll}`}>
      <table>
        <thead>
          <tr>
            <th>{t("dash.credentials")}</th>
            <th>{t("dash.balance")}</th>
            <th>{t("dash.syncStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, value]) => {
            const row = object(value);
            const credits = row.credits ? object(row.credits) : null;
            return (
              <tr key={key}>
                <td>{typeof row.name === "string" ? row.name : key.split(/[\\/]/).at(-1)}</td>
                <td>
                  {credits?.unlimited && credits?.enterprise
                    ? t("dash.unlimited")
                    : metric(credits?.credits ?? credits?.remaining)}
                </td>
                <td>
                  {row.error ? (
                    <Badge tone="warn">{t("dash.status.syncError")}</Badge>
                  ) : (
                    <span>
                      {typeof row.fetched_at === "number"
                        ? new Date(row.fetched_at * 1000).toLocaleString("zh-CN")
                        : t("dash.syncTimeUnknown")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
import { KpiCards, UsageTrend } from "../UsageOverview";
import { t, useT } from "../i18n";
export { Trend } from "../Trend";
export function Dashboard() {
  const t = useT();
  const [days, setDays] = useState("7");
  const [granularity, setGranularity] = useState("auto");
  const resource = useResource(`/dashboard?days=${days}&granularity=${granularity}`, normalize);
  // Hourly buckets power the trend's zoom-in granularity swap.
  const hourly = useResource(`/dashboard?days=${days}&granularity=hour`, normalize);
  const d = resource.data;
  const period = d?.range ?? {};
  const actualGrain = period.granularity === "hour" ? "hour" : "day";
  return (
    <>
      <PageTitle
        title={t("dash.runtime")}
        actions={
          <>
            <select
              aria-label={t("dash.range")}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            >
              {["1", "7", "30", "90"].map((n) => (
                <option value={n} key={n}>
                  {t("dash.lastNDays", { n })}
                </option>
              ))}
            </select>
            <select
              aria-label={t("dash.granularity")}
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
            >
              <option value="auto">{t("dash.granularityAuto")}</option>
              <option value="hour">{t("dash.granularityHour")}</option>
              <option value="day">{t("dash.granularityDay")}</option>
            </select>
            <button onClick={resource.reload}>
              <Icon name="refresh" />
              {t("dash.refresh")}
            </button>
          </>
        }
      />
      <ResourceState {...resource} />
      {d && (
        <>
          {(d.degraded === true || d.storage.degraded === true) && (
            <div className={s.warning} role="alert">
              {t("dash.storageDegraded")}
            </div>
          )}
          <KpiCards summary={d.summary} previous={d.previous} series={d.series} />
          <Panel title={t("dash.usageTrend")} hint={t("dash.usageTrendHint")} className={s.trend}>
            {period.partial === true && (
              <p className={s.note} role="status">
                {t("dash.storagePartial")}
              </p>
            )}
            <UsageTrend
              rows={d.series}
              hourlyRows={hourly.data?.series}
              granularity={actualGrain}
              partial={period.partial === true}
            />
          </Panel>
          <div className={s.dashboardGrid}>
            <Panel title={t("dash.profileUsage")} hint={t("dash.granularityByRequests")}>
              {d.profiles.length ? (
                <div className={s.distribution}>
                  {d.profiles.map((p, i) => {
                    const total = d.profiles.reduce((sum, r) => sum + (number(r.requests) ?? 0), 0);
                    const count = number(p.requests);
                    return (
                      <div key={i}>
                        <div>
                          <strong>{profileLabel(text(p.profile))}</strong>
                          <span>{metric(p.requests)}</span>
                        </div>
                        <progress
                          max={total || 1}
                          value={count ?? 0}
                          aria-label={`${profileLabel(text(p.profile))} ${t("dash.shareOfRequests")}`}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty title={t("dash.profileUsageEmpty")} />
              )}
            </Panel>
            <Panel title={t("dash.modelRank")}>
              {d.models.length ? (
                <div className={`${s.tableWrap} ${s.panelScroll}`}>
                  <table>
                    <thead>
                      <tr>
                        <th>{t("dash.models")}</th>
                        <th>{t("dash.requests")}</th>
                        <th>Token</th>
                        <th>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...d.models]
                        .sort((a, b) => (number(b.requests) ?? -1) - (number(a.requests) ?? -1))
                        .slice(0, 10)
                        .map((m, i) => (
                          <tr key={i}>
                            <td>
                              <span className={s.rank}>{String(i + 1).padStart(2, "0")}</span>
                              <strong>{text(m.model) || t("dash.unknownModel")}</strong>
                            </td>
                            <td>{metric(m.requests)}</td>
                            <td>{metric(m.total_tokens)}</td>
                            <td>{metric(m.credit)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty title={t("dash.modelRankEmpty")} />
              )}
            </Panel>
            <Panel title={t("dash.credentialHealth")}>
              <Health data={d.health} />
            </Panel>
            <Panel title={t("dash.balanceTitle")}>
              <p className={s.note}>{t("dash.balanceNote")}</p>
              {d.official_credits !== undefined ? (
                <OfficialCredits value={d.official_credits} />
              ) : (
                <p className={s.muted}>{t("dash.balanceEmpty")}</p>
              )}
            </Panel>
          </div>
          <p className={s.updated}>
            {t("dash.updatedAt")}{" "}
            {typeof d.generated_at === "number"
              ? new Date(d.generated_at * 1000).toLocaleString("zh-CN")
              : text(d.generated_at)}{" "}
          </p>
        </>
      )}
    </>
  );
}
