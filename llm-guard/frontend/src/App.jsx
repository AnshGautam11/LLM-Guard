import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Shield, Send, Radio, Activity, Clock, Hash, ChevronRight, ChevronDown,
  ShieldCheck, ShieldAlert, ShieldX, BookOpen, Cpu, Layers, GitBranch,
  Sliders, Menu, X, Terminal, Radar, Gauge, ListChecks, Braces, Waves,
  ScanLine, Server, ArrowRight, Circle
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS
   Subject: a security proxy console (LLM-Guard) — firewall,
   ML jailbreak detection, DLP, output validation sitting in
   front of an LLM. Reddish theme reads as an alert / SOC
   console rather than a generic chat UI.
   ============================================================ */
const T = {
  bg: "#100a0b",
  bgAlt: "#160e10",
  panel: "#1c1214",
  panel2: "#241519",
  raised: "#2a171b",
  border: "#3a2126",
  borderStrong: "#5c2a30",
  crimson: "#d4223f",
  crimsonDim: "#8c1c2c",
  crimsonSoft: "#3a1216",
  ember: "#e8613f",
  text: "#f3e8e6",
  textMuted: "#b18e8b",
  textFaint: "#7c5f5d",
  safe: "#3fae7c",
  safeSoft: "#12271f",
  warn: "#d99a3a",
};

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');";

const MODELS = [
  { id: "gpt-4o", label: "GPT-4o", vendor: "OpenAI" },
  { id: "claude-3-5", label: "Claude 3.5 Sonnet", vendor: "Anthropic" },
  { id: "gemini-1-5-pro", label: "Gemini 1.5 Pro", vendor: "Google" },
  { id: "llama-3", label: "Llama 3 70B", vendor: "Meta" },
];

const GUIDE_STEPS = [
  {
    icon: Cpu,
    title: "Select a model",
    body: "Choose which upstream LLM receives the prompt once it clears the security pipeline.",
  },
  {
    icon: Terminal,
    title: "Write a prompt",
    body: "Enter a prompt in the console. It's checked against the firewall, the ML jailbreak detector, and DLP redaction before it ever reaches the model.",
  },
  {
    icon: ScanLine,
    title: "Run the pipeline",
    body: "Submit runs the full LLM-Guard flow — rate limit, firewall, ML detector, input DLP, model call, output DLP, output validation — in sequence.",
  },
  {
    icon: ListChecks,
    title: "Read the verdict",
    body: "The response viewer shows the model output alongside risk level, ML verdict, and any OWASP findings raised along the way.",
  },
];

/* ============================================================
   MOCK PIPELINE — mirrors the shape of the real /chat response
   from main.py, so the console works even without a reachable
   backend, and matches field-for-field once one is connected.
   ============================================================ */
const BLOCK_PATTERNS = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /you are now (dan|no longer|free from)/i,
  /developer mode/i,
  /jailbreak/i,
  /system prompt/i,
  /disregard (your|the) (rules|guidelines|instructions)/i,
];

function mockPipeline(message, model) {
  const latencyMs = 180 + Math.round(Math.random() * 420);
  const flagged = BLOCK_PATTERNS.some((p) => p.test(message));

  if (flagged) {
    return {
      status: "Blocked",
      error: "Request blocked by firewall",
      reason: "Blocked: matched role_override pattern",
      risk_level: "HIGH",
      ml_prediction: "JAILBREAK",
      owasp_findings: [
        { id: "API8:2023", name: "Security Misconfiguration" },
      ],
      upstream_response: null,
      latencyMs,
    };
  }

  const piiHit = /@|\d{3}-\d{2}-\d{4}|\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}/.test(
    message
  );

  const lower = message.toLowerCase();
  let text =
    "This is a simulated response — connect a live backend above to see real model output routed through your pipeline.";
  if (lower.includes("python"))
    text =
      "Python is a high-level, interpreted language widely used for web development, automation, and data science.\n\n```python\ndef greet(name):\n    return f\"Hello, {name}\"\n```";
  else if (lower.includes("hello") || lower.includes("hi"))
    text = "Hello! How can I help you today?";
  else if (lower.includes("owasp"))
    text =
      "The OWASP API Security Top 10 covers risks like broken object level authorization, unrestricted resource consumption, and security misconfiguration.";

  return {
    status: "Processed Successfully",
    risk_level: piiHit ? "MEDIUM" : "LOW",
    ml_prediction: "SAFE",
    owasp_findings: piiHit
      ? [{ id: "API3:2023", name: "Broken Object Property Level Authorization" }]
      : [],
    total_sensitive_items: piiHit ? 1 : 0,
    upstream_response: text,
    output_warnings: [],
    model,
    latencyMs,
  };
}

/* ============================================================
   SHARED UI PIECES
   ============================================================ */
function Badge({ tone = "neutral", children, icon: Icon }) {
  const tones = {
    neutral: { bg: T.panel2, fg: T.textMuted, bd: T.border },
    crimson: { bg: T.crimsonSoft, fg: "#ff8a92", bd: T.crimsonDim },
    safe: { bg: T.safeSoft, fg: T.safe, bd: "#1e4a37" },
    warn: { bg: "#2c2010", fg: T.warn, bd: "#4a3818" },
  };
  const c = tones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.bd}`,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        fontWeight: 500,
      }}
    >
      {Icon && <Icon size={12} strokeWidth={2} />}
      {children}
    </span>
  );
}

function Card({ children, style, className }) {
  return (
    <div
      className={className}
      style={{
        background: T.panel,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* Signature element: a scanning ticker bar of rotating pipeline
   events, like a SOC alert feed — reflects the multi-stage
   pipeline in main.py (rate limit / firewall / ML / DLP / output). */
function ScanTicker() {
  const events = [
    "rate-limiter :: window ok",
    "firewall :: pattern scan clear",
    "ml-detector :: tf-idf + linear-svc",
    "dlp :: presidio analyzer idle",
    "output-validator :: toxicity scan clear",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % events.length), 2600);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 12,
        color: T.textMuted,
      }}
    >
      <span style={{ position: "relative", width: 8, height: 8 }}>
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: T.crimson,
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: T.crimson,
            animation: "guardPulse 1.8s ease-out infinite",
          }}
        />
      </span>
      <span style={{ transition: "opacity .3s" }}>{events[i]}</span>
    </div>
  );
}

/* ============================================================
   RESPONSE RENDERER — light markdown: fenced code blocks +
   inline code, everything else as plain paragraphs.
   ============================================================ */
function ResponseBody({ text }) {
  if (!text) return null;
  const parts = text.split(/```(\w*)\n?([\s\S]*?)```/g);
  const nodes = [];
  for (let idx = 0; idx < parts.length; idx += 3) {
    const plain = parts[idx];
    const lang = parts[idx + 1];
    const code = parts[idx + 2];
    if (plain && plain.trim()) {
      plain.split("\n\n").forEach((para, pi) => {
        if (!para.trim()) return;
        nodes.push(
          <p
            key={`p-${idx}-${pi}`}
            style={{
              margin: "0 0 12px",
              lineHeight: 1.7,
              color: T.text,
              fontSize: 14.5,
            }}
          >
            {para}
          </p>
        );
      });
    }
    if (code !== undefined && code !== "") {
      nodes.push(
        <div
          key={`c-${idx}`}
          style={{
            background: "#0b0607",
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            padding: "12px 14px",
            margin: "4px 0 14px",
            overflowX: "auto",
          }}
        >
          {lang && (
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 10.5,
                color: T.textFaint,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              {lang}
            </div>
          )}
          <pre
            style={{
              margin: 0,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              color: "#ffb9a8",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {code}
          </pre>
        </div>
      );
    }
  }
  return <>{nodes}</>;
}

/* ============================================================
   PAGE 1 — DASHBOARD
   ============================================================ */
function Dashboard() {
  const [model, setModel] = useState(MODELS[0].id);
  const [prompt, setPrompt] = useState("");
  const [apiBase, setApiBase] = useState("http://127.0.0.1:8000");
  const [liveMode, setLiveMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    totalPrompts: 0,
    totalTokensApprox: 0,
    latencies: [],
    perModel: {},
  });
  const taRef = useRef(null);

  const activeModel = MODELS.find((m) => m.id === model);

  const runPipeline = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult(null);
    const started = performance.now();
    let data;
    try {
     if (liveMode) {
        const res = await fetch(`${apiBase.replace(/\/$/, "")}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "sk-dev-changeme456",
          },
          body: JSON.stringify({ message: prompt }),
        });
        data = await res.json();
        data.latencyMs = Math.round(performance.now() - started);
        data.model = activeModel.label;
      } else {
        await new Promise((r) => setTimeout(r, 320 + Math.random() * 380));
        data = mockPipeline(prompt, activeModel.label);
      }
    } catch (e) {
      data = {
        status: "Failed",
        error: liveMode
          ? "Could not reach the backend at the address above."
          : String(e),
        latencyMs: Math.round(performance.now() - started),
      };
    }

    setResult(data);
    setHistory((h) => [{ prompt, ...data, ts: Date.now() }, ...h].slice(0, 8));
    setStats((s) => ({
      totalPrompts: s.totalPrompts + 1,
      totalTokensApprox:
        s.totalTokensApprox + Math.round(prompt.length / 4) +
        Math.round((data.upstream_response?.length || 0) / 4),
      latencies: [...s.latencies, data.latencyMs || 0].slice(-40),
      perModel: {
        ...s.perModel,
        [activeModel.label]: (s.perModel[activeModel.label] || 0) + 1,
      },
    }));
    setLoading(false);
  }, [prompt, loading, liveMode, apiBase, activeModel]);

  const avgLatency = stats.latencies.length
    ? Math.round(
        stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
      )
    : 0;

  const topModel =
    Object.entries(stats.perModel).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "—";

  return (
    <div>
      {/* HERO */}
      <section
        style={{
          padding: "56px 0 40px",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: T.crimsonSoft,
              border: `1px solid ${T.crimsonDim}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Shield size={17} color={T.crimson} strokeWidth={2.2} />
          </div>
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: T.textMuted,
            }}
          >
            LLM-Guard Console
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600,
            fontSize: "clamp(28px, 4vw, 44px)",
            lineHeight: 1.15,
            color: T.text,
            margin: "0 0 14px",
            maxWidth: 760,
          }}
        >
          Every prompt passes through the pipeline before it reaches a model.
        </h1>
        <p style={{ color: T.textMuted, fontSize: 15.5, maxWidth: 620, lineHeight: 1.7, margin: "0 0 22px" }}>
          Rate limiting, pattern firewall, an ML jailbreak classifier, PII redaction,
          the model call, then output validation on the way back. This console runs
          that sequence against the model you choose and shows you the verdict.
        </p>
        <ScanTicker />
      </section>

      {/* CONSOLE */}
      <section className="guard-grid-2" style={{ padding: "40px 0", display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: 22 }}>
        {/* left: runner */}
        <div>
          <Card style={{ padding: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: "1 1 220px" }}>
                <label style={labelStyle}>Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={selectStyle}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.vendor}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: "1 1 260px" }}>
                <label style={labelStyle}>Backend</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    disabled={!liveMode}
                    style={{ ...inputStyle, flex: 1, opacity: liveMode ? 1 : 0.5 }}
                    placeholder="http://127.0.0.1:8000"
                  />
                  <button
                    onClick={() => setLiveMode((v) => !v)}
                    style={{
                      ...ghostBtnStyle,
                      borderColor: liveMode ? T.crimsonDim : T.border,
                      color: liveMode ? "#ff8a92" : T.textMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {liveMode ? "Live" : "Simulated"}
                  </button>
                </div>
              </div>
            </div>

            <label style={labelStyle}>Prompt</label>
            <textarea
              ref={taRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask something, or try a prompt-injection phrase to see the firewall trip..."
              rows={5}
              style={{
                width: "100%",
                background: T.panel2,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: "12px 14px",
                color: T.text,
                fontSize: 14.5,
                fontFamily: "'IBM Plex Sans', sans-serif",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: 12, color: T.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>
                {prompt.length} chars · ~{Math.round(prompt.length / 4)} tokens
              </span>
              <button
                onClick={runPipeline}
                disabled={!prompt.trim() || loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: !prompt.trim() || loading ? T.crimsonDim : T.crimson,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: !prompt.trim() || loading ? "default" : "pointer",
                  opacity: !prompt.trim() || loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <>
                    <Radar size={16} style={{ animation: "guardSpin 1s linear infinite" }} /> Scanning
                  </>
                ) : (
                  <>
                    <Send size={16} /> Run pipeline
                  </>
                )}
              </button>
            </div>
          </Card>

          {/* response viewer */}
          <Card style={{ padding: 20, marginTop: 18, minHeight: 160, position: "relative", overflow: "hidden" }}>
            {loading && (
              <div
                style={{
                  position: "absolute",
                  left: 0, right: 0, top: 0, height: 2,
                  background: `linear-gradient(90deg, transparent, ${T.crimson}, transparent)`,
                  backgroundSize: "200% 100%",
                  animation: "guardSweep 1.3s linear infinite",
                }}
              />
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ ...labelStyle, marginBottom: 0 }}>Response</span>
              {result && (
                <Badge
                  tone={result.status === "Processed Successfully" ? "safe" : result.status === "Blocked" ? "crimson" : "warn"}
                  icon={result.status === "Processed Successfully" ? ShieldCheck : result.status === "Blocked" ? ShieldX : ShieldAlert}
                >
                  {result.status || "—"}
                </Badge>
              )}
            </div>

            {!result && !loading && (
              <p style={{ color: T.textFaint, fontSize: 14 }}>
                Run a prompt to see the verdict and, if it clears, the model's response.
              </p>
            )}
            {loading && (
              <p style={{ color: T.textMuted, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
                running rate-limiter → firewall → ml-detector → dlp → model → output-validator…
              </p>
            )}

            {result && result.status === "Blocked" && (
              <div>
                <p style={{ color: "#ff8a92", fontSize: 14.5, margin: "0 0 8px" }}>{result.reason || result.error}</p>
                <p style={{ color: T.textFaint, fontSize: 12.5 }}>Blocked before reaching the model — nothing was sent upstream.</p>
              </div>
            )}
            {result && result.status === "Failed" && (
              <p style={{ color: T.warn, fontSize: 14.5 }}>{result.error}</p>
            )}
            {result && result.status === "Processed Successfully" && (
              <>
                <ResponseBody text={result.upstream_response} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                  <Badge tone={result.risk_level === "HIGH" ? "crimson" : result.risk_level === "MEDIUM" ? "warn" : "safe"}>
                    risk: {result.risk_level || "LOW"}
                  </Badge>
                  <Badge tone={result.ml_prediction === "JAILBREAK" ? "crimson" : "safe"}>
                    ml: {result.ml_prediction || "SAFE"}
                  </Badge>
                  {(result.owasp_findings || []).map((f, i) => (
                    <Badge key={i} tone="warn">{f.id}</Badge>
                  ))}
                </div>
              </>
            )}
          </Card>

          {history.length > 0 && (
            <Card style={{ padding: 20, marginTop: 18 }}>
              <span style={{ ...labelStyle, marginBottom: 12, display: "block" }}>Recent runs</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: T.panel2,
                    }}
                  >
                    <Circle size={7} fill={h.status === "Blocked" ? T.crimson : h.status === "Failed" ? T.warn : T.safe} color="transparent" />
                    <span style={{ fontSize: 13, color: T.textMuted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.prompt}
                    </span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.textFaint }}>
                      {h.latencyMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* right: analytics */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <StatCard icon={Hash} label="Prompts tested" value={stats.totalPrompts} />
          <StatCard icon={Braces} label="Tokens used (approx)" value={stats.totalTokensApprox.toLocaleString()} />
          <StatCard icon={Clock} label="Avg. response time" value={`${avgLatency}ms`} />
          <StatCard icon={Activity} label="Most active model" value={topModel} small />
        </div>
      </section>

      {/* GUIDE */}
      <section style={{ padding: "40px 0 64px", borderTop: `1px solid ${T.border}` }}>
        <span style={{ ...labelStyle, marginBottom: 6, display: "block" }}>How it works</span>
        <h2 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, color: T.text, margin: "0 0 26px", fontWeight: 600 }}>
          Four steps, one pipeline
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {GUIDE_STEPS.map((s, i) => (
            <Card key={i} style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.textFaint }}>
                  0{i + 1}
                </span>
                <s.icon size={17} color={T.crimson} />
              </div>
              <h3 style={{ fontSize: 15, color: T.text, margin: "0 0 6px", fontWeight: 600 }}>{s.title}</h3>
              <p style={{ fontSize: 13.5, color: T.textMuted, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, small }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: T.textFaint }}>
        <Icon size={14} />
        <span style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'IBM Plex Mono', monospace" }}>
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontWeight: 600,
          fontSize: small ? 17 : 26,
          color: T.text,
        }}
      >
        {value}
      </div>
    </Card>
  );
}

const labelStyle = {
  display: "block",
  fontSize: 11.5,
  color: T.textFaint,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontFamily: "'IBM Plex Mono', monospace",
  marginBottom: 6,
};
const inputStyle = {
  background: T.panel2,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "9px 12px",
  color: T.text,
  fontSize: 13.5,
  outline: "none",
  fontFamily: "'IBM Plex Mono', monospace",
};
const selectStyle = {
  ...inputStyle,
  width: "100%",
  boxSizing: "border-box",
  appearance: "none",
};
const ghostBtnStyle = {
  background: "transparent",
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 12.5,
  fontFamily: "'IBM Plex Mono', monospace",
  cursor: "pointer",
};

/* ============================================================
   PAGE 2 — LLM DEEP-DIVE DOCS
   ============================================================ */
const DOC_SECTIONS = [
  { id: "what-is", label: "What is an LLM" },
  { id: "architecture", label: "Architecture" },
  { id: "tokenization", label: "Tokenization" },
  { id: "embeddings", label: "Embeddings" },
  { id: "attention", label: "Attention" },
  { id: "generation", label: "Response generation" },
  { id: "prompting", label: "Prompting techniques" },
  { id: "settings", label: "Temperature, top-p, max tokens" },
];

function DocsPage() {
  const [active, setActive] = useState(DOC_SECTIONS[0].id);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    DOC_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="guard-docs-grid" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 40, padding: "48px 0 80px" }}>
      <aside className="guard-docs-aside" style={{ position: "sticky", top: 24, alignSelf: "start" }}>
        <span style={{ ...labelStyle, marginBottom: 12, display: "block" }}>On this page</span>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {DOC_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                fontSize: 13,
                padding: "7px 10px",
                borderRadius: 6,
                textDecoration: "none",
                color: active === s.id ? T.text : T.textFaint,
                background: active === s.id ? T.panel2 : "transparent",
                borderLeft: `2px solid ${active === s.id ? T.crimson : "transparent"}`,
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <article style={{ maxWidth: 720 }}>
        <span style={{ ...labelStyle, marginBottom: 8, display: "block" }}>Reference</span>
        <h1 style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 32, color: T.text, margin: "0 0 12px", fontWeight: 600 }}>
          How large language models work
        </h1>
        <p style={{ color: T.textMuted, fontSize: 15, lineHeight: 1.7, margin: "0 0 40px" }}>
          A working reference for what happens between a prompt and a response —
          and how to get more reliable output from the model this console talks to.
        </p>

        <DocSection id="what-is" icon={Layers} title="What is an LLM">
          <p>
            A large language model is a neural network trained to predict the next token in a
            sequence of text. Given everything so far, it produces a probability distribution
            over what could come next, samples from it, and repeats — one token at a time —
            until it produces a full response.
          </p>
          <p>
            Scale is what makes this useful: trained on enough text with enough parameters,
            next-token prediction turns out to encode grammar, facts, reasoning patterns, and
            style well enough to hold a conversation, write code, or summarize a document.
          </p>
        </DocSection>

        <DocSection id="architecture" icon={GitBranch} title="Architecture, at a glance">
          <p>
            Almost every modern LLM is a <Code>transformer</Code>: a stack of identical layers,
            each combining a self-attention block with a feed-forward block, wrapped in
            normalization and residual connections. Stacking dozens of these layers is what
            lets the model build up increasingly abstract representations of the input.
          </p>
          <MiniDiagram />
        </DocSection>

        <DocSection id="tokenization" icon={Hash} title="Tokenization">
          <p>
            Text isn't fed to the model as words — it's split into <Code>tokens</Code>, chunks
            that are often smaller than a word (like <Code>"un"</Code>, <Code>"break"</Code>,{" "}
            <Code>"able"</Code>) and sometimes larger, decided by a fixed vocabulary learned
            during training. This is why usage is billed in tokens rather than characters or
            words, and why the same sentence can cost different amounts in different languages.
          </p>
        </DocSection>

        <DocSection id="embeddings" icon={Braces} title="Embeddings">
          <p>
            Each token is mapped to a vector — a list of numbers — that represents its meaning
            in a high-dimensional space. Positional information is added on top, since a
            transformer has no inherent sense of order otherwise. Tokens with related meanings
            end up near each other in this space, which is what lets the model generalize
            beyond exact phrases it saw during training.
          </p>
        </DocSection>

        <DocSection id="attention" icon={Waves} title="Attention mechanism">
          <p>
            Self-attention lets every token look at every other token in the input and decide
            how much weight to give it when updating its own representation. This is what lets
            a pronoun like <Code>"it"</Code> resolve to the right noun several sentences back,
            or a closing bracket recognize which function call it belongs to. Multiple attention
            "heads" run in parallel, each free to specialize in a different kind of relationship.
          </p>
        </DocSection>

        <DocSection id="generation" icon={Terminal} title="Response generation">
          <p>
            Once the input has passed through every layer, the model produces a probability
            distribution over its entire vocabulary for the next token. A sampling strategy —
            shaped by settings like temperature and top-p — picks one token from that
            distribution, appends it to the sequence, and the whole process repeats for the
            next token, until an end-of-response token is produced or a length limit is hit.
          </p>
        </DocSection>

        <DocSection id="prompting" icon={BookOpen} title="How to use LLMs effectively">
          <p>
            The model has no memory beyond what's in the prompt, so the prompt is the entire
            interface. A few reliable techniques:
          </p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: T.text }}>Zero-shot</strong> — ask directly, with no
              examples. Works well for tasks the model has clearly seen many times before.
            </li>
            <li>
              <strong style={{ color: T.text }}>Few-shot</strong> — include two or three
              input/output examples before the real question, so the model can infer the
              pattern and format you want.
            </li>
            <li>
              <strong style={{ color: T.text }}>Chain-of-thought</strong> — ask the model to
              reason step by step before giving a final answer. Helps most on tasks that need
              multi-step logic, like arithmetic or multi-hop questions.
            </li>
          </ul>
        </DocSection>

        <DocSection id="settings" icon={Sliders} title="Temperature, top-p, and max tokens">
          <p>These three settings shape how the model samples from its output distribution:</p>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: T.text }}>Temperature</strong> — scales how sharply the
              distribution is peaked before sampling. Low (0–0.3) is deterministic and
              repetitive; high (0.8–1.2) is more varied and more likely to wander.
            </li>
            <li>
              <strong style={{ color: T.text }}>Top-p</strong> — restricts sampling to the
              smallest set of tokens whose combined probability passes a threshold, cutting off
              the long, unlikely tail without a hard vocabulary limit.
            </li>
            <li>
              <strong style={{ color: T.text }}>Max tokens</strong> — a hard ceiling on
              response length. It cuts the response off once reached — it doesn't make the
              model more concise on its own.
            </li>
          </ul>
        </DocSection>
      </article>
    </div>
  );
}

function DocSection({ id, icon: Icon, title, children }) {
  return (
    <section id={id} style={{ padding: "26px 0", borderTop: `1px solid ${T.border}`, scrollMarginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <Icon size={16} color={T.crimson} />
        <h2 style={{ fontSize: 19, color: T.text, margin: 0, fontWeight: 600 }}>{title}</h2>
      </div>
      <div style={{ color: T.textMuted, fontSize: 14.5, lineHeight: 1.75 }}>{children}</div>
    </section>
  );
}

function Code({ children }) {
  return (
    <code
      style={{
        background: T.panel2,
        border: `1px solid ${T.border}`,
        borderRadius: 4,
        padding: "1px 6px",
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 13,
        color: "#ffb9a8",
      }}
    >
      {children}
    </code>
  );
}

const listStyle = { margin: "10px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 };

function MiniDiagram() {
  const stages = ["Tokenize", "Embed", "Attention x N", "Generate"];
  return (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "16px 0 4px" }}>
      {stages.map((s, i) => (
        <React.Fragment key={s}>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 7,
              background: T.panel2,
              border: `1px solid ${T.border}`,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12.5,
              color: T.text,
            }}
          >
            {s}
          </div>
          {i < stages.length - 1 && <ArrowRight size={14} color={T.textFaint} />}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ============================================================
   APP SHELL
   ============================================================ */
export default function App() {
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`
        ${FONT_IMPORT}
        @keyframes guardPulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(2.6); opacity: 0; } }
        @keyframes guardSpin { to { transform: rotate(360deg); } }
        @keyframes guardSweep { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        select option { background: ${T.panel2}; color: ${T.text}; }
        ::selection { background: ${T.crimsonDim}; color: #fff; }
        @media (max-width: 860px) {
          .guard-grid-2 { grid-template-columns: 1fr !important; }
          .guard-docs-grid { grid-template-columns: 1fr !important; }
          .guard-docs-aside { position: static !important; }
        }
      `}</style>

      <div style={{ background: T.crimsonSoft, borderBottom: `1px solid ${T.crimsonDim}` }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "6px 24px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#ff9a9f" }}>
          simulated mode by default — toggle "Live" in the console to point at your own /chat backend
        </div>
      </div>

      <header style={{ borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: "rgba(16,10,11,0.92)", backdropFilter: "blur(6px)", zIndex: 10 }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setPage("dashboard")}>
            <Shield size={18} color={T.crimson} />
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 14, color: T.text }}>LLM-Guard</span>
          </div>
          <nav style={{ display: "flex", gap: 4 }}>
            <NavBtn active={page === "dashboard"} onClick={() => setPage("dashboard")} icon={Terminal}>Console</NavBtn>
            <NavBtn active={page === "docs"} onClick={() => setPage("docs")} icon={BookOpen}>LLM guide</NavBtn>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px" }}>
        {page === "dashboard" ? <Dashboard /> : <DocsPage />}
      </main>

      <footer style={{ borderTop: `1px solid ${T.border}`, padding: "24px", textAlign: "center" }}>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: T.textFaint }}>
          LLM-Guard Console — security proxy tester
        </span>
      </footer>
    </div>
  );
}

function NavBtn({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 8,
        border: "none",
        background: active ? T.panel2 : "transparent",
        color: active ? T.text : T.textMuted,
        fontSize: 13.5,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <Icon size={14} />
      {children}
    </button>
  );
}
