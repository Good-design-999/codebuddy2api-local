import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import s from "./ui.module.scss";

export type Lang = "zh" | "en";

// Variable keys; both languages ship fully loaded. A missing entry falls back
// to zh and finally to the key itself so partial coverage stays readable.
const zh: Record<string, string> = {
  "app.skip": "跳转到内容",
  "app.workspace": "工作空间",
  "app.primaryNav": "主导航",
  "app.brandSubtitle": "个人管理工作台",
  "app.brandAria": "CodeBuddy 概览",
  "app.expandSidebar": "展开侧栏",
  "app.collapseSidebar": "收起侧栏",
  "app.sessionActive": "会话已认证",
  "app.signOut": "退出登录",
  "app.verifying": "正在验证登录状态…",
  "app.backToSignIn": "返回登录",
  "app.language": "切换语言 / Switch language",
  "nav.overview": "概览",
  "nav.models": "模型路由",
  "nav.credentials": "凭证管理",
  "nav.logs": "日志审计",
  "nav.settings": "系统设置",
  "login.subtitle": "网关管理",
  "login.title": "登录管理控制台",
  "login.keyPlaceholder": "输入当前生效的 API key",
  "login.verifying": "正在验证…",
  "login.enter": "进入工作台",
  "common.retry": "重试",
  "common.empty": "暂无数据",
  "common.loading": "加载中…",
  "common.closeDrawer": "关闭抽屉",
  "common.currentApiKey": "当前 API key",
  "logs.title": "日志审计",
  "logs.refresh": "刷新",
  "logs.clear": "清理日志",
  "logs.tab.request": "请求审计",
  "logs.tab.runtime": "运行事件",
  "logs.tab.admin": "管理操作记录",
  "logs.panel.request": "请求记录",
  "logs.panel.runtime": "运行事件",
  "logs.panel.admin": "管理操作记录",
  "logs.perPage": "每页 50 条",
  "logs.filter.model": "筛选模型",
  "logs.filter.credential": "筛选凭证",
  "logs.filter.profile": "筛选产品",
  "logs.filter.status": "筛选状态",
  "logs.filter.clientIp": "筛选客户端 IP",
  "logs.filter.search": "搜索日志",
  "logs.placeholder.model": "模型 ID",
  "logs.placeholder.credential": "凭证 account_key",
  "logs.placeholder.clientIp": "客户端 IP",
  "logs.placeholder.search": "搜索标识 / 操作…",
  "logs.allProfiles": "全部产品",
  "logs.allStatuses": "全部状态",
  "logs.apply": "应用筛选",
  "logs.reset": "重置",
  "logs.col.time": "时间 / ID",
  "logs.col.action": "操作 / 类型",
  "logs.col.status": "状态",
  "logs.col.duration": "耗时",
  "logs.col.tokens": "Token",
  "logs.viewDetail": "查看详情",
  "logs.prevPage": "上一页",
  "logs.nextPage": "下一页",
  "logs.noMatch": "没有匹配的日志",
  "logs.adjustFilters": "请尝试调整筛选。",
  "logs.degraded": "日志读取已降级，列表可能不完整，请检查审计存储状态。",
  "logs.detailTitle": "日志详情与实际尝试",
  "logs.detailLoading": "正在加载详情…",
  "logs.detailNeedsId": "请求记录缺少 ID，无法加载详情",
  "logs.attempts": "实际尝试",
  "logs.noAttempts": "暂无尝试记录。",
  "logs.attemptN": "尝试 {n}",
  "logs.outcome.success": "成功",
  "logs.outcome.error": "失败",
  "logs.outcome.cancelled": "取消",
  "logs.outcome.warning": "警告",
  "logs.kind.runtime": "运行事件",
  "logs.kind.admin": "管理操作",
  "logs.action.credits": "积分",
  "logs.action.cred": "凭证",
  "logs.action.models": "模型目录",
  "logs.action.usage": "用量",
  "logs.action.checkin": "签到",
  "logs.action.dailychat": "每日对话",
  "logs.action.buddy": "首领",
  "logs.action.buddy_attention": "首领需要关注",
  "logs.action.buddy_consent": "首领同意",
  "logs.action.buddy_agreement": "首领协议",
  "logs.action.buddy_departure": "首领出发",
  "logs.action.buddy_departure_requested": "首领请求出发",
  "logs.action.buddy_first": "首领领取",
  "logs.action.buddy_task_accept": "首领任务接取",
  "logs.action.buddy_task_chat": "首领任务对话",
  "logs.action.buddy_task_completed": "首领任务完成",
  "logs.action.buddy_authorization_used": "首领授权已使用",
  "logs.action.credential_sync": "凭证同步",
  "logs.action.credential_travel": "凭证旅行",
  "logs.action.credential_travel_status": "凭证旅行状态",
  "logs.action.credential_refresh": "凭证刷新",
  "logs.action.credential_checkin": "凭证签到",
  "logs.action.credential_daily_chat": "凭证每日对话",
  "logs.action.credential_auto_daily_chat": "凭证自动每日对话",
  "logs.action.credential_trial": "凭证试用",
  "logs.action.credential_enabled": "凭证启停",
  "logs.action.credential_reset_cooldown": "凭证清除冷却",
  "logs.action.oauth_saved": "OAuth 凭证已保存",
  "logs.action.settings_updated": "设置已更新",
  "logs.action.model_created": "模型已创建",
  "logs.action.model_updated": "模型已更新",
  "logs.action.model_deleted": "模型已删除",
  "dash.refresh": "刷新",
  "dash.runtime": "运行概览",
  "dash.trend": "请求趋势",
  "dash.range": "统计时间范围",
  "dash.granularity": "统计粒度",
  "dash.granularityAuto": "自动粒度",
  "dash.granularityDay": "按天",
  "dash.granularityHour": "按小时",
  "dash.granularityByRequests": "按请求量",
  "dash.summary": "统计",
  "dash.totalRequests": "请求总量",
  "dash.successRate": "成功率",
  "dash.totalTokens": "Token 用量",
  "dash.requests": "请求",
  "dash.models": "模型",
  "dash.modelRank": "模型使用排行",
  "dash.modelRankEmpty": "尚无模型请求记录",
  "dash.profileUsage": "产品分布",
  "dash.profileUsageEmpty": "暂无产品用量",
  "dash.unknownModel": "未识别模型",
  "dash.credentialHealth": "凭证健康",
  "dash.credentialHealthEmpty": "尚未添加凭证",
  "dash.health": "健康状态",
  "dash.balance": "官方余额",
  "dash.balanceNote": "账号余额，并非本网关消费统计。",
  "dash.balanceEmpty": "暂无余额数据，可在凭证管理查看。",
  "dash.balanceSnapshotEmpty": "暂无官方余额快照",
  "dash.syncStatus": "同步状态",
  "dash.syncTimeUnknown": "同步时间未知",
  "dash.status.ready": "就绪",
  "dash.status.done": "已完成",
  "dash.status.normal": "正常",
  "dash.status.manual": "人工停用",
  "dash.status.syncError": "同步异常",
  "dash.status.unknown": "状态未知",
  "dash.status.batch": "分批清理中",
  "dash.storage": "日志存储",
  "dash.storageDegraded": "统计可能不完整，请检查日志存储状态。",
  "dash.storagePartial": "小时记录不完整，仅展示已记录时段；可切换按天查看完整统计。",
  "dash.storageDiagnose": "查看存储诊断",
  "dash.storage.wal": "WAL 文件",
  "dash.storage.shm": "SHM 文件",
  "dash.storage.credits": "网关已知 Credit",
  "dash.storage.creditsNote": "官方账号余额",
  "dash.storage.unknown": "未知",
  "dash.storage.collectDegraded": "采集降级",
  "dash.credentials": "凭证",
  "dash.window": "统计窗口",
  "trend.partialRange": "该范围缺少小时记录",
  "trend.emptyRange": "当前时间范围内暂无请求",
  "dash.trend.daily": "按日请求量趋势",
  "dash.trend.hourly": "按小时请求量趋势",
  "dash.lastNDays": "最近 {n} 天",
  "dash.rangeHint": "最近 {n} 天 · UTC 自然日 · {grain}",
  "dash.updatedAt": "更新于",
  "dash.shareOfRequests": "请求占比",
  "dash.modelCooldowns": "{n} 个模型冷却",
  "dash.storage.cleanupStatus": "清理状态:",
  "dash.storage.detailsLine": "明细 {used} / {max}",
  "dash.balanceTitle": "官方账号余额",
  "logs.clear.scope": "清理范围",
  "logs.clear.detailsOnly": "仅清空明细 · 保留统计",
  "logs.clear.everything": "全部日志与统计",
  "logs.clear.detailsStrong": "仅清空日志明细，保留累计统计",
  "logs.clear.detailsWarning": "将删除请求明细和事件日志，保留历史统计。不可撤销，建议先备份。",
  "logs.clear.allWarning":
    "将永久删除全部请求明细、事件日志和历史统计，不可撤销。建议先备份；凭证及网关配置不受影响。",
  "logs.clear.confirm": "确认不可撤销的清理",
  "logs.clear.busy": "正在清理…",
  "logs.clear.unconfirmed": "后端未确认清理成功，请检查存储状态",
  "logs.http429": "HTTP 429",
  "logs.col.actions": "操作",
  "logs.col.modelProfile": "模型 / 产品",
  "logs.logTypes": "日志类型",
  "logs.pageIncomplete": "日志分页响应不完整",
};

const en: Record<string, string> = {
  "app.skip": "Skip to content",
  "app.workspace": "Workspace",
  "app.primaryNav": "Primary navigation",
  "app.brandSubtitle": "Personal workspace",
  "app.brandAria": "CodeBuddy overview",
  "app.expandSidebar": "Expand sidebar",
  "app.collapseSidebar": "Collapse sidebar",
  "app.sessionActive": "Session active",
  "app.signOut": "Sign out",
  "app.verifying": "Verifying session…",
  "app.backToSignIn": "Back to sign-in",
  "app.language": "切换语言 / Switch language",
  "nav.overview": "Overview",
  "nav.models": "Model routing",
  "nav.credentials": "Credentials",
  "nav.logs": "Audit logs",
  "nav.settings": "Settings",
  "login.subtitle": "Gateway management",
  "login.title": "Sign in to the console",
  "login.keyPlaceholder": "Enter the active API key",
  "login.verifying": "Verifying…",
  "login.enter": "Enter workspace",
  "common.retry": "Retry",
  "common.empty": "Nothing here yet",
  "common.loading": "Loading…",
  "common.closeDrawer": "Close drawer",
  "common.currentApiKey": "Current API key",
  "logs.title": "Audit logs",
  "logs.refresh": "Refresh",
  "logs.clear": "Clear logs",
  "logs.tab.request": "Requests",
  "logs.tab.runtime": "Runtime events",
  "logs.tab.admin": "Admin actions",
  "logs.panel.request": "Request records",
  "logs.panel.runtime": "Runtime events",
  "logs.panel.admin": "Admin action records",
  "logs.perPage": "50 per page",
  "logs.filter.model": "Filter model",
  "logs.filter.credential": "Filter credential",
  "logs.filter.profile": "Filter product",
  "logs.filter.status": "Filter status",
  "logs.filter.clientIp": "Filter client IP",
  "logs.filter.search": "Search logs",
  "logs.placeholder.model": "Model ID",
  "logs.placeholder.credential": "Credential account_key",
  "logs.placeholder.clientIp": "Client IP",
  "logs.placeholder.search": "Search id / action…",
  "logs.allProfiles": "All products",
  "logs.allStatuses": "All statuses",
  "logs.apply": "Apply filters",
  "logs.reset": "Reset",
  "logs.col.time": "Time / ID",
  "logs.col.action": "Action / type",
  "logs.col.status": "Status",
  "logs.col.duration": "Duration",
  "logs.col.tokens": "Tokens",
  "logs.viewDetail": "Details",
  "logs.prevPage": "Previous page",
  "logs.nextPage": "Next page",
  "logs.noMatch": "No matching logs",
  "logs.adjustFilters": "Try adjusting the filters.",
  "logs.degraded": "Log reads are degraded; the list may be incomplete. Check audit storage.",
  "logs.detailTitle": "Log details and attempts",
  "logs.detailLoading": "Loading details…",
  "logs.detailNeedsId": "Request record has no ID; cannot load details",
  "logs.attempts": "Attempts",
  "logs.noAttempts": "No attempts recorded.",
  "logs.attemptN": "Attempt {n}",
  "logs.outcome.success": "Success",
  "logs.outcome.error": "Failed",
  "logs.outcome.cancelled": "Cancelled",
  "logs.outcome.warning": "Warning",
  "logs.kind.runtime": "Runtime event",
  "logs.kind.admin": "Admin action",
  "logs.action.credits": "Credits",
  "logs.action.cred": "Credential",
  "logs.action.models": "Model catalog",
  "logs.action.usage": "Usage",
  "logs.action.checkin": "Check-in",
  "logs.action.dailychat": "Daily chat",
  "logs.action.buddy": "Buddy",
  "logs.action.buddy_attention": "Buddy needs attention",
  "logs.action.buddy_consent": "Buddy consent",
  "logs.action.buddy_agreement": "Buddy agreement",
  "logs.action.buddy_departure": "Buddy departure",
  "logs.action.buddy_departure_requested": "Buddy departure requested",
  "logs.action.buddy_first": "Buddy claimed",
  "logs.action.buddy_task_accept": "Buddy task accepted",
  "logs.action.buddy_task_chat": "Buddy task chat",
  "logs.action.buddy_task_completed": "Buddy task completed",
  "logs.action.buddy_authorization_used": "Buddy authorization used",
  "logs.action.credential_sync": "Credential sync",
  "logs.action.credential_travel": "Credential travel",
  "logs.action.credential_travel_status": "Credential travel status",
  "logs.action.credential_refresh": "Credential refresh",
  "logs.action.credential_checkin": "Credential check-in",
  "logs.action.credential_daily_chat": "Credential daily chat",
  "logs.action.credential_auto_daily_chat": "Credential auto daily chat",
  "logs.action.credential_trial": "Credential trial",
  "logs.action.credential_enabled": "Credential enabled",
  "logs.action.credential_reset_cooldown": "Credential cooldown reset",
  "logs.action.oauth_saved": "OAuth credential saved",
  "logs.action.settings_updated": "Settings updated",
  "logs.action.model_created": "Model created",
  "logs.action.model_updated": "Model updated",
  "logs.action.model_deleted": "Model deleted",
  "dash.refresh": "Refresh",
  "dash.runtime": "Runtime overview",
  "dash.trend": "Request trend",
  "dash.range": "Statistics range",
  "dash.granularity": "Granularity",
  "dash.granularityAuto": "Auto",
  "dash.granularityDay": "By day",
  "dash.granularityHour": "By hour",
  "dash.granularityByRequests": "By requests",
  "dash.summary": "Summary",
  "dash.totalRequests": "Total requests",
  "dash.successRate": "Success rate",
  "dash.totalTokens": "Token usage",
  "dash.requests": "Requests",
  "dash.models": "Models",
  "dash.modelRank": "Model usage ranking",
  "dash.modelRankEmpty": "No model requests yet",
  "dash.profileUsage": "Product distribution",
  "dash.profileUsageEmpty": "No product usage yet",
  "dash.unknownModel": "Unidentified model",
  "dash.credentialHealth": "Credential health",
  "dash.credentialHealthEmpty": "No credentials yet",
  "dash.health": "Health",
  "dash.balance": "Official balance",
  "dash.balanceNote": "Account balance, not this gateway's consumption.",
  "dash.balanceEmpty": "No balance data yet; check credential management.",
  "dash.balanceSnapshotEmpty": "No official balance snapshot",
  "dash.syncStatus": "Sync status",
  "dash.syncTimeUnknown": "Sync time unknown",
  "dash.status.ready": "Ready",
  "dash.status.done": "Completed",
  "dash.status.normal": "Normal",
  "dash.status.manual": "Manually disabled",
  "dash.status.syncError": "Sync error",
  "dash.status.unknown": "Unknown status",
  "dash.status.batch": "Batch cleanup running",
  "dash.storage": "Log storage",
  "dash.storageDegraded": "Statistics may be incomplete; check log storage.",
  "dash.storagePartial":
    "Hourly records are incomplete; only recorded hours are shown. Switch to daily for full totals.",
  "dash.storageDiagnose": "View storage diagnostics",
  "dash.storage.wal": "WAL file",
  "dash.storage.shm": "SHM file",
  "dash.storage.credits": "Gateway-known credits",
  "dash.storage.creditsNote": "Official account balance",
  "dash.storage.unknown": "Unknown",
  "dash.storage.collectDegraded": "Collection degraded",
  "dash.credentials": "Credentials",
  "dash.window": "Statistics window",
  "trend.partialRange": "This range lacks hourly records",
  "trend.emptyRange": "No requests in this range",
  "dash.trend.daily": "Daily request trend",
  "dash.trend.hourly": "Hourly request trend",
  "dash.lastNDays": "Last {n} days",
  "dash.rangeHint": "Last {n} days · UTC days · {grain}",
  "dash.updatedAt": "Updated",
  "dash.shareOfRequests": "share of requests",
  "dash.modelCooldowns": "{n} model cooldowns",
  "dash.storage.cleanupStatus": "Cleanup:",
  "dash.storage.detailsLine": "Details {used} / {max}",
  "dash.balanceTitle": "Official account balance",
  "logs.clear.scope": "Scope",
  "logs.clear.detailsOnly": "Details only · keep aggregates",
  "logs.clear.everything": "All logs and aggregates",
  "logs.clear.detailsStrong": "Clear log details only, keep aggregates",
  "logs.clear.detailsWarning":
    "Deletes request details and event logs, keeping aggregates. Irreversible; back up first.",
  "logs.clear.allWarning":
    "Permanently deletes all request details, event logs and historical aggregates. Irreversible. Back up first; credentials and gateway config are unaffected.",
  "logs.clear.confirm": "Confirm irreversible cleanup",
  "logs.clear.busy": "Clearing…",
  "logs.clear.unconfirmed": "Backend did not confirm the cleanup; check storage state",
  "logs.http429": "HTTP 429",
  "logs.col.actions": "Actions",
  "logs.col.modelProfile": "Model / product",
  "logs.logTypes": "Log types",
  "logs.pageIncomplete": "Log page response incomplete",
};

const messages: Record<Lang, Record<string, string>> = { zh, en };
const STORAGE_KEY = "codebuddy2api.lang";
const LANG_EVENT = "codebuddy.lang";

let currentLang: Lang = "zh";
const LangContext = createContext<Lang>("zh");

export function translate(key: string, vars?: Record<string, string | number>): string {
  const template = messages[currentLang][key] ?? messages.zh[key] ?? key;
  return vars
    ? template.replace(/\{(\w+)\}/g, (name) => String(vars[name.slice(1, -1)] ?? name))
    : template;
}

// Global translator: the provider re-renders the whole tree on language
// change, so plain t() calls stay reactive without per-component hooks.
export const t = translate;
export function useLang(): Lang {
  return useContext(LangContext);
}
export function useT() {
  const lang = useLang();
  return useMemo(
    () => (key: string, vars?: Record<string, string | number>) => translate(key, vars),
    [lang],
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
    } catch {
      return "zh";
    }
  });
  currentLang = lang;
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* Session-only preference when storage is unavailable. */
    }
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);
  useEffect(() => {
    const apply = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "zh" || detail === "en") setLang(detail);
    };
    window.addEventListener(LANG_EVENT, apply);
    return () => window.removeEventListener(LANG_EVENT, apply);
  }, []);
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function LanguageToggle() {
  return (
    <button
      className={s.sidebarToggle}
      onClick={() => {
        const next = currentLang === "zh" ? "en" : "zh";
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: next }));
      }}
      aria-label={translate("app.language")}
      title={translate("app.language")}
    >
      {currentLang === "zh" ? "EN" : "中"}
    </button>
  );
}
