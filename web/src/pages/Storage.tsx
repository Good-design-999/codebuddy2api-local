import { useState } from "react";
import { api, errorMessage, number, object, text, useResource } from "../api";
import { useT } from "../i18n";
import {
  Badge,
  ClearLogs,
  DrawerPresence,
  Empty,
  ErrorNotice,
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

function ArchivePanel({ reload }: { reload: () => void }) {
  const t = useT();
  // Default shorter than the 30-day retention window so opening the page (which
  // prunes expired rows) still leaves older in-retention logs to archive.
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  return (
    <Panel title={t("storage.archive")} hint={t("storage.archiveHint")}>
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
    </Panel>
  );
}

export function Storage() {
  const t = useT();
  const resource = useResource("/storage", normalize);
  const [clearing, setClearing] = useState(false);
  const d = resource.data;
  const reclaimable = number(d?.reclaimable_bytes);
  return (
    <>
      <PageTitle title={t("storage.title")} description={t("storage.desc")} />
      <ResourceState {...resource} />
      {d && (
        <div className={s.dashboardGrid}>
          <Panel title={t("storage.status")}>
            <Badge tone={d.degraded === true ? "bad" : d.degraded === false ? "good" : "neutral"}>
              {d.degraded === true
                ? t("storage.stateDegraded")
                : d.degraded === false
                  ? t("dash.status.normal")
                  : t("storage.stateUnknown")}
            </Badge>
            <div className={s.storageGrid}>
              <div>
                <span>{t("storage.dbFile")}</span>
                <strong>{bytes(d.db_bytes)}</strong>
              </div>
              <div>
                <span>{t("storage.walFile")}</span>
                <strong>{bytes(d.wal_bytes)}</strong>
              </div>
              <div>
                <span>{t("storage.logical")}</span>
                <strong>{bytes(d.logical_bytes)}</strong>
              </div>
              <div>
                <span>{t("storage.reclaimable")}</span>
                <strong>{bytes(d.reclaimable_bytes)}</strong>
              </div>
            </div>
            <small>
              {t("storage.counts", {
                requests: number(d.request_count) ?? "—",
                events: number(d.event_count) ?? "—",
                days: number(d.retention_days) ?? "—",
              })}
              {d.pending_cleanup === true ? ` · ${t("storage.pendingCleanup")}` : ""}
            </small>
          </Panel>
          <Panel title={t("storage.cleanup")}>
            <p>{t("storage.cleanupDesc")}</p>
            <button onClick={() => setClearing(true)}>{t("storage.cleanupOpen")}</button>
          </Panel>
          <ArchivePanel reload={resource.reload} />
          <Panel title={t("storage.archives")}>
            {Array.isArray(d.archives) && d.archives.length ? (
              <ul className={s.archiveList}>
                {d.archives.map((name) => (
                  <li key={String(name)}>{text(name)}</li>
                ))}
              </ul>
            ) : (
              <Empty title={t("storage.archivesEmpty")} />
            )}
          </Panel>
          <Panel title={t("storage.vacuum")}>
            <p>
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
sqlite3 ${typeof d.db_path === "string" && d.db_path ? d.db_path : "auth/logs.sqlite3"} "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"

${t("storage.step.restart")}
docker compose up -d`}
            </pre>
            <small>{t("storage.vacuumNote")}</small>
          </Panel>
        </div>
      )}
      <DrawerPresence>
        {clearing && (
          <ClearLogs onClose={() => setClearing(false)} onDone={() => resource.reload()} />
        )}
      </DrawerPresence>
    </>
  );
}
