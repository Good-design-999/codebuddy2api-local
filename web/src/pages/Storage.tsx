import { useState } from "react";
import { api, errorMessage, number, object, text, useResource } from "../api";
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
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  return (
    <Panel title="归档旧日志" hint="导出为 JSONL 后从库中删除，统计聚合不受影响">
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
              const d = object(response.data, "归档结果");
              const count = (number(d.archived_requests) ?? 0) + (number(d.archived_events) ?? 0);
              setResult(
                count === 0
                  ? `没有早于 ${days} 天的日志可归档`
                  : `已归档 ${count} 条到 ${text(d.file)}`,
              );
              reload();
            })
            .catch((err: unknown) => setError(errorMessage(err)))
            .finally(() => setBusy(false));
        }}
      >
        <label className={s.field}>
          归档早于（天）
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
          />
        </label>
        <button className={s.primary} disabled={busy}>
          {busy ? "正在归档…" : "归档并删除"}
        </button>
      </form>
      {result && <p className={s.resultNote}>{result}</p>}
      <ErrorNotice message={error} />
    </Panel>
  );
}

export function Storage() {
  const resource = useResource("/storage", normalize);
  const [clearing, setClearing] = useState(false);
  const d = resource.data;
  const reclaimable = number(d?.reclaimable_bytes);
  return (
    <>
      <PageTitle title="存储管理" description="日志库体积、归档、清理与压缩指引。" />
      <ResourceState {...resource} />
      {d && (
        <div className={s.dashboardGrid}>
          <Panel title="存储状态">
            <Badge tone={d.degraded === true ? "bad" : d.degraded === false ? "good" : "neutral"}>
              {d.degraded === true ? "存储异常" : d.degraded === false ? "正常" : "状态未知"}
            </Badge>
            <div className={s.storageGrid}>
              <div>
                <span>数据库文件</span>
                <strong>{bytes(d.db_bytes)}</strong>
              </div>
              <div>
                <span>WAL 文件</span>
                <strong>{bytes(d.wal_bytes)}</strong>
              </div>
              <div>
                <span>日志逻辑占用</span>
                <strong>{bytes(d.logical_bytes)}</strong>
              </div>
              <div>
                <span>可回收空间</span>
                <strong>{bytes(d.reclaimable_bytes)}</strong>
              </div>
            </div>
            <small>
              请求 {number(d.request_count) ?? "—"} 条 · 事件 {number(d.event_count) ?? "—"} 条 ·
              保留 {number(d.retention_days) ?? "—"} 天
              {d.pending_cleanup === true ? " · 有待清理数据" : ""}
            </small>
          </Panel>
          <Panel title="清理">
            <p>在线删除日志明细或全部日志与统计；全部清理需要确认文本与当前 API key。</p>
            <button onClick={() => setClearing(true)}>打开清理</button>
          </Panel>
          <ArchivePanel reload={resource.reload} />
          <Panel title="归档文件">
            {Array.isArray(d.archives) && d.archives.length ? (
              <ul className={s.archiveList}>
                {d.archives.map((name) => (
                  <li key={String(name)}>{text(name)}</li>
                ))}
              </ul>
            ) : (
              <Empty title="暂无归档" />
            )}
          </Panel>
          <Panel title="压缩数据库">
            <p>
              删除与归档释放的空间留在 SQLite 空闲页中
              {reclaimable !== null && reclaimable > 0
                ? `（当前约可回收 ${bytes(reclaimable)}）`
                : ""}
              。VACUUM 需要独占锁，不能在网关运行中执行，请按以下步骤操作：
            </p>
            <pre className={s.codeBlock}>
              {`# 1. 停止网关
docker compose down        # 本地部署则停止 converter 进程

# 2. 压缩（在部署目录执行）
sqlite3 auth/logs.sqlite3 "PRAGMA wal_checkpoint(TRUNCATE); VACUUM;"

# 3. 重启网关
docker compose up -d`}
            </pre>
            <small>压缩期间网关不可用；统计聚合保存在同一库中，VACUUM 不影响数据。</small>
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
