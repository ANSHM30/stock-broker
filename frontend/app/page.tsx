"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

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
type PaperOrder = {
  id: string;
  symbol: string;
  side: "BUY";
  quantity: number;
  reference_price: number;
  total_value: number;
  status: "SIMULATED";
  created_at: string;
};
type PaperPosition = {
  symbol: string;
  quantity: number;
  average_reference_price: number;
  invested_value: number;
};
type PaperPortfolio = {
  mode: "PAPER";
  real_orders_sent: false;
  currency: "INR";
  starting_cash: number;
  available_cash: number;
  reserved_value: number;
  positions: PaperPosition[];
  orders: PaperOrder[];
};

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
  overview: "Review market context and manage your account.",
  holdings: "Holdings created by your orders.",
  positions: "Track open positions and invested value.",
  orders: "Review your orders and execution status.",
  watchlist: "Illustrative Indian-equity references only. Values are static samples, not current prices.",
  advisory: "Review Indian equity recommendations and place orders."
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

function referencePrice(signal: Signal): number | null {
  const candidates = [
    signal.current_price,
    signal.trade?.entry_price,
    signal.trade?.entry_zone_low,
    signal.trade?.entry_range?.[0]
  ];
  const value = candidates.map(Number).find((candidate) => Number.isFinite(candidate) && candidate > 0);
  return value ?? null;
}

function targetPrice(signal: Signal): number | null {
  const value = Number(signal.trade?.target_prices?.[0]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function stopLoss(signal: Signal): number | null {
  const value = Number(signal.trade?.stop_loss);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function portfolioValue(portfolio: PaperPortfolio | null): number | null {
  if (!portfolio) return null;
  return portfolio.available_cash + portfolio.reserved_value;
}

function SignalCard({ signal, onBuy }: { signal: Signal; onBuy: (signal: Signal) => void }) {
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
        <span className={`tag ${type}`}>{directionLabel(signal)}</span>
        {type === "buy" && referencePrice(signal) != null && <button type="button" className="trade-button" onClick={() => onBuy(signal)}>Buy</button>}
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
  const [portfolio, setPortfolio] = useState<PaperPortfolio | null>(null);
  const [portfolioState, setPortfolioState] = useState<LoadState>("idle");
  const [portfolioError, setPortfolioError] = useState("");
  const [orderSignal, setOrderSignal] = useState<Signal | null>(null);
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderState, setOrderState] = useState<"idle" | "submitting">("idle");
  const [orderError, setOrderError] = useState("");
  const [notice, setNotice] = useState("");
  const [orderProduct, setOrderProduct] = useState<"INT" | "DEL">("INT");
  const [orderExecution, setOrderExecution] = useState<"Limit" | "Market">("Market");

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

  async function loadPortfolio() {
    setPortfolioState("loading");
    setPortfolioError("");
    try {
      const response = await fetch(`${API_BASE}/api/paper/portfolio`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`Account service returned ${response.status}`);
      const result = await response.json() as PaperPortfolio;
      if (result.mode !== "PAPER" || result.real_orders_sent !== false) {
        throw new Error("The account service returned an unsupported trading mode.");
      }
      setPortfolio(result);
      setPortfolioState("ready");
    } catch (error) {
      console.error("Could not load account", error);
      setPortfolioError(error instanceof Error ? error.message : "The account service is unavailable.");
      setPortfolioState("error");
    }
  }

  function openPaperOrder(signal: Signal) {
    if (category(signal) !== "buy" || referencePrice(signal) == null) return;
    setOrderSignal(signal);
    setOrderQuantity("");
    setOrderError("");
    setNotice("");
    setOrderProduct("INT");
    setOrderExecution("Market");
  }

  function closePaperOrder() {
    if (orderState === "submitting") return;
    setOrderSignal(null);
    setOrderError("");
  }

  async function submitPaperOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderSignal) return;
    const quantity = Number(orderQuantity);
    const reference = referencePrice(orderSignal);
    if (!Number.isInteger(quantity) || quantity < 1) {
      setOrderError("Enter a whole-share quantity of at least 1.");
      return;
    }
    if (reference == null) {
      setOrderError("This recommendation does not have a usable reference price.");
      return;
    }

    setOrderState("submitting");
    setOrderError("");
    try {
      const response = await fetch(`${API_BASE}/api/paper/orders`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: orderSignal.symbol, quantity, reference_price: reference })
      });
      const result = await response.json().catch(() => ({})) as { detail?: string };
      if (!response.ok) throw new Error(result.detail || `Order service returned ${response.status}`);
      await loadPortfolio();
      setOrderSignal(null);
      setNotice(`Order placed: ${quantity} ${orderSignal.symbol} share${quantity === 1 ? "" : "s"}.`);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : "The order could not be placed.");
    } finally {
      setOrderState("idle");
    }
  }

  useEffect(() => {
    void loadPortfolio();
  }, []);

  useEffect(() => {
    if (view === "advisory" && loadState === "idle") void loadAdvisories();
  }, [view, loadState]);

  useEffect(() => {
    if (!orderSignal) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePaperOrder();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [orderSignal, orderState]);

  const filteredSignals = useMemo(() => signals.filter((signal) => {
    const matchesText = `${signal.symbol} ${signal.company_name || ""}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesType = filter === "all" || category(signal) === filter;
    return matchesText && matchesType;
  }), [signals, query, filter]);
  const orderReference = orderSignal ? referencePrice(orderSignal) : null;
  const maxOrderQuantity = portfolio && orderReference ? Math.floor(portfolio.available_cash / orderReference) : null;

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
              {item.id === "orders" && <span className="nav-count">{portfolio ? portfolio.orders.length : 0}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="connection-card">
          <span className="status-dot demo-dot" aria-hidden="true" />
          <div><small>Trading account</small><strong>Ready</strong></div>
          <span className="connection-caption">Available {portfolio ? price(portfolio.available_cash) : "Loading"}</span>
        </div>
        <small className="sidebar-foot">Order desk</small>
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
            <span className="avatar" aria-label="Account">AL</span>
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

          {view === "overview" && <Overview onNavigate={navigate} portfolio={portfolio} portfolioState={portfolioState} />}
          {view === "holdings" && <PositionsPanel title="Holdings" portfolio={portfolio} portfolioState={portfolioState} error={portfolioError} onRetry={loadPortfolio} />}
          {view === "positions" && <PositionsPanel title="Positions" portfolio={portfolio} portfolioState={portfolioState} error={portfolioError} onRetry={loadPortfolio} />}
          {view === "orders" && <OrdersPanel portfolio={portfolio} portfolioState={portfolioState} error={portfolioError} onRetry={loadPortfolio} />}
          {view === "watchlist" && <Watchlist onNavigate={navigate} />}
          {view === "advisory" && (
            <section className="advisory-page">
              <div className="metrics">
                <Metric label="Active recommendations" value={loadState === "ready" ? String(signals.length).padStart(2, "0") : "—"} note={loadState === "ready" ? "Published Indian-equity advisories" : "Waiting for advisory feed"} />
                <Metric label="Cash balance" value={portfolio ? price(portfolio.available_cash) : portfolioState === "error" ? "Unavailable" : "Loading"} note="Available INR balance" />
                <Metric label="Orders" value={portfolio ? String(portfolio.orders.length).padStart(2, "0") : "0"} note="Account activity" />
              </div>
              <section className="featured">
                <div className="featured-heading"><span className="featured-icon" aria-hidden="true">✦</span><div><small>Latest advisory</small><h2>{signals[0]?.symbol || (loadState === "error" ? "Feed unavailable" : "Research-led ideas")}</h2></div></div>
                <p>{signals[0]?.explanation?.rationale || signals[0]?.explanation?.strategy_rationale || signals[0]?.explanation?.summary || "Review published Indian-equity recommendations and available order levels."}</p>
                <button type="button" className="primary-button" onClick={() => signals[0] && openPaperOrder(signals[0])} disabled={!signals[0] || category(signals[0]) !== "buy" || referencePrice(signals[0]) == null}>Buy</button>
              </section>
              <div className="section-heading">
                <div><h2>Current recommendations</h2><small>{signals.length} current {signals.length === 1 ? "advisory" : "advisories"} · order entry enabled</small></div>
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
              {loadState === "ready" && filteredSignals.length > 0 && <div className="signal-list">{filteredSignals.map((signal, index) => <SignalCard key={`${signal.symbol}-${signal.generated_at || index}`} signal={signal} onBuy={openPaperOrder} />)}</div>}
              <aside className="research-disclosure"><strong>Trading disclosure</strong><span>Recommendations and levels are indicative. Review the order details before submitting. Market values are illustrative and targets are not guaranteed.</span></aside>
            </section>
          )}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => <button key={item.id} type="button" aria-current={view === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span><small>{item.label}</small></button>)}
      </nav>

      {notice && <div className="demo-toast" role="status">{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}>×</button></div>}
      {orderSignal && <div className="order-ticket-backdrop" role="presentation" onMouseDown={closePaperOrder}>
        <section className="order-ticket" role="dialog" aria-modal="true" aria-labelledby="order-ticket-title" onMouseDown={(event) => event.stopPropagation()}>
          <header className="order-ticket-header">
            <div className="order-ticket-quote">
              <strong id="order-ticket-title">{orderSignal.symbol}</strong>
              <span>{orderSignal.exchange || "NSE"} <b>{price(referencePrice(orderSignal))}</b><i aria-hidden="true"> ▲</i></span>
            </div>
            <div className="order-ticket-header-actions">
              <div className="order-side-toggle" aria-label="Order side">
                <button type="button" className="active" aria-pressed="true">B</button>
                <button type="button" aria-pressed="false">S</button>
              </div>
              <button type="button" className="ticket-icon-button" aria-label="Expand order ticket">↗</button>
              <button type="button" className="ticket-icon-button ticket-close" onClick={closePaperOrder} aria-label="Close order">×</button>
            </div>
          </header>

          <nav className="order-ticket-tabs" aria-label="Order ticket mode">
            <button type="button" className="active" aria-current="page">Regular</button>
            <button type="button">Stop Loss</button>
            <button type="button">GTT</button>
            <button type="button">SIP</button>
          </nav>

          <form className="order-ticket-form" onSubmit={submitPaperOrder}>
            <div className="order-entry-grid">
              <fieldset className="order-ticket-field">
                <legend>Product type</legend>
                <div className="order-segmented" role="group" aria-label="Product type">
                  <button type="button" className={orderProduct === "INT" ? "active" : ""} aria-pressed={orderProduct === "INT"} onClick={() => setOrderProduct("INT")}>INT</button>
                  <button type="button" className={orderProduct === "DEL" ? "active" : ""} aria-pressed={orderProduct === "DEL"} onClick={() => setOrderProduct("DEL")}>DEL</button>
                </div>
              </fieldset>
              <label className="order-ticket-field quantity-field">Quantity
                <span className="quantity-control"><input type="number" min="1" step="1" inputMode="numeric" value={orderQuantity} onChange={(event) => setOrderQuantity(event.target.value)} placeholder="0" required autoFocus /><span aria-hidden="true"><b>▲</b><b>▼</b></span></span>
                <small>{maxOrderQuantity != null ? `(Max Qty ${maxOrderQuantity} Shares)` : "Enter whole shares"}</small>
              </label>
              <label className="order-ticket-field advisory-price-field">Price
                <input value={price(referencePrice(orderSignal))} readOnly aria-readonly="true" />
              </label>
            </div>

            <div className="order-execution-row" aria-label="Execution type">
              <button type="button" className={orderExecution === "Limit" ? "active" : ""} aria-pressed={orderExecution === "Limit"} onClick={() => setOrderExecution("Limit")}>Limit</button>
              <button type="button" className={orderExecution === "Market" ? "active" : ""} aria-pressed={orderExecution === "Market"} onClick={() => setOrderExecution("Market")}>Market</button>
            </div>

            <div className="order-protection-heading"><span className="order-check" aria-hidden="true">✓</span><strong>Set Stop-Loss / Target</strong><span className="order-info" aria-label="Advisory levels are read-only">i</span></div>
            <div className="order-levels-grid">
              <div className="order-level">
                <div><span>Stop loss</span><small>Advisory</small></div>
                <output>{price(stopLoss(orderSignal))}</output>
                <em>Read-only level</em>
              </div>
              <div className="order-level">
                <div><span>Target</span><small>Advisory</small></div>
                <output>{price(targetPrice(orderSignal))}</output>
                <em>Read-only level</em>
              </div>
            </div>
            <div className="order-risk-row"><span>Risk / reward</span><strong>{orderSignal.trade?.risk_reward_ratio != null ? `1 : ${Number(orderSignal.trade.risk_reward_ratio).toFixed(1)}` : "—"}</strong><span>Market price · advisory levels</span></div>

            {orderError && <p className="order-ticket-error" role="alert">{orderError}</p>}

            <footer className="order-ticket-footer">
              <div className="order-balance"><span>Available</span><strong>{portfolio ? price(portfolio.available_cash) : "Loading"}</strong></div>
              <div className="order-estimate"><span>Estimated cost</span><strong>{price((Number(orderQuantity) || 0) * (referencePrice(orderSignal) || 0))}</strong></div>
              <button type="submit" className="order-buy-button" disabled={orderState === "submitting"}>{orderState === "submitting" ? "PLACING ORDER…" : "PLACE BUY ORDER"}</button>
            </footer>
          </form>
        </section>
      </div>}
    </div>
  );
}

function MarketIndex({ name, value, change, down = false }: { name: string; value: string; change: string; down?: boolean }) {
  return <div className="index-quote"><small>{name}</small><strong>{value}</strong><span className={down ? "negative" : "positive"}>{change}</span></div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function Overview({ onNavigate, portfolio, portfolioState }: { onNavigate: (view: View) => void; portfolio: PaperPortfolio | null; portfolioState: LoadState }) {
  const accountValue = portfolioValue(portfolio);
  const valueLabel = accountValue == null ? (portfolioState === "error" ? "Start API" : "Loading") : price(accountValue);
  const cashLabel = portfolio ? price(portfolio.available_cash) : valueLabel;
  const positionLabel = portfolio ? String(portfolio.positions.length) : "0";
  return (
    <>
      <section className="connection-hero">
        <div className="hero-copy"><span className="hero-orbit" aria-hidden="true" /><small>Account overview</small><h2>Your investing dashboard</h2><p>Explore recommendations and place orders from your account.</p><div className="hero-actions"><button type="button" className="primary-button" onClick={() => onNavigate("advisory")}>Review advisories <span aria-hidden="true">↗</span></button><button type="button" className="secondary-button" onClick={() => onNavigate("orders")}>View orders</button></div></div>
        <div className="connection-next"><span className="status-dot demo-dot" aria-hidden="true" /><div><small>Account status</small><strong>Ready</strong><span>Cash balance and order entry available.</span></div><b>ORDER DESK</b></div>
      </section>

      <section className="summary-grid" aria-label="Account summary">
        <div className="summary-card"><span className="summary-icon" aria-hidden="true">◒</span><div><small>Portfolio value</small><strong>{valueLabel}</strong><span>Account value</span></div></div>
        <div className="summary-card"><span className="summary-icon" aria-hidden="true">₹</span><div><small>Available cash</small><strong>{cashLabel}</strong><span>INR balance</span></div></div>
        <div className="summary-card"><span className="summary-icon" aria-hidden="true">↗</span><div><small>Open positions</small><strong>{positionLabel}</strong><span>Current holdings</span></div></div>
      </section>

      <div className="overview-grid">
        <section className="panel quick-panel">
          <div className="panel-heading"><div><h2>Next steps</h2><small>Review your account</small></div><span className="section-kicker">Explore</span></div>
          <button type="button" className="quick-action" onClick={() => onNavigate("advisory")}><span className="quick-icon" aria-hidden="true">✦</span><span><strong>Review advisories</strong><small>API-backed recommendations · order entry</small></span><b>↗</b></button>
          <button type="button" className="quick-action" onClick={() => onNavigate("watchlist")}><span className="quick-icon" aria-hidden="true">◉</span><span><strong>Explore sample references</strong><small>Static illustrative values · not live quotes</small></span><b>↗</b></button>
          <button type="button" className="quick-action" onClick={() => onNavigate("orders")}><span className="quick-icon muted-icon" aria-hidden="true">▣</span><span><strong>View orders</strong><small>Order history and status</small></span><b>→</b></button>
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

type PaperPanelProps = {
  portfolio: PaperPortfolio | null;
  portfolioState: LoadState;
  error: string;
  onRetry: () => void;
};

function PaperPanelState({ portfolioState, error, onRetry }: Omit<PaperPanelProps, "portfolio">) {
  if (portfolioState === "loading" || portfolioState === "idle") {
    return <div className="empty-content"><span className="loader" aria-hidden="true" /><strong>Loading account</strong><p>Reading your account data.</p></div>;
  }
  if (portfolioState === "error") {
    return <div className="empty-content"><strong>Account service is offline</strong><p>{error || "Start the FastAPI service to continue."}</p><button type="button" className="secondary-button" onClick={onRetry}>Retry account</button></div>;
  }
  return null;
}

function PositionsPanel({ title, portfolio, portfolioState, error, onRetry }: PaperPanelProps & { title: string }) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>{title}</h2><small>Current positions</small></div><span className="status-chip">Available</span></div>
      {portfolioState !== "ready" ? <PaperPanelState portfolioState={portfolioState} error={error} onRetry={onRetry} /> : portfolio && portfolio.positions.length === 0 ? <div className="empty-content"><strong>No positions yet</strong><p>Open Advisory and choose Buy on a buy recommendation.</p></div> : <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Quantity</th><th>Average reference</th><th>Invested value</th></tr></thead><tbody>{portfolio?.positions.map((position) => <tr key={position.symbol}><td><strong>{position.symbol}</strong></td><td className="tabular">{position.quantity}</td><td className="tabular">{price(position.average_reference_price)}</td><td className="tabular">{price(position.invested_value)}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function OrdersPanel({ portfolio, portfolioState, error, onRetry }: PaperPanelProps) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading"><div><h2>Orders</h2><small>Order history</small></div><span className="status-chip">Active</span></div>
      {portfolioState !== "ready" ? <PaperPanelState portfolioState={portfolioState} error={error} onRetry={onRetry} /> : portfolio && portfolio.orders.length === 0 ? <div className="empty-content"><strong>No orders yet</strong><p>Open Advisory and confirm a buy to see it here.</p></div> : <div className="table-scroll"><table><thead><tr><th>Instrument</th><th>Side</th><th>Quantity</th><th>Reference price</th><th>Value</th><th>Status</th></tr></thead><tbody>{portfolio?.orders.map((order) => <tr key={order.id}><td><strong>{order.symbol}</strong></td><td><span className="table-status">{order.side}</span></td><td className="tabular">{order.quantity}</td><td className="tabular">{price(order.reference_price)}</td><td className="tabular">{price(order.total_value)}</td><td><span className="table-status">{order.status === "SIMULATED" ? "Placed" : order.status}</span></td></tr>)}</tbody></table></div>}
    </section>
  );
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
