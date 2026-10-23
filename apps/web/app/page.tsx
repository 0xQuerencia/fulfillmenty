"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { DashboardOverview } from "./dashboard-overview";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");
type Envelope<T> = { data: T; request_id?: string; meta?: Record<string, unknown>; pagination?: { limit: number; next_cursor: string | null; total?: number } };
type Country = { code: string; name: string; default_currency: string | null; coverage_tier: string; published_offer_count: number };
type Product = { id: string; brand: string; name: string; model: string; category_id: string; category_name: string; description: string; variant_count: number; is_synthetic: boolean };
type Offer = {
  id: string; product_id: string; product: { name: string; brand: string; model: string };
  variant_id: string; variant: { attributes: Record<string, unknown> };
  merchant: { id: string; name: string; trust_status: string }; destination: { country: string; subdivision: string | null };
  price: { amount_minor: string | null; currency: string | null; tax_inclusion: string; observed_at: string | null; status: string; source_type: string | null };
  shipping: { amount_minor: string | null; currency: string | null; status: string };
  landed_cost: { estimated_total_minor: string | null; currency: string | null; completeness: string; missing_components: string[] };
  availability: string; freshness: { status: string; last_successful_check_at: string | null };
  verification: { price_checked: boolean; purchase_confirmed: boolean }; source: { url: string; synthetic: boolean };
};
type Submission = { id: string; product_id: string; product_name: string; brand: string; model: string; destination_country: string; destination_name: string; merchant_url: string; notes: string; status: string; created_at: string; provisional_offer_id?: string | null };
type Stats = { products: number; published_offers: number; pending_submissions: number; countries: number; actual_price_observations: number; illustrative_offers: number };
type Tab = "overview" | "catalog" | "offers" | "contribute" | "review" | "api" | "analytics";
type IconName = "dashboard" | "products" | "suppliers" | "contributors" | "moderation" | "settings" | "search" | "refresh";

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
  return payload as Envelope<T>;
}

function formatMinor(amount: string | null, currency: string | null) {
  if (amount === null || !currency) return "Unknown";
  try {
    const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency });
    const exponent = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const scale = 10n ** BigInt(exponent);
    const minor = BigInt(amount);
    const major = minor / scale;
    const fraction = exponent ? (minor % scale).toString().padStart(exponent, "0") : "";
    return formatter.formatToParts(major).map((part) => part.type === "fraction" ? fraction : part.value).join("");
  }
  catch { return `${currency} ${amount}`; }
}

function shortDate(value: string | null) {
  if (!value) return "No real observation";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const navigation: { id: Tab; label: string; icon: IconName }[] = [
  { id: "overview", label: "Dashboard", icon: "dashboard" },
  { id: "catalog", label: "Products", icon: "products" },
  { id: "offers", label: "Suppliers", icon: "suppliers" },
  { id: "contribute", label: "Contributors", icon: "contributors" },
  { id: "analytics", label: "Analytics", icon: "dashboard" },
  { id: "api", label: "Settings", icon: "settings" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("overview");
  const [countries, setCountries] = useState<Country[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("IN");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [pending, setPending] = useState<Submission[]>([]);
  const [accepted, setAccepted] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ product_id: "", destination_country: "IN", merchant_url: "", notes: "" });
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [observations, setObservations] = useState<Record<string, { amount_minor: string; currency: string }>>({});

  const loadOverview = useCallback(async () => {
    const [countryResponse, productResponse, offerResponse, statsResponse] = await Promise.all([
      request<Country[]>("/countries"), request<Product[]>("/products?limit=50"),
      request<Offer[]>("/offers?limit=50&include_stale=true"), request<Stats>("/stats"),
    ]);
    setCountries(countryResponse.data); setProducts(productResponse.data); setOffers(offerResponse.data); setStats(statsResponse.data);
    setForm((current) => ({ ...current, product_id: current.product_id || productResponse.data[0]?.id || "" }));
  }, []);

  const loadQueue = useCallback(async () => {
    const headers = { "x-demo-role": "moderator" };
    const [waiting, acceptedItems] = await Promise.all([
      request<Submission[]>("/admin/moderation?status=pending", { headers }),
      request<Submission[]>("/admin/moderation?status=accepted_for_research", { headers }),
    ]);
    setPending(waiting.data); setAccepted(acceptedItems.data);
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    try { await loadOverview(); setApiStatus("connected"); if (tab === "review") await loadQueue(); }
    catch (err) {
      setApiStatus("offline");
      if (tab !== "overview" && tab !== "analytics") setError(err instanceof Error ? err.message : "The API could not be reached.");
    }
  }, [loadOverview, loadQueue, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (tab !== "catalog") return;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ limit: "50" }); if (search.trim()) query.set("search", search.trim());
        const result = await request<Product[]>(`/products?${query}`); setProducts(result.data);
      } catch (err) { setError(err instanceof Error ? err.message : "Product search failed."); }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, tab]);

  useEffect(() => {
    if (tab !== "offers" && tab !== "overview" && tab !== "analytics") return;
    const params = new URLSearchParams({ limit: "50", include_stale: "true" });
    if (tab === "offers" && countryFilter) params.set("ship_to", countryFilter);
    if (tab === "overview") params.set("sort", "last_checked");
    void request<Offer[]>(`/offers?${params}`).then((result) => setOffers(result.data)).catch((err) => setError(err instanceof Error ? err.message : "Offers could not be loaded."));
  }, [countryFilter, tab]);

  useEffect(() => {
    if (tab !== "review") return;
    const timer = window.setTimeout(() => {
      void loadQueue().catch((err) => setError(err instanceof Error ? err.message : "Review queue could not be loaded."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tab, loadQueue]);

  const visibleOffers = useMemo(() => offers.filter((offer) => tab !== "offers" || offer.destination.country === countryFilter), [offers, tab, countryFilter]);

  async function submitContribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{ id: string; status: string }>("/submissions", { method: "POST", headers: { "x-demo-role": "contributor" }, body: JSON.stringify({ type: "offer_suggestion", ...form }) });
      setNotice(`Submission ${result.data.id} is pending moderator review. The URL was stored without being fetched.`);
      setForm((current) => ({ ...current, merchant_url: "", notes: "" }));
    } catch (err) { setError(err instanceof Error ? err.message : "Submission could not be saved."); }
    finally { setBusy(false); }
  }

  async function decide(item: Submission, outcome: "accept" | "reject") {
    setBusy(true); setError(""); setNotice("");
    try {
      const reason = decisions[item.id] || (outcome === "accept" ? "Source saved for human price and variant review." : "The source needs more evidence before it can be accepted.");
      const result = await request<{ provisional_offer_id: string | null }>(`/admin/moderation/${item.id}/decision`, { method: "POST", headers: { "x-demo-role": "moderator" }, body: JSON.stringify({ outcome, reason }) });
      setNotice(outcome === "accept" ? `Accepted for research. Provisional listing ${result.data.provisional_offer_id ?? "saved"}; it stays private until an actual price observation is recorded.` : "Submission rejected with an audit record.");
      await loadQueue();
    } catch (err) { setError(err instanceof Error ? err.message : "Decision could not be saved."); }
    finally { setBusy(false); }
  }

  async function recordObservation(item: Submission) {
    const offerId = item.provisional_offer_id; const values = observations[item.id];
    if (!offerId || !values?.amount_minor || !values.currency) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/admin/offers/${offerId}/observations`, { method: "POST", headers: { "x-demo-role": "moderator" }, body: JSON.stringify({ amount_minor: values.amount_minor, currency: values.currency.toUpperCase(), availability: "unknown", tax_inclusion: "unknown" }) });
      setNotice("Manual price observation recorded. Shipping and taxes remain unknown; a price observation is not a merchant endorsement.");
      await loadQueue(); await loadOverview();
    } catch (err) { setError(err instanceof Error ? err.message : "Observation could not be recorded."); }
    finally { setBusy(false); }
  }

  async function showProduct(product: Product) {
    setSelectedProduct(product);
    try {
      const result = await request<Product & { variants: Array<{ id: string; mpn: string | null; attributes: Record<string, unknown> }> }>(`/products/${product.id}`);
      setSelectedProduct({ ...product, variant_count: result.data.variants.length, description: `${product.description}\n\nVariants: ${result.data.variants.map((variant) => `${variant.mpn ?? variant.id} — ${JSON.stringify(variant.attributes)}`).join("; ")}` });
    } catch (err) { setError(err instanceof Error ? err.message : "Product details could not be loaded."); }
  }

  return <main className="workspace">
    <aside className="sidebar">
      <a className="brand" href="#dashboard" onClick={(event) => { event.preventDefault(); setTab("overview"); }}><span className="brand-wordmark">Fulfillmenty</span></a>
      <div className="side-label">WORKSPACE</div>
      <nav aria-label="Main navigation" className="main-nav">{navigation.map((item) => <button key={item.id} className={`nav-item ${tab === item.id ? "active" : ""}`} onClick={() => { setTab(item.id); setError(""); setNotice(""); if (item.id === "analytics") window.requestAnimationFrame(() => document.getElementById("analytics")?.scrollIntoView({ block: "start" })); }}><NavIcon name={item.icon} />{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><span className="status-dot" /> LOCAL DEVELOPMENT<p>Independent sourcing intelligence</p><a href="https://github.com/0xQuerencia/fulfillmenty" target="_blank" rel="noreferrer">Repository</a></div>
    </aside>

    <section className="main-area">
      <header className="topbar">
        <form className="global-search" role="search" onSubmit={(event) => { event.preventDefault(); setTab("catalog"); }}>
          <NavIcon name="search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products…" aria-label="Search products" />
          <kbd>↵</kbd>
        </form>
        <div className="topbar-right">
          <span className={`env-pill ${apiStatus === "offline" ? "env-pill-offline" : ""}`}><span className={`status-dot ${apiStatus === "offline" ? "status-dot-offline" : ""}`} />{apiStatus === "connected" ? "API CONNECTED" : apiStatus === "offline" ? "API OFFLINE" : "LOCAL DEMO"}</span>
          <button className={`icon-button notification-button ${tab === "review" ? "icon-button-active" : ""}`} aria-label="Open moderation queue" title="Moderation queue" onClick={() => setTab("review")}><NavIcon name="moderation" />{stats?.pending_submissions ? <span className="notification-count">{stats.pending_submissions}</span> : null}</button>
          <button className="icon-button" aria-label="Refresh dashboard" title="Refresh dashboard" onClick={() => void refresh()}><NavIcon name="refresh" /></button>
          <button className="profile-button" onClick={() => setTab("api")} aria-label="Open local settings"><span className="avatar">A</span><span>Admin</span></button>
        </div>
      </header>
      <div className="content">
        {(error || notice) && <div className={`flash ${error ? "flash-error" : "flash-success"}`} role="status">{error || notice}<button aria-label="Dismiss" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
        {(tab === "overview" || tab === "analytics") && <DashboardOverview stats={stats} countries={countries} apiOffline={apiStatus === "offline"} onNavigate={(target) => { setTab(target); setError(""); }} onRetry={() => void refresh()} />}

        {tab !== "overview" && tab !== "analytics" && <>
        <div className="page-heading"><div><h1>{tab === "review" ? "Moderation" : navigation.find((item) => item.id === tab)?.label}</h1><p className="subhead">{pageDescription(tab)}</p></div>{tab === "offers" && <label className="country-picker"><span>SHIP TO</span><select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select></label>}</div>
        <div className="demo-banner"><span className="demo-icon">i</span><span><strong>Illustrative data only.</strong> Sample merchants and prices are fictional; no live store data is connected. Shipping, taxes and import fees are unknown unless explicitly quoted.</span></div>

        {tab === "catalog" && <section className="panel catalog-panel"><div className="toolbar"><label className="search-box"><NavIcon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, brand or model" aria-label="Search products" /></label><span className="result-count">{products.length} products</span></div><div className="product-grid">{products.map((product) => <button className="product-card" key={product.id} onClick={() => void showProduct(product)}><div className="product-icon"><NavIcon name="products" /></div><span className="product-category">{product.category_name}</span><strong>{product.name}</strong><span className="product-model">{product.brand} · {product.model}</span><span className="product-footer">{product.variant_count} variant{product.variant_count === 1 ? "" : "s"}<span>View details →</span></span></button>)}</div>{products.length === 0 && <div className="empty-state">No products match “{search}”.</div>}</section>}

        {tab === "offers" && <section className="panel table-panel"><div className="panel-heading"><div><h2>Offers shipping to {countries.find((country) => country.code === countryFilter)?.name ?? countryFilter}</h2><p>Destination-scoped sources with price provenance and missing cost components</p></div><span className="result-count">{visibleOffers.length} records</span></div><OfferTable offers={visibleOffers} /></section>}

        {tab === "contribute" && <div className="form-layout"><section className="panel form-panel"><div className="panel-heading"><div><h2>Suggest a merchant listing</h2><p>Your suggestion enters a review queue. It is never fetched on submission.</p></div></div><form onSubmit={submitContribution} className="form-stack"><label>PRODUCT<select required value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })}>{products.map((product) => <option key={product.id} value={product.id}>{product.brand} · {product.model} — {product.name}</option>)}</select></label><label>DESTINATION COUNTRY<select required value={form.destination_country} onChange={(event) => setForm({ ...form, destination_country: event.target.value })}>{countries.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select></label><label>MERCHANT PRODUCT URL<input type="url" required maxLength={2048} placeholder="https://store.example/product" value={form.merchant_url} onChange={(event) => setForm({ ...form, merchant_url: event.target.value })} /><small>HTTPS only. Avoid URLs that contain personal tokens or session information.</small></label><label>NOTES <span className="optional">OPTIONAL</span><textarea rows={4} maxLength={500} placeholder="Variant or delivery details that a reviewer should check" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button className="primary-button" disabled={busy || products.length === 0}>{busy ? "Submitting…" : "Submit for review"}<span>→</span></button></form></section><aside className="panel info-panel"><div className="panel-heading"><div><h2>Submission safeguards</h2><p>What happens to your link</p></div></div><ol className="steps"><li><b>1</b><div><strong>URL is normalized</strong><small>HTTPS, hostname and sensitive query checks</small></div></li><li><b>2</b><div><strong>Saved as pending</strong><small>Domain and source link are retained for review</small></div></li><li><b>3</b><div><strong>No automatic fetch</strong><small>No HTTP request is made to the submitted URL</small></div></li><li><b>4</b><div><strong>Human review required</strong><small>Accepting a source does not publish a price</small></div></li></ol><div className="local-mode-note"><strong>Local demo mode</strong><p>This workspace uses a local-only contributor role. Production writes require a scoped API key.</p></div></aside></div>}

        {tab === "review" && <div className="review-layout"><section className="panel queue-panel"><div className="panel-heading"><div><h2>Awaiting review <span className="count-chip">{pending.length}</span></h2><p>Check product match, destination and source before accepting.</p></div><button className="text-button refresh-text-button" onClick={() => void loadQueue()}><NavIcon name="refresh" />Refresh</button></div>{pending.length ? pending.map((item) => <ReviewCard key={item.id} item={item} decision={decisions[item.id] ?? ""} setDecision={(value) => setDecisions({ ...decisions, [item.id]: value })} busy={busy} onDecide={decide} />) : <div className="empty-state">No submissions waiting for review.</div>}</section><section className="panel queue-panel accepted-panel"><div className="panel-heading"><div><h2>Accepted for research <span className="count-chip">{accepted.length}</span></h2><p>Provisional listings stay private until an actual price is recorded.</p></div></div>{accepted.length ? accepted.map((item) => <div className="accepted-item" key={item.id}><div className="accepted-title"><div><strong>{item.brand} · {item.product_name}</strong><small>{item.destination_name} · <a href={item.merchant_url} target="_blank" rel="noreferrer">Open submitted source ↗</a></small></div><span className="status-tag">PROVISIONAL</span></div>{item.provisional_offer_id ? <div className="observation-form"><label>PRICE IN MINOR UNITS<input inputMode="numeric" placeholder="e.g. 250000 paise" value={observations[item.id]?.amount_minor ?? ""} onChange={(event) => setObservations({ ...observations, [item.id]: { amount_minor: event.target.value.replace(/\D/g, ""), currency: observations[item.id]?.currency ?? countries.find((country) => country.code === item.destination_country)?.default_currency ?? "" } })} /></label><label>CURRENCY<input maxLength={3} placeholder="INR" value={observations[item.id]?.currency ?? countries.find((country) => country.code === item.destination_country)?.default_currency ?? ""} onChange={(event) => setObservations({ ...observations, [item.id]: { amount_minor: observations[item.id]?.amount_minor ?? "", currency: event.target.value.toUpperCase() } })} /></label><button className="secondary-button" disabled={busy || !observations[item.id]?.amount_minor || !observations[item.id]?.currency} onClick={() => void recordObservation(item)}>Record observation</button></div> : <div className="empty-inline">This accepted source has no exact product variant yet.</div>}</div>) : <div className="empty-state">Accepted source suggestions will appear here.</div>}</section></div>}

        {tab === "api" && <div className="api-layout"><section className="panel api-panel"><div className="panel-heading"><div><h2>Public read API</h2><p>Versioned REST endpoints · OpenAPI at <a href="http://localhost:4000/docs" target="_blank" rel="noreferrer">localhost:4000/docs ↗</a></p></div><span className="status-tag">V1</span></div><div className="endpoint-list"><Endpoint method="GET" path="/v1/health" description="Service health" /><Endpoint method="GET" path="/v1/countries" description="ISO country coverage" /><Endpoint method="GET" path="/v1/currencies" description="ISO currency and minor units" /><Endpoint method="GET" path="/v1/products?search=printer" description="Catalog search" /><Endpoint method="GET" path="/v1/offers?ship_to=IN" description="Regional offers and provenance" /><Endpoint method="GET" path="/v1/offers/{id}/history" description="Actual price observations only" /><Endpoint method="POST" path="/v1/submissions" description="Authenticated contribution" /></div><h3>Example request</h3><pre className="code-block"><code>{`curl "${API_BASE}/offers?ship_to=IN" \\\n  -H "Accept: application/json"`}</code></pre><p className="api-note">Monetary amounts are currency minor units represented as strings. A null value means unknown. Demo records have <code>source.synthetic: true</code> and no real observation timestamp.</p></section><section className="panel api-panel"><div className="panel-heading"><div><h2>Local moderator flow</h2><p>Demo role headers work only in local development mode.</p></div></div><pre className="code-block"><code>{`curl -X POST ${API_BASE}/admin/moderation/{id}/decision \\\n  -H "Content-Type: application/json" \\\n  -H "X-Demo-Role: moderator" \\\n  -d '{"outcome":"accept","reason":"Source queued for manual verification."}'`}</code></pre><div className="api-note">Accepting creates a private provisional offer. A moderator must add an actual observed price before the offer appears in public results. No URL fetcher is enabled.</div></section></div>}
        </>}
      </div>
    </section>
    {selectedProduct && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedProduct(null)}><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setSelectedProduct(null)} aria-label="Close product details">×</button><h2 id="modal-title">{selectedProduct.name}</h2><p className="product-model">{selectedProduct.brand} · {selectedProduct.model}</p><div className="detail-meta"><span>{selectedProduct.category_name}</span><span>{selectedProduct.variant_count} variants</span><span>{offers.filter((offer) => offer.product_id === selectedProduct.id).length} demo offers</span></div><p className="detail-description">{selectedProduct.description}</p><button className="primary-button" onClick={() => { setTab("offers"); setCountryFilter("IN"); setSelectedProduct(null); }}>Compare regional offers <span>→</span></button></section></div>}
  </main>;
}

function pageDescription(tab: Tab) {
  const descriptions: Record<Tab, string> = {
    overview: "A transparent view of catalog coverage and regional availability.", analytics: "A transparent view of regional sourcing coverage and data activity.", catalog: "Canonical products and exact variants, searchable by brand or model.",
    offers: "Compare destination-scoped sources with explicit unknown cost components.", contribute: "Suggest a public product source and leave review context for moderators.",
    review: "Inspect suggestions, make an auditable decision and record manual observations.", api: "API access, documentation and local development examples.",
  };
  return descriptions[tab];
}

function NavIcon({ name }: { name: IconName }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></>,
    products: <><path d="m4 7 8-4 8 4v10l-8 4-8-4z" /><path d="m4.2 7 7.8 4 7.8-4M12 11v10" /></>,
    suppliers: <><path d="M4 7.5h10v10H4zM14 10h3.6l2.4 2.8v4.7h-6" /><circle cx="8" cy="18" r="1.7" /><circle cx="17.5" cy="18" r="1.7" /></>,
    contributors: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.5-3.3 2.3-5 5.5-5s5 1.7 5.5 5M16 5.5a3 3 0 0 1 0 5.8M17 15c2.1.4 3.2 2.1 3.5 5" /></>,
    moderation: <><path d="M12 3 20 6v5.5c0 4.3-3 7.6-8 9.5-5-1.9-8-5.2-8-9.5V6z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19 13.8 1.2 1-.9 1.7-1.5-.4a7.6 7.6 0 0 1-1.4.8l-.3 1.6h-2l-.5-1.5a7.7 7.7 0 0 1-1.6 0l-.7 1.4-1.8-.6.1-1.6a7.3 7.3 0 0 1-1.1-1.2l-1.6.1-.6-1.8 1.3-.8a7.6 7.6 0 0 1-.1-1.6l-1.2-1 .9-1.7 1.5.4a7.6 7.6 0 0 1 1.4-.8l.3-1.6h2l.5 1.5a7.7 7.7 0 0 1 1.6 0l.7-1.4 1.8.6-.1 1.6a7.3 7.3 0 0 1 1.1 1.2l1.6-.1.6 1.8-1.3.8a7.6 7.6 0 0 1 .1 1.6Z" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4.1 4.1" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.7 9a7 7 0 0 1 11.6-2L20 12M4 12l2.7 5a7 7 0 0 0 11.6-2" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function OfferTable({ offers }: { offers: Offer[] }) {
  if (!offers.length) return <div className="empty-state">No published offers for this selection yet.</div>;
  return <div className="table-scroll"><table><thead><tr><th>PRODUCT / VARIANT</th><th>MERCHANT</th><th>DESTINATION</th><th>ITEM PRICE</th><th>SHIPPING / TAX</th><th>LANDED TOTAL</th><th>FRESHNESS</th></tr></thead><tbody>{offers.map((offer) => <tr key={offer.id}><td><strong>{offer.product.name}</strong><small>{offer.product.brand} · {offer.variant_id}</small></td><td><strong>{offer.merchant.name}</strong><small className="muted">{offer.merchant.trust_status}</small><small><a href={offer.source.url} target="_blank" rel="noreferrer">Source ↗</a></small></td><td><span className="country-chip">{offer.destination.country}</span></td><td><strong>{formatMinor(offer.price.amount_minor, offer.price.currency)}</strong><small>{offer.price.status === "illustrative" ? "Illustrative value" : shortDate(offer.price.observed_at)}</small></td><td><strong>{offer.shipping.status === "quoted" ? formatMinor(offer.shipping.amount_minor, offer.shipping.currency) : "Unknown"}</strong><small>Taxes: {offer.price.tax_inclusion}</small></td><td><strong>{formatMinor(offer.landed_cost.estimated_total_minor, offer.landed_cost.currency)}</strong><small>{offer.landed_cost.completeness} · {offer.landed_cost.missing_components.join(", ") || "all components known"}</small></td><td><span className={`freshness ${offer.freshness.status === "fresh" ? "fresh" : "freshness-muted"}`}><i />{offer.freshness.status}</span><small>{offer.availability}</small></td></tr>)}</tbody></table></div>;
}

function ReviewCard({ item, decision, setDecision, busy, onDecide }: { item: Submission; decision: string; setDecision: (value: string) => void; busy: boolean; onDecide: (item: Submission, outcome: "accept" | "reject") => void }) {
  return <article className="review-card"><div className="review-top"><span className="status-tag status-pending">PENDING</span><time>{shortDate(item.created_at)}</time></div><h3>{item.product_name}</h3><p className="review-meta">{item.brand} · {item.model} · Destination: <strong>{item.destination_name}</strong></p><a className="source-link" href={item.merchant_url} target="_blank" rel="noreferrer">{item.merchant_url} ↗</a>{item.notes && <p className="review-notes">“{item.notes}”</p>}<label className="decision-reason">REVIEW NOTE<input value={decision} onChange={(event) => setDecision(event.target.value)} placeholder="Record why this decision was made" /></label><div className="review-actions"><button className="secondary-button" disabled={busy} onClick={() => onDecide(item, "reject")}>Reject</button><button className="primary-button" disabled={busy} onClick={() => onDecide(item, "accept")}>Accept for research <span>→</span></button></div></article>;
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) { return <div className="endpoint-row"><span className={`method method-${method.toLowerCase()}`}>{method}</span><code>{path}</code><span>{description}</span></div>; }
