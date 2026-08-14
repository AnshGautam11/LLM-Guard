import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert, ShieldX, Activity, Hash, Lock, LogOut, RefreshCw, Search,
  ChevronRight, ChevronDown, Sliders, ListChecks, KeyRound, User, AlertTriangle,
  ToggleLeft, ToggleRight, Save, RotateCcw, Terminal, Radar,
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS — deliberately distinct from the main console's
   crimson brand. This is meant to read like a NOC/SOC ops tool
   (Splunk, Grafana, a SIEM) rather than a product marketing page:
   near-black background, monospace-forward, green "online" accent.
   ============================================================ */

const T = {
  bg: "#08090a",
  panel: "#0e1110",
  panel2: "#131716",
  border: "#1e2422",
  borderStrong: "#2a3230",
  text: "#e4e9e7",
  textMuted: "#8a9490",
  textFaint: "#54605c",
  accent: "#34d399",
  accentDim: "rgba(52, 211, 153, 0.35)",
  accentSoft: "rgba(52, 211, 153, 0.08)",
  danger: "#f0545c",
  dangerDim: "rgba(240, 84, 92, 0.35)",
  dangerSoft: "rgba(240, 84, 92, 0.09)",
  warn: "#e0a72e",
  warnSoft: "rgba(224, 167, 46, 0.09)",
  mono: "ui-monospace, 'SF Mono', 'IBM Plex Mono', Consolas, monospace",
};

const STORAGE_KEY = "soc_panel_session";

const RISK_TONE = {
  LOW: { c: T.accent, bg: T.accentSoft, bd: T.accentDim },
  MEDIUM: { c: T.warn, bg: T.warnSoft, bd: "rgba(224,167,46,0.35)" },
  HIGH: { c: T.danger, bg: T.dangerSoft, bd: T.dangerDim },
};
const STATUS_TONE = {
  Blocked: { c: T.danger, bg: T.dangerSoft, bd: T.dangerDim },
  "Processed Successfully": { c: T.accent, bg: T.accentSoft, bd: T.accentDim },
  Failed: { c: T.warn, bg: T.warnSoft, bd: "rgba(224,167,46,0.35)" },
};

function Pill({ tone, children }) {
  const t = tone || { c: T.textMuted, bg: T.panel2, bd: T.border };
  return (
    <span
      style={{
        fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em",
        textTransform: "uppercase", padding: "3px 8px", borderRadius: 4,
        color: t.c, background: t.bg, border: `1px solid ${t.bd}`, whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Panel({ children, style }) {
  return (
    <div
      style={{
        background: T.panel, border: `1px solid ${T.border}`, borderRadius: 6,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle = {
  background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 4,
  color: T.text, fontFamily: T.mono, fontSize: 13, padding: "8px 10px",
};

const labelStyle = {
  display: "block", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em",
  color: T.textFaint, fontFamily: T.mono, marginBottom: 5,
};

const btnGhost = {
  background: "transparent", border: `1px solid ${T.border}`, borderRadius: 4,
  color: T.textMuted, fontFamily: T.mono, fontSize: 12, padding: "7px 12px",
  cursor: "pointer",
};

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diffMs / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* ============================================================
   LOGIN SCREEN
   ============================================================ */

function LoginScreen({ onLogin }) {
  const [apiBase, setApiBase] = useState("http://127.0.0.1:8000");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${apiBase.replace(/\/$/, "")}/soc/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }
      onLogin({ ...data, apiBase });
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Couldn't reach the backend. Check the URL and that it's running."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh", background: T.bg, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, justifyContent: "center" }}>
          <Radar size={20} color={T.accent} strokeWidth={2} />
          <span style={{ fontFamily: T.mono, fontSize: 14, letterSpacing: "0.12em", color: T.text, textTransform: "uppercase" }}>
            LLM-Guard // SOC Panel
          </span>
        </div>

        <Panel style={{ padding: 22 }}>
          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Backend URL</label>
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="http://127.0.0.1:8000"
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}><User size={10} style={{ verticalAlign: -1, marginRight: 4 }} />Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}><Lock size={10} style={{ verticalAlign: -1, marginRight: 4 }} />Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...inputStyle, width: "100%" }}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                style={{
                  marginBottom: 14, padding: "8px 10px", borderRadius: 4,
                  background: T.dangerSoft, border: `1px solid ${T.dangerDim}`,
                  color: T.danger, fontSize: 12, display: "flex", gap: 6, alignItems: "flex-start",
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 4, border: "none",
                background: T.accent, color: "#04120c", fontFamily: T.mono, fontWeight: 700,
                fontSize: 13, letterSpacing: "0.03em", cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </Panel>

        <p style={{ textAlign: "center", color: T.textFaint, fontSize: 11, marginTop: 14, lineHeight: 1.6 }}>
          Default account on first run: <code style={{ color: T.textMuted }}>admin</code> /{" "}
          <code style={{ color: T.textMuted }}>changeme-now!</code><br />
          Change it with <code style={{ color: T.textMuted }}>manage_soc_users.py</code> on the backend.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   HELPER CONTROLS FOR THE TUNING PANEL
   ============================================================ */

function ToggleRow({ label, checked, onChange, hint }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "9px 0", borderBottom: `1px solid ${T.border}`,
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, color: T.text }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: T.textFaint, marginTop: 2 }}>{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          background: "transparent", border: "none", cursor: "pointer", padding: 0,
          display: "flex", color: checked ? T.accent : T.textFaint, flexShrink: 0,
        }}
      >
        {checked ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
      </button>
    </div>
  );
}

function SliderRow({ label, hint, value, min, max, step, onChange }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, color: T.text }}>{label}</span>
        <span style={{ fontFamily: T.mono, fontSize: 12, color: T.accent }}>{value.toFixed(1)}</span>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: T.textFaint, marginBottom: 7 }}>{hint}</div>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: T.accent }}
      />
    </div>
  );
}

function NumField({ label, value, onChange, min }) {
  return (
    <div style={{ flex: 1, minWidth: 110 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="number" min={min} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ...inputStyle, width: "100%" }}
      />
    </div>
  );
}

/* ============================================================
   MAIN DASHBOARD
   ============================================================ */

function Dashboard({ session, onLogout }) {
  const { apiBase, token, username, role } = session;

  const [connError, setConnError] = useState("");
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  const [stats, setStats] = useState(null);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const pageSize = 10;

  const [statusFilter, setStatusFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saveMsg, setSaveMsg] = useState("");

  const authedFetch = useCallback(
    async (path, opts = {}) => {
      const res = await fetch(`${apiBase.replace(/\/$/, "")}${path}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(opts.headers || {}),
        },
      });
      if (res.status === 401) {
        onLogout();
        throw new Error("Session expired");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      return res.json();
    },
    [apiBase, token, onLogout]
  );

  const fetchStats = useCallback(async () => {
    try {
      setStats(await authedFetch("/soc/dashboard/stats"));
      setConnError("");
    } catch (e) {
      setConnError(e.message);
    }
  }, [authedFetch]);

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
      if (statusFilter) params.set("status", statusFilter);
      if (riskFilter) params.set("risk_level", riskFilter);
      if (search.trim()) params.set("search", search.trim());
      const data = await authedFetch(`/soc/dashboard/events?${params.toString()}`);
      setEvents(data.events || []);
      setTotal(data.total || 0);
      setConnError("");
    } catch (e) {
      setConnError(e.message);
    } finally {
      setLoadingEvents(false);
    }
  }, [authedFetch, offset, statusFilter, riskFilter, search]);

  const fetchSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const data = await authedFetch("/soc/dashboard/settings");
      setSettings(data);
      setDraft(data);
      setConnError("");
    } catch (e) {
      setConnError(e.message);
    } finally {
      setLoadingSettings(false);
    }
  }, [authedFetch]);

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchEvents();
    fetchSettings();
  }, [fetchStats, fetchEvents, fetchSettings]);

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, statusFilter, riskFilter]);

  const runSearch = () => {
    setOffset(0);
    fetchEvents();
  };

  const patchDraft = (path, value) => {
    setDraft((d) => {
      const next = JSON.parse(JSON.stringify(d));
      let cursor = next;
      for (let i = 0; i < path.length - 1; i++) cursor = cursor[path[i]];
      cursor[path[path.length - 1]] = value;
      return next;
    });
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const data = await authedFetch("/soc/dashboard/settings", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setSettings(data);
      setDraft(data);
      setSaveMsg("Saved — guardrails updated live.");
    } catch (e) {
      setSaveMsg(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 4000);
    }
  };

  const resetSettings = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const data = await authedFetch("/soc/dashboard/settings/reset", { method: "POST" });
      setSettings(data);
      setDraft(data);
      setSaveMsg("Reset to factory-default sensitivity.");
    } catch (e) {
      setSaveMsg(`Reset failed: ${e.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 4000);
    }
  };

  const logout = async () => {
    try {
      await authedFetch("/soc/logout", { method: "POST" });
    } catch (e) {
      // already invalid/expired — fine, just clear locally
    }
    onLogout();
  };

  const dirty = draft && settings && JSON.stringify(draft) !== JSON.stringify(settings);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text }}>
      {/* TOP BAR */}
      <div
        style={{
          borderBottom: `1px solid ${T.border}`, padding: "14px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Radar size={17} color={T.accent} />
          <span style={{ fontFamily: T.mono, fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            SOC Panel
          </span>
          <span style={{ color: T.border }}>/</span>
          <span style={{ fontSize: 12.5, color: T.textMuted, fontFamily: T.mono }}>{apiBase}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: T.textMuted, fontFamily: T.mono }}>
            {username} <Pill tone={{ c: T.accent, bg: T.accentSoft, bd: T.accentDim }}>{role}</Pill>
          </span>
          <button onClick={refreshAll} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={logout} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6, borderColor: T.dangerDim, color: T.danger }}>
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 24px 56px" }}>
        {connError && (
          <div
            style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 6,
              background: T.dangerSoft, border: `1px solid ${T.dangerDim}`,
              color: T.danger, fontSize: 12.5, display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <AlertTriangle size={14} /> {connError}
          </div>
        )}

        {/* STAT CARDS */}
        <div className="soc-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
          {[
            { icon: Hash, label: "Total events", value: stats ? stats.total_events : "—" },
            { icon: ShieldX, label: "Blocked", value: stats ? stats.blocked_total : "—" },
            { icon: Activity, label: "Block rate", value: stats ? `${stats.block_rate_pct}%` : "—" },
            { icon: ShieldAlert, label: "High risk", value: stats ? stats.risk_level_breakdown?.HIGH || 0 : "—" },
          ].map((c, i) => (
            <Panel key={i} style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.textFaint, marginBottom: 8 }}>
                <c.icon size={13} />
                <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: T.mono }}>
                  {c.label}
                </span>
              </div>
              <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 24 }}>{c.value}</div>
            </Panel>
          ))}
        </div>

        {/* MAIN GRID */}
        <div className="soc-grid-2" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
          {/* EVENT REVIEW */}
          <Panel style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <ListChecks size={14} color={T.accent} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>Event review</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <select
                  value={statusFilter}
                  onChange={(e) => { setOffset(0); setStatusFilter(e.target.value); }}
                  style={{ ...inputStyle }}
                >
                  <option value="">All statuses</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Processed Successfully">Processed</option>
                  <option value="Failed">Failed</option>
                </select>
                <select
                  value={riskFilter}
                  onChange={(e) => { setOffset(0); setRiskFilter(e.target.value); }}
                  style={{ ...inputStyle }}
                >
                  <option value="">All risk</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
                <div style={{ display: "flex", flex: 1, minWidth: 140 }}>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                    placeholder="search reason / prompt…"
                    style={{ ...inputStyle, flex: 1, borderRadius: "4px 0 0 4px" }}
                  />
                  <button onClick={runSearch} style={{ ...btnGhost, borderRadius: "0 4px 4px 0", borderLeft: "none" }}>
                    <Search size={12} />
                  </button>
                </div>
              </div>
            </div>

            <div style={{ maxHeight: 540, overflowY: "auto" }}>
              {loadingEvents && (
                <div style={{ padding: 24, textAlign: "center", color: T.textFaint, fontSize: 12.5 }}>Loading…</div>
              )}
              {!loadingEvents && events.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: T.textFaint, fontSize: 12.5 }}>
                  No matching events yet.
                </div>
              )}
              {!loadingEvents && events.map((ev, i) => {
                const rowId = `${ev.timestamp}-${i}`;
                const isOpen = expandedId === rowId;
                return (
                  <div key={rowId} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <div
                      onClick={() => setExpandedId(isOpen ? null : rowId)}
                      style={{ padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <Pill tone={STATUS_TONE[ev.status]}>{ev.status}</Pill>
                      {ev.risk_level && <Pill tone={RISK_TONE[ev.risk_level]}>{ev.risk_level}</Pill>}
                      <span style={{ flex: 1, fontSize: 12, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.reason || ev.ml_prediction || "—"}
                      </span>
                      <span style={{ fontSize: 10.5, color: T.textFaint, fontFamily: T.mono, flexShrink: 0 }}>
                        {timeAgo(ev.timestamp)}
                      </span>
                      {isOpen ? <ChevronDown size={13} color={T.textFaint} /> : <ChevronRight size={13} color={T.textFaint} />}
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 16px 14px", fontSize: 12, color: T.textMuted }}>
                        {ev.original_message && (
                          <div style={{ marginBottom: 7 }}>
                            <span style={{ color: T.textFaint }}>Prompt: </span>
                            <span style={{ fontFamily: T.mono, color: T.text }}>{ev.original_message}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                          {ev.ml_prediction && <span>ML verdict: <b style={{ color: T.text }}>{ev.ml_prediction}</b></span>}
                          {ev.ml_score !== null && ev.ml_score !== undefined && (
                            <span>ML score: <b style={{ color: T.text }}>{ev.ml_score}</b></span>
                          )}
                          {ev.detected_items && ev.detected_items.length > 0 && (
                            <span>PII: <b style={{ color: T.text }}>{ev.detected_items.join(", ")}</b></span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "9px 16px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10.5, color: T.textFaint, fontFamily: T.mono }}>
                {total} event{total === 1 ? "" : "s"} · page {currentPage}/{totalPages}
              </span>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setOffset((o) => Math.max(0, o - pageSize))} disabled={offset === 0} style={{ ...btnGhost, opacity: offset === 0 ? 0.4 : 1 }}>Prev</button>
                <button onClick={() => setOffset((o) => (o + pageSize < total ? o + pageSize : o))} disabled={offset + pageSize >= total} style={{ ...btnGhost, opacity: offset + pageSize >= total ? 0.4 : 1 }}>Next</button>
              </div>
            </div>
          </Panel>

          {/* TUNING PANEL */}
          <Panel style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <Sliders size={14} color={T.accent} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Guardrail sensitivity</span>
            </div>
            <p style={{ fontSize: 11, color: T.textFaint, margin: "4px 0 12px" }}>
              Applies live via <code>PUT /soc/dashboard/settings</code> — no restart needed.
            </p>

            {!draft && (
              <div style={{ fontSize: 12, color: T.textFaint, padding: "18px 0" }}>
                {loadingSettings ? "Loading settings…" : "—"}
              </div>
            )}

            {draft && (
              <>
                <SliderRow
                  label="ML jailbreak threshold"
                  hint="Lower = flags more prompts. Higher = more permissive."
                  value={draft.ml_threshold}
                  min={-3} max={3} step={0.1}
                  onChange={(v) => patchDraft(["ml_threshold"], v)}
                />

                <div style={{ fontSize: 10.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", margin: "13px 0 2px", fontFamily: T.mono }}>
                  Firewall categories
                </div>
                {Object.entries(draft.firewall_categories_enabled || {}).map(([cat, enabled]) => (
                  <ToggleRow
                    key={cat}
                    label={cat.replace(/_/g, " ")}
                    checked={enabled}
                    onChange={(v) => patchDraft(["firewall_categories_enabled", cat], v)}
                  />
                ))}
                <ToggleRow
                  label="role injection guard"
                  hint="Blocks fake system:/assistant: prefixes"
                  checked={draft.role_injection_enabled}
                  onChange={(v) => patchDraft(["role_injection_enabled"], v)}
                />

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <NumField label="Max prompt length" value={draft.max_prompt_length} min={100} onChange={(v) => patchDraft(["max_prompt_length"], v)} />
                </div>

                <div style={{ fontSize: 10.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", margin: "15px 0 2px", fontFamily: T.mono }}>
                  DLP entities scanned
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "7px 0 3px" }}>
                  {Object.entries(draft.dlp_entities_enabled || {}).map(([entity, enabled]) => (
                    <button
                      key={entity}
                      onClick={() => patchDraft(["dlp_entities_enabled", entity], !enabled)}
                      style={{
                        padding: "4px 9px", borderRadius: 999, cursor: "pointer", fontFamily: T.mono, fontSize: 10.5,
                        border: `1px solid ${enabled ? T.accentDim : T.border}`,
                        background: enabled ? T.accentSoft : T.panel2,
                        color: enabled ? T.accent : T.textFaint,
                      }}
                    >
                      {entity}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: 10.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", margin: "15px 0 2px", fontFamily: T.mono }}>
                  Risk scoring
                </div>
                <div style={{ display: "flex", gap: 8, margin: "7px 0 3px" }}>
                  <NumField label="Medium at ≥" value={draft.risk_level_thresholds?.medium ?? 1} min={0} onChange={(v) => patchDraft(["risk_level_thresholds", "medium"], v)} />
                  <NumField label="High at ≥" value={draft.risk_level_thresholds?.high ?? 3} min={0} onChange={(v) => patchDraft(["risk_level_thresholds", "high"], v)} />
                </div>

                <div style={{ fontSize: 10.5, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", margin: "15px 0 2px", fontFamily: T.mono }}>
                  Rate limiting
                </div>
                <div style={{ display: "flex", gap: 8, margin: "7px 0 3px" }}>
                  <NumField label="Max requests" value={draft.rate_limit?.max_requests ?? 10} min={1} onChange={(v) => patchDraft(["rate_limit", "max_requests"], v)} />
                  <NumField label="Window (sec)" value={draft.rate_limit?.window_seconds ?? 60} min={1} onChange={(v) => patchDraft(["rate_limit", "window_seconds"], v)} />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button
                    onClick={saveSettings}
                    disabled={!dirty || saving}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "9px 12px", borderRadius: 4, border: "none",
                      background: dirty ? T.accent : T.panel2,
                      color: dirty ? "#04120c" : T.textFaint,
                      fontFamily: T.mono, fontWeight: 700, fontSize: 12,
                      cursor: dirty && !saving ? "pointer" : "default",
                    }}
                  >
                    <Save size={13} /> {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button onClick={resetSettings} disabled={saving} style={{ ...btnGhost, display: "flex", alignItems: "center", gap: 6 }}>
                    <RotateCcw size={12} /> Reset
                  </button>
                </div>
                {saveMsg && (
                  <div style={{ marginTop: 9, fontSize: 11.5, color: dirty ? T.warn : T.accent }}>{saveMsg}</div>
                )}
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ROOT APP — swaps between LoginScreen and Dashboard, persists
   the session in sessionStorage so a page refresh doesn't log
   you out mid-shift (cleared automatically when the tab closes).
   ============================================================ */

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const handleLogin = (data) => {
    setSession(data);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  };

  const handleLogout = () => {
    setSession(null);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  if (!session) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <Dashboard session={session} onLogout={handleLogout} />;
}
