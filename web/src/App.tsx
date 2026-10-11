import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { api, establishSession, errorMessage, useSession } from "./api";
import { ErrorNotice, Icon } from "./components";
import { Dashboard } from "./pages/Dashboard";
import { Models } from "./pages/Models";
import { Credentials } from "./pages/Credentials";
import { Logs } from "./pages/Logs";
import { Settings } from "./pages/Settings";
import { Appearance } from "./appearance";
import s from "./ui.module.scss";
import { LanguageProvider, LanguageToggle, useT } from "./i18n";

const navigation = [
  ["", "nav.overview", "grid"],
  ["/models", "nav.models", "model"],
  ["/credentials", "nav.credentials", "key"],
  ["/logs", "nav.logs", "logs"],
  ["/settings", "nav.settings", "settings"],
];
export function Guard() {
  const t = useT();
  const { status, error } = useSession();
  if (status === "checking")
    return (
      <div className={s.center} role="status">
        {t("app.verifying")}
      </div>
    );
  if (status === "error")
    return (
      <div className={s.center}>
        <ErrorNotice
          message={error}
          retry={() => {
            void establishSession();
          }}
        />
        <NavLink to="/dashboard/login">{t("app.backToSignIn")}</NavLink>
      </div>
    );
  return status === "authenticated" ? <Outlet /> : <Navigate to="/dashboard/login" replace />;
}
function Shell() {
  const t = useT();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("codebuddy.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });
  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("codebuddy.sidebar.collapsed", String(next));
    } catch {
      /* Session-only preference when storage is unavailable. */
    }
  };
  return (
    <div className={`${s.app} ${collapsed ? s.collapsed : ""}`}>
      <a href="#main" className={s.skip}>
        {t("app.skip")}
      </a>
      <aside className={s.sidebar}>
        <div className={s.sidebarHead}>
          <NavLink className={s.brand} to="/dashboard" aria-label={t("app.brandAria")}>
            <span className={s.brandIcon}>
              <Icon name="leaf" />
            </span>
            <span className={s.brandText}>
              CodeBuddy<small>{t("app.brandSubtitle")}</small>
            </span>
          </NavLink>
          <LanguageToggle />
          <button
            className={s.sidebarToggle}
            onClick={toggleSidebar}
            aria-label={collapsed ? t("app.expandSidebar") : t("app.collapseSidebar")}
            aria-expanded={!collapsed}
            aria-controls="workspace-navigation"
            title={collapsed ? t("app.expandSidebar") : t("app.collapseSidebar")}
          >
            <Icon name={collapsed ? "expand" : "collapse"} />
          </button>
        </div>
        <p className={s.navLabel}>{t("app.workspace")}</p>
        <nav id="workspace-navigation" aria-label={t("app.primaryNav")}>
          {navigation.map(([path, labelKey, icon]) => {
            const label = t(labelKey);
            return (
              <NavLink
                key={path}
                to={`/dashboard${path}`}
                end={path === ""}
                aria-label={label}
                title={collapsed ? label : undefined}
                data-label={label}
                className={({ isActive }) => `${s.navItem} ${isActive ? s.active : ""}`}
              >
                <Icon name={icon} />
                <span className={s.navText}>{label}</span>
                <span className={s.navArrow}>
                  <Icon name="arrow" />
                </span>
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className={s.workspace}>
        <header className={s.header}>
          <span>
            {t("app.workspace")} <span className={s.separator}>/</span>{" "}
            {navigation.find(([path]) => `/dashboard${path}` === location.pathname)?.[1] ??
              "nav.overview"}
          </span>
          <div className={s.actions}>
            <Appearance />
            <span className={s.session}>
              <span />
              {t("app.sessionActive")}
            </span>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void api
                  .delete("/session")
                  .then(() => useSession.setState({ status: "anonymous", csrf: null, error: null }))
                  .catch((err: unknown) => setError(errorMessage(err)))
                  .finally(() => setBusy(false));
              }}
            >
              {t("app.signOut")}
            </button>
          </div>
        </header>
        <main id="main" className={s.main}>
          <ErrorNotice message={error} />
          <Outlet />
        </main>
        <footer className={s.footer}>CodeBuddy2API</footer>
      </div>
    </div>
  );
}
function Login() {
  const t = useT();
  const status = useSession((state) => state.status);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === "authenticated") return <Navigate to="/dashboard" replace />;
  return (
    <div className={s.login}>
      <div className={s.loginAppearance}>
        <LanguageToggle />
        <Appearance />
      </div>
      <section className={s.loginIntro}>
        <div className={s.brand}>
          <span className={s.brandIcon}>
            <Icon name="leaf" />
          </span>
          CodeBuddy
        </div>
        <h1>{t("login.subtitle")}</h1>
        <div className={s.loginOrbit}>
          <Icon name="leaf" />
        </div>
      </section>
      <section className={s.loginCard}>
        <Icon name="shield" />
        <h2>{t("login.title")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const value = key;
            setKey("");
            void establishSession(value)
              .catch((err: unknown) => setError(errorMessage(err)))
              .finally(() => setBusy(false));
          }}
        >
          <label className={s.field}>
            API key
            <input
              type="password"
              name="api-key"
              autoComplete="off"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t("login.keyPlaceholder")}
            />
          </label>
          <ErrorNotice message={error} />
          <button className={s.primary} disabled={busy || !key.trim()}>
            {busy ? t("login.verifying") : t("login.enter")}
            <Icon name="arrow" />
          </button>
        </form>
      </section>
    </div>
  );
}
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/dashboard/login" element={<Login />} />
      <Route element={<Guard />}>
        <Route path="/dashboard" element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="models" element={<Models />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="logs" element={<Logs />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
export default function App() {
  useEffect(() => {
    void establishSession();
  }, []);
  return (
    <LanguageProvider>
      <AppRoutes />
    </LanguageProvider>
  );
}
