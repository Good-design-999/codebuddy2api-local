import { useState } from "react";
import { api, errorMessage, number, object, text, useResource } from "../api";
import { useT } from "../i18n";
import {
  Badge,
  ClearLogs,
  DrawerPresence,
  Empty,
  ErrorNotice,
  Icon,
  PageTitle,
  Panel,
  ResourceState,
} from "../components";
import s from "../ui.module.scss";

function normalize(value: unknown) {
  return object(value, "存储状态");
}

function bytes(value: unknown): string {
  const n = number(value);
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function ArchivePanel({ archives, reload }: { archives: unknown[]; reload: () => void }) {
  const t = useT();
  // Default shorter than the 30-day retention window so opening the page (which
  // prunes expired rows) still leaves older in-retention logs to archive.
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  return (
    <Panel title={t("storage.archive")} hint={t("storage.archiveHint")}>
      <div className={s.panelBody}>
        <form
          className={s.archiveForm}
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            setResult(null);
            void api
              .post("/storage/archive", { days })
              .then((response) => {
                const d = object(response.data, t("storage.archiveResult"));
                const count = (number(d.archived_requests) ?? 0) + (number(d.archived_events) ?? 0);
                setResult(
                  count === 0
                    ? t("storage.archiveEmpty", { days })
                    : t("storage.archiveDone", { count, file: text(d.file) }),
                );
                reload();
              })
              .catch((err: unknown) => setError(errorMessage(err)))
              .finally(() => setBusy(false));
          }}
        >
          <label className={s.field}>
            {t("storage.archiveDays")}
            <input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
            />
          </label>
          <button className={s.primary} disabled={busy}>
            {busy ? t("storage.archiveBusy") : t("storage.archiveSubmit")}
          </button>
        </form>
        {result && <p className={s.resultNote}>{result}</p>}
        <ErrorNotice message={error} />
        <div className={s.storageSection}>
          <div className={s.storageSectionHead}>
            <strong>{t("storage.archives")}</strong>
            <span>{archives.length}</span>
          </div>
          {archives.length ? (
            <ul className={s.archiveList}>
              {archives.map((name) => (
                <li key={String(name)}>{text(name)}</li>
              ))}
            </ul>
          ) : (
            <Empty title={t("storage.archivesEmpty")} />
          )}
        </div>
      </div>
    </Panel>
  );
}

export function Storage() {
  const t = useT();
  const resource = useResource("/storage", normalize);
  const [clearing, setClearing] = useState(false);
  const d = resource.data;
  const reclaimable = number(d?.reclaimable_bytes);
  const archives = Array.isArray(d?.archives) ? d.archives : [];
  const stateLabel =
    d?.degraded === true
      ? t("storage.stateDegraded")
      : d?.degraded === false
        ? t("dash.status.normal")
        : t("storage.stateUnknown");
  return (
    <>
      <PageTitle
        title={t("storage.title")}
        description={t("storage.desc")}
        actions={
          <>
            {d && (
              <Badge tone={d.degraded === true ? "bad" : d.degraded === false ? "good" : "neutral"}>
                {t("storage.status")} · {stateLabel}
              </Badge>
            )}
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
          <div className={s.kpiGrid}>
            <article className={s.kpiCard}>
              <div>
                <span>{t("storage.dbFile")}</span>
                <span>
                  <Icon name="database" />
                </span>
              </div>
              <strong>{bytes(d.db_bytes)}</strong>
              <small>
                {t("storage.counts", {
                  requests: number(d.request_count) ?? "—",
                  events: number(d.event_count) ?? "—",
                  days: number(d.retention_days) ?? "—",
                })}
              </small>
            </article>
            <article className={s.kpiCard}>
              <div>
                <span>{t("storage.walFile")}</span>
                <span>
                  <Icon name="logs" />
                </span>
              </div>
              <strong>{bytes(d.wal_bytes)}</strong>
              <small>SHM {bytes(d.shm_bytes)}</small>
            </article>
            <article className={s.kpiCard}>
              <div>
                <span>{t("storage.logical")}</span>
                <span>
                  <Icon name="cache" />
                </span>
              </div>
              <strong>{bytes(d.logical_bytes)}</strong>
              <small>{d.pending_cleanup === true ? t("storage.pendingCleanup") : stateLabel}</small>
            </article>
            <article className={s.kpiCard}>
              <div>
                <span>{t("storage.reclaimable")}</span>
                <span>
                  <Icon name="leaf" />
                </span>
              </div>
              <strong>{bytes(d.reclaimable_bytes)}</strong>
              <small>
                {number(d.freelist_pages) ?? 0} / {number(d.page_count) ?? 0} pages
              </small>
            </article>
          </div>
          <div className={s.storageSplit}>
            <ArchivePanel archives={archives} reload={resource.reload} />
            <Panel title={t("storage.vacuum")} hint={t("storage.cleanup")}>
              <div className={s.panelBody}>
                <p className={s.storageLead}>
                  {t("storage.vacuumDesc", {
                    reclaimable:
                      reclaimable !== null && reclaimable > 0
                        ? t("storage.vacuumReclaim", { size: bytes(reclaimable) })
                        : "",
                  })}
                </p>
                <pre className={s.codeBlock}>
                  {`${t("storage.step.stop")}
docker compose down        ${t("storage.step.stopLocal")}

${t("storage.step.vacuum")}
sqlite3 "\${CODEBUDDY_AUTH_DIR:-auth}/logs.sqlite3" \\
  "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"

${t("storage.step.restart")}
docker compose up -d`}
                </pre>
                <small className={s.storageSubtle}>{t("storage.vacuumNote")}</small>
                <div className={s.cleanupBox}>
                  <div>
                    <strong>{t("storage.cleanup")}</strong>
                    <p>{t("storage.cleanupDesc")}</p>
                  </div>
                  <button type="button" onClick={() => setClearing(true)}>
                    {t("storage.cleanupOpen")}
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        </>
      )}
      <DrawerPresence>
        {clearing && (
          <ClearLogs onClose={() => setClearing(false)} onDone={() => resource.reload()} />
        )}
      </DrawerPresence>
    </>
  );
}
