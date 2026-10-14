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
    <div className={s.healthList}>
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
    <div className={s.tableWrap}>
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
function bytes(value: unknown) {
  const n = number(value);
  if (n === null) return t("dash.storage.unknown");
  if (n < 1024) return `${metric(n)} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1048576).toFixed(1)} MiB`;
}
import { Trend } from "../Trend";
import { t, useT } from "../i18n";
export { Trend } from "../Trend";
export function Dashboard() {
  const t = useT();
  const [days, setDays] = useState("7");
  const [granularity, setGranularity] = useState("auto");
  const resource = useResource(`/dashboard?days=${days}&granularity=${granularity}`, normalize);
  const d = resource.data;
  const period = d?.range ?? {};
  const actualGrain = period.granularity === "hour" ? "hour" : "day";
  const rate = number(d?.summary.success_rate);
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
          <div className={s.stats}>
            {[
              [t("dash.totalRequests"), metric(d.summary.requests), "arrow"],
              [
                t("dash.successRate"),
                rate === null ? t("dash.storage.unknown") : `${(rate * 100).toFixed(1)}%`,
                "shield",
              ],
              [t("dash.totalTokens"), metric(d.summary.total_tokens), "model"],
              [t("dash.storage.credits"), metric(d.summary.credit), "leaf"],
            ].map(([label, value, icon]) => (
              <section className={s.stat} key={label}>
                <div>
                  {label}
                  <span>
                    <Icon name={icon} />
                  </span>
                </div>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <div className={s.dashboardGrid}>
            <Panel
              title={t("dash.trend")}
              hint={t("dash.rangeHint", {
                n: days,
                grain:
                  actualGrain === "hour" ? t("dash.granularityHour") : t("dash.granularityDay"),
              })}
              className={s.trend}
            >
              {period.partial === true && (
                <p className={s.note} role="status">
                  {t("dash.storagePartial")}
                </p>
              )}
              <Trend rows={d.series} granularity={actualGrain} partial={period.partial === true} />
            </Panel>
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
                <div className={s.tableWrap}>
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
            <Panel title={t("dash.storage")}>
              <div className={s.storageOverview}>
                <Badge
                  tone={
                    d.storage.degraded === true
                      ? "bad"
                      : d.storage.degraded === false
                        ? "good"
                        : "neutral"
                  }
                >
                  {d.storage.degraded === true
                    ? t("dash.storage.collectDegraded")
                    : d.storage.degraded === false
                      ? t("dash.status.normal")
                      : t("dash.status.unknown")}
                </Badge>
                <span>
                  {t("dash.storage.detailsLine", {
                    used: bytes(d.storage.logical_bytes),
                    max: bytes(d.storage.max_bytes),
                  })}
                </span>
              </div>
              <Fields
                data={{
                  数据库文件: bytes(d.storage.db_bytes),
                  "WAL 文件": bytes(d.storage.wal_bytes),
                  "SHM 文件": bytes(d.storage.shm_bytes),
                  保留天数: metric(d.storage.retention_days),
                  清理状态:
                    d.storage.pending_cleanup === true
                      ? t("dash.status.batch")
                      : d.storage.pending_cleanup === false
                        ? t("dash.status.done")
                        : t("dash.storage.unknown"),
                }}
              />
              <details className={s.chartData}>
                <summary>{t("dash.storageDiagnose")}</summary>
                <Fields data={d.storage} />
              </details>
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
