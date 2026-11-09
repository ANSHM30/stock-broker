"use client";

import { useEffect, useMemo, useState } from "react";

type View = "overview" | "holdings" | "positions" | "orders" | "watchlist" | "advisory";
type Theme = "light" | "dark";
type Signal = {
  symbol: string;
  company_name?: string;
  exchange?: string;
  direction?: string;
  signal_type?: string;
  current_price?: number | string;
  confidence_score?: number | string;
  generated_at?: string;
  trade?: {
    entry_price?: number | string;
    entry_range?: number[];
    entry_zone_low?: number | string;
    entry_zone_high?: number | string;
    target_prices?: Array<number | string>;
    stop_loss?: number | string;
    risk_reward_ratio?: number | string;
    horizon?: string;
    holding_label?: string;
  };
  explanation?: {
    rationale?: string;
    strategy_rationale?: string;
    summary?: string;
    context?: { sector?: string };
  };
};

type ApiResult = { data?: Signal[] };
type LoadState = "idle" | "loading" | "ready" | "error";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const THEME_KEY = "alvest-theme";
const NAV_ITEMS: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "holdings", label: "Holdings", icon: "▥" },
  { id: "positions", label: "Positions", icon: "↗" },
  { id: "orders", label: "Orders", icon: "▣" },
  { id: "watchlist", label: "Watchlist", icon: "◉" },
  { id: "advisory", label: "Advisory", icon: "✦" }
];
const TITLES: Record<View, string> = {
  overview: "Overview",
  holdings: "Holdings",
  positions: "Positions",
  orders: "Orders",
  watchlist: "Watchlist",
  advisory: "Advisory"
};
const DESCRIPTIONS: Record<View, string> = {
  overview: "A calm place to review market context and research while your broker connection is unavailable.",
  holdings: "Holdings data is unavailable while no broker is connected.",
  positions: "Position data is unavailable while no broker is connected.",
  orders: "Order placement and order history are unavailable until broker support is connected.",
  watchlist: "Illustrative Indian-equity references only. Values are static samples, not current prices.",
  advisory: "Latest Indian equity recommendations. Research is read-only; order placement is disabled."
};
const SAMPLE_STOCKS = [
  { symbol: "HDFCBANK", company: "HDFC Bank", value: 1684, move: "+0.82%", tone: "positive" },
  { symbol: "INFY", company: "Infosys", value: 1478, move: "+1.14%", tone: "positive" },
  { symbol: "TATAMOTORS", company: "Tata Motors", value: 968, move: "+0.36%", tone: "positive" }
];

function price(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(numeric)
    : "—";
}

function confidence(signal: Signal): number | null {
  const value = Number(signal.confidence_score);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value <= 1 ? value * 100 : value)));
}

function category(signal: Signal): "buy" | "sell" | "watch" {
  const direction = (signal.direction || signal.signal_type || "").toLowerCase();
  if (direction.includes("buy")) return "buy";
  if (direction.includes("sell")) return "sell";
  return "watch";
}

function directionLabel(signal: Signal): string {
  const direction = signal.direction || signal.signal_type || "Watch";
  return direction.charAt(0).toUpperCase() + direction.slice(1).toLowerCase();
}

function entryLabel(signal: Signal): string {
  const trade = signal.trade || {};
  const range = trade.entry_range || [];
  const low = trade.entry_zone_low ?? range[0];
  const high = trade.entry_zone_high ?? range[1];
  if (low != null && high != null) return `${price(low)} – ${price(high)}`;
  if (trade.entry_price != null) return price(trade.entry_price);
  return "—";
}

function SignalCard({ signal }: { signal: Signal }) {
  const type = category(signal);
  const score = confidence(signal);
  const targets = signal.trade?.target_prices || [];
  const target = targets[0];
  const current = Number(signal.current_price || signal.trade?.entry_price);
  const targetNumber = Number(target);
  const upside = Number.isFinite(current) && current > 0 && Number.isFinite(targetNumber)
    ? `${targetNumber >= current ? "+" : ""}${(((targetNumber - current) / current) * 100).toFixed(1)}%`
    : "";
  const rationale = signal.explanation?.rationale
    || signal.explanation?.strategy_rationale
    || signal.explanation?.summary
    || "No rationale was provided for this recommendation.";

  return (
    <article className="signal-card">
      <div className="instrument">
        <span className="ticker-mark" aria-hidden="true">{signal.symbol.slice(0, 2)}</span>
        <span className="instrument-copy">
          <strong>{signal.symbol}</strong>
          <small>{signal.company_name || signal.symbol}</small>
          <small>{signal.exchange || "NSE"}{signal.explanation?.context?.sector ? ` · ${signal.explanation.context.sector}` : ""}</small>
        </span>
      </div>
      <div className="signal-data">
        <div><small>Entry zone</small><strong>{entryLabel(signal)}</strong></div>
        <div><small>Advisory level</small><strong>{price(signal.current_price)}</strong></div>
        <div><small>Direction</small><strong className={type === "buy" ? "positive" : type === "sell" ? "negative" : "neutral"}>{directionLabel(signal)}</strong></div>
      </div>
      <div className="signal-quality">
        <div className="quality-label"><span>Confidence</span><strong>{score == null ? "—" : `${score}%`}</strong></div>
        <div className="meter"><span style={{ width: `${score ?? 0}%` }} /></div>
        <div className="quality-label"><span>Risk / reward</span><strong>{signal.trade?.risk_reward_ratio != null ? `1 : ${Number(signal.trade.risk_reward_ratio).toFixed(1)}` : "—"}</strong></div>
      </div>
      <div className="signal-target">
        <strong>{price(target)} target {upside && <span className="positive">{upside}</span>}</strong>
        <small>Stop {price(signal.trade?.stop_loss)}</small>
        <span className={`tag ${type}`}>{directionLabel(signal)} · read-only</span>
      </div>
      <p className="rationale"><b>Rationale</b>{rationale}</p>
    </article>
  );
}

export default function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    const nextTheme: Theme = saved === "dark" || saved === "light"
      ? saved
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(THEME_KEY, nextTheme);
  }

  async function loadAdvisories() {
    setLoadState("loading");
    setErrorMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/advisories`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      });
      if (!response.ok) throw new Error(`Advisory service returned ${response.status}`);
      const result = await response.json() as ApiResult;
      if (!Array.isArray(result.data)) throw new Error("The advisory API returned an unexpected response");
      setSignals(result.data.filter((item): item is Signal => Boolean(item && item.symbol)));
      setLoadState("ready");
    } catch (error) {
      console.error("Could not load advisories", error);
      setErrorMessage(error instanceof Error ? error.message : "The advisory service is unavailable.");
      setLoadState("error");
    }
  }

  useEffect(() => {
    if (view === "advisory" && loadState === "idle") void loadAdvisories();
  }, [view, loadState]);

  const filteredSignals = useMemo(() => signals.filter((signal) => {
    const matchesText = `${signal.symbol} ${signal.company_name || ""}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesType = filter === "all" || category(signal) === filter;
    return matchesText && matchesType;
  }), [signals, query, filter]);

  function navigate(nextView: View) {
    setView(nextView);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate("overview"); }}>
          <span className="brand-mark" aria-hidden="true">A</span>
          <span><strong>alvest</strong><small>INVEST WITH INTENT</small></span>
        </a>

        <div className="nav-heading">Workspace</div>
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} type="button" className="nav-link" aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              {item.id === "orders" && <span className="nav-count">—</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="connection-card">
          <span className="status-dot" aria-hidden="true" />
          <div><small>Broker connection</small><strong>Not connected</strong></div>
          <span className="connection-caption">Orders stay disabled</span>
        </div>
        <small className="sidebar-foot">Read-only research</small>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark" aria-hidden="true">A</span><strong>alvest</strong></div>
          <div className="breadcrumb">Workspace <span>/</span> <strong>{TITLES[view]}</strong></div>
          <div className="top-actions">
            <button type="button" className="utility-button" aria-label="Search research" title="Search research" onClick={() => navigate("advisory")}><span aria-hidden="true">⌕</span></button>
            <button type="button" className="utility-button" aria-label="Help and disclosures" title="Help and disclosures"><span aria-hidden="true">?</span></button>
            <button type="button" className="utility-button notification-button" aria-label="Notifications" title="Notifications"><span aria-hidden="true">◌</span><i aria-hidden="true" /></button>
            <button type="button" className="theme-toggle" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`} onClick={toggleTheme}>
              <span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span><span className="theme-label">{theme === "light" ? "Dark" : "Light"}</span>
            </button>
            <span className="avatar" aria-label="Read-only workspace">RO</span>
          </div>
        </header>

        <main>
          <section className="market-strip" aria-label="Illustrative market references">
            <MarketIndex name="NIFTY 50" value="22,419.95" change="+0.42%" />
            <MarketIndex name="SENSEX" value="73,961.31" change="+0.38%" />
            <MarketIndex name="NIFTY BANK" value="48,172.80" change="−0.16%" down />
            <div className="market-disclaimer"><span>Market snapshot</span><small>Illustrative references · not live data</small></div>
          </section>
          <div className="data-disclosure"><span className="disclosure-mark" aria-hidden="true">i</span><strong>Illustrative data</strong><small>Advisory levels and market references are not live quotes or investment advice.</small></div>

          <div className="page-heading">
            <div><div className="eyebrow">ALVEST · WORKSPACE</div><h1>{TITLES[view]}</h1><p>{DESCRIPTIONS[view]}</p></div>
            {view === "advisory" && <div className={`feed-status ${loadState}`}><i aria-hidden="true" />{loadState === "ready" ? "Advisory API connected" : loadState === "error" ? "Feed unavailable" : "Connecting to API"}</div>}
          </div>

          {view === "overview" && <Overview onNavigate={navigate} />}
          {view === "holdings" && <UnavailablePanel title="Holdings" message="Connect a supported broker when connectivity becomes available to view account holdings." icon="▥" />}
          {view === "positions" && <UnavailablePanel title="Positions" message="No broker is connected, so position and account values are unavailable." icon="↗" />}
          {view === "orders" && <UnavailablePanel title="Order access" message="No broker is connected. This page does not create, display, or transmit orders." icon="▣" />}
          {view === "watchlist" && <Watchlist onNavigate={navigate} />}
          {view === "advisory" && (
            <section className="advisory-page">
              <div className="metrics">
                <Metric label="Active recommendations" value={loadState === "ready" ? String(signals.length).padStart(2, "0") : "—"} note={loadState === "ready" ? "Published Indian-equity advisories" : "Waiting for advisory feed"} />
                <Metric label="Account data" value="Unavailable" note="Broker connection required" />
                <Metric label="Order access" value="Disabled" note="No broker is connected" />
              </div>
              <section className="featured">
                <div className="featured-heading"><span className="featured-icon" aria-hidden="true">✦</span><div><small>Latest advisory</small><h2>{signals[0]?.symbol || (loadState === "error" ? "Feed unavailable" : "Research-led ideas")}</h2></div></div>
                <p>{signals[0]?.explanation?.rationale || signals[0]?.explanation?.strategy_rationale || signals[0]?.explanation?.summary || "Review published Indian-equity recommendations and indicative levels. This workspace is read-only."}</p>
                <span className="read-only-badge">Read only</span>
              </section>
              <div className="section-heading">
                <div><h2>Current recommendations</h2><small>{signals.length} current {signals.length === 1 ? "advisory" : "advisories"} · read-only research</small></div>
                <div className="filters">
                  <label className="search-field"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search symbol or company" aria-label="Search recommendations" /></label>
                  <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter recommendations">
                    <option value="all">All signals</option><option value="buy">Buy setups</option><option value="watch">On watch</option><option value="sell">Sell setups</option>
                  </select>
                </div>
              </div>
              {loadState === "loading" || loadState === "idle" ? <div className="empty-panel loading-panel" role="status"><span className="loader" aria-hidden="true" />Loading published advisories…</div> : null}
              {loadState === "error" && <div className="empty-panel error-panel"><strong>Could not load advisories</strong><span>{errorMessage || "Check the FastAPI service connection, then retry."}</span><button type="button" className="secondary-button" onClick={() => void loadAdvisories()}>Retry connection</button></div>}
              {loadState === "ready" && filteredSignals.length === 0 && <div className="empty-panel"><strong>{signals.length ? "No recommendations match your filters." : "No current advisories."}</strong><span>{signals.length ? "Try another search or signal type." : "The advisory API returned no published Indian-equity recommendations."}</span></div>}
              {loadState === "ready" && filteredSignals.length > 0 && <div className="signal-list">{filteredSignals.map((signal, index) => <SignalCard key={`${signal.symbol}-${signal.generated_at || index}`} signal={signal} />)}</div>}
              <aside className="research-disclosure"><strong>Research disclosure</strong><span>Recommendations and levels are supplied by the advisory API and are indicative, not live quotes or investment advice. No broker is connected and order placement is disabled. Markets involve risk; targets are not guaranteed.</span></aside>
            </section>
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>)}
      </nav>
    </div>
  );
}

function MarketIndex({ name, value, change, down = false }: { name: string; value: string; change: string; down?: boolean }) {
  return <div className="index-quote"><small>{name}</small><strong>{value}</strong><span className={down ? "negative" : "positive"}>{change}</span></div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function Overview({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <>
      <section className="connection-hero">
        <div className="hero-copy"><span className="hero-orbit" aria-hidden="true" /><small>Good to have you here</small><h2>Your investing dashboard</h2><p>Start with a clear view of the market, then explore research while your account connection is being set up.</p><div className="hero-actions"><button type="button" className="primary-button" onClick={() => onNavigate("advisory")}>Review advisories <span aria-hidden="true">↗</span></button><button type="button" className="secondary-button" onClick={() => onNavigate("watchlist")}>Explore watchlist</button></div></div>
        <div className="connection-next"><span className="status-dot" aria-hidden="true" /><div><small>Broker connection</small><strong>Not connected</strong><span>Account data and orders are unavailable.</span></div><b>Read-only workspace</b></div>
      </section>

      <section className="summary-grid" aria-label="Account summary">
        <div className="summary-card"><span className="summary-icon" aria-hidden="true">◒</span><div><small>Portfolio value</small><strong>—</strong><span>Unavailable without a broker</span></div></div>
        <div className="summary-card"><span className="summary-icon" aria-hidden="true">₹</span><div><small>Available cash</small><strong>—</strong><span>Unavailable without a broker</span></div></div>
        <div className="summary-card"><span className="summary-icon" aria-hidden="true">↗</span><div><small>Open positions</small><strong>—</strong><span>No account connected</span></div></div>
      </section>

      <div className="overview-grid">
        <section className="panel quick-panel">
          <div className="panel-heading"><div><h2>Next steps</h2><small>Make the most of your read-only workspace</small></div><span className="section-kicker">Explore</span></div>
          <button type="button" className="quick-action" onClick={() => onNavigate("advisory")}><span className="quick-icon" aria-hidden="true">✦</span><span><strong>Review advisories</strong><small>API-backed recommendations · no order entry</small></span><b>↗</b></button>
          <button type="button" className="quick-action" onClick={() => onNavigate("watchlist")}><span className="quick-icon" aria-hidden="true">◉</span><span><strong>Explore sample references</strong><small>Static illustrative values · not live quotes</small></span><b>↗</b></button>
          <button type="button" className="quick-action" onClick={() => onNavigate("orders")}><span className="quick-icon muted-icon" aria-hidden="true">▣</span><span><strong>Check order access</strong><small>Orders remain disabled until a broker connects</small></span><b>→</b></button>
        </section>
        <section className="panel mini-watchlist">
          <div className="panel-heading"><div><h2>Sample watchlist</h2><small>Static illustrative values · not live quotes</small></div><button type="button" className="text-button" onClick={() => onNavigate("watchlist")}>See all <span aria-hidden="true">↗</span></button></div>
          <div className="mini-list">{SAMPLE_STOCKS.map((stock) => <div className="mini-row" key={stock.symbol}><span className="stock-avatar" aria-hidden="true">{stock.symbol.slice(0, 1)}</span><span><strong>{stock.symbol}</strong><small>{stock.company}</small></span><span className="mini-price"><strong>{price(stock.value)}</strong><small className={stock.tone}>{stock.move}</small></span></div>)}</div>
          <p className="table-note">These examples are for interface reference only and are not current market data or recommendations.</p>
        </section>
      </div>
    </>
  );
}

function UnavailablePanel({ title, message, icon }: { title: string; message: string; icon: string }) {
  return <section className="panel unavailable-panel"><div className="panel-heading"><div><h2>{title}</h2><small>Broker connection required</small></div><span className="status-chip">Unavailable</span></div><div className="empty-content"><span className="empty-icon" aria-hidden="true">{icon}</span><strong>{title} data unavailable</strong><p>{message}</p></div></section>;
}

function Watchlist({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>Sample references</h2><small>Static illustrative values · not live quotes</small></div><button type="button" className="text-button" onClick={() => onNavigate("advisory")}>Open advisories <span aria-hidden="true">↗</span></button></div>
      <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Illustrative value</th><th>Sample change</th><th>Data status</th></tr></thead><tbody>{SAMPLE_STOCKS.map((stock) => <tr key={stock.symbol}><td><span className="table-instrument"><span className="stock-avatar" aria-hidden="true">{stock.symbol.slice(0, 1)}</span><span><strong>{stock.symbol}</strong><small>{stock.company}</small></span></span></td><td className="tabular">{price(stock.value)}</td><td className="positive tabular">{stock.move}</td><td><span className="table-status">Illustrative</span></td></tr>)}</tbody></table></div>
      <p className="table-note">These static examples are for interface reference only and are not current market data or recommendations.</p>
    </section>
  );
}
