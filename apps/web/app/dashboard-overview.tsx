import Image from "next/image";

type DashboardStats = {
  products: number;
  published_offers: number;
  pending_submissions: number;
  countries: number;
  actual_price_observations: number;
  illustrative_offers: number;
};

type Country = {
  code: string;
  name: string;
  default_currency: string | null;
  coverage_tier: string;
  published_offer_count: number;
};

type Props = {
  stats: DashboardStats | null;
  countries: Country[];
  apiOffline: boolean;
  onNavigate: (tab: "offers" | "review") => void;
  onRetry: () => void;
};

const referenceMetrics = [
  { label: "Total Products", value: "1,248", change: "+2.8% from last week" },
  { label: "Active Suppliers", value: "342", change: "+1.6% from last week" },
  { label: "Community Contributions", value: "186", change: "+3.4% from last week" },
  { label: "API Requests", value: "42,893", change: "+1.2% from last week" },
];

const referenceCountries = [
  { code: "IN", name: "India", count: 1342 },
  { code: "US", name: "United States", count: 1156 },
  { code: "CA", name: "Canada", count: 892 },
  { code: "GB", name: "United Kingdom", count: 674 },
  { code: "DE", name: "Germany", count: 521 },
];

export function DashboardOverview({ stats, countries, apiOffline, onNavigate, onRetry }: Props) {
  const isReferencePreview = stats === null;
  const metrics = isReferencePreview
    ? referenceMetrics
    : [
        { label: "Total Products", value: stats.products.toLocaleString(), change: "Canonical catalog records" },
        { label: "Published Offers", value: stats.published_offers.toLocaleString(), change: "Across destination countries" },
        { label: "Countries", value: stats.countries.toLocaleString(), change: "Enabled ISO destinations" },
        { label: "Price Observations", value: stats.actual_price_observations.toLocaleString(), change: "Real observations only" },
      ];

  const liveCountries = countries
    .filter((country) => country.published_offer_count > 0)
    .sort((left, right) => right.published_offer_count - left.published_offer_count)
    .slice(0, 5)
    .map((country) => ({ code: country.code, name: country.name, count: country.published_offer_count }));
  const countryRows = liveCountries.length ? liveCountries : referenceCountries;

  return (
    <div className="dashboard-home">
      <section className="dashboard-greeting">
        <div>
          <h1>Good morning, Admin</h1>
          <p>Here’s what’s happening with Fulfillmenty today.</p>
        </div>
        <div className="snapshot-status" aria-live="polite">
          <span className={`status-pip ${apiOffline ? "status-pip-offline" : ""}`} />
          <span>{apiOffline ? "API OFFLINE" : isReferencePreview ? "REFERENCE PREVIEW" : "LOCAL DATA"}</span>
          {isReferencePreview && <span className="snapshot-note">Illustrative values</span>}
        </div>
      </section>

      <section className="metric-grid" aria-label="Sourcing overview metrics">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="metric-topline">
              <span>{metric.label}</span>
              <span className="metric-chevron" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="m3.5 4.5 2.5 2.5 2.5-2.5" /></svg></span>
            </div>
            <strong>{metric.value}</strong>
            <small className={isReferencePreview ? "metric-change" : "metric-context"}>
              {isReferencePreview && <TrendIcon />}
              {metric.change}
            </small>
          </article>
        ))}
      </section>

      {apiOffline && (
        <div className="offline-note" role="status">
          <span>Showing the reference preview because the API cannot reach its database.</span>
          <button onClick={onRetry}>Retry connection</button>
        </div>
      )}

      <div className="dashboard-panels" id="analytics">
        <section className="panel price-panel" aria-labelledby="price-updates-title">
          <div className="panel-heading chart-heading">
            <div>
              <h2 id="price-updates-title">Price Updates <span>(Last 7 Days)</span></h2>
              <p>{isReferencePreview ? "Illustrative dashboard series" : "Observed price history is not connected to this chart yet"}</p>
            </div>
            <button className="chart-menu" aria-label="Chart options"><span /><span /><span /></button>
          </div>
          <PriceChart />
        </section>

        <section className="panel countries-panel" aria-labelledby="country-offers-title">
          <div className="panel-heading chart-heading">
            <div>
              <h2 id="country-offers-title">Top Countries by Offers</h2>
              <p>{liveCountries.length ? "Published offer records" : "Illustrative reference distribution"}</p>
            </div>
            <button className="panel-more" onClick={() => onNavigate("offers")}>View all</button>
          </div>
          <div className="countries-visual">
            <ol className="country-rank-list">
              {countryRows.map((country) => (
                <li key={country.code}>
                  <CountryFlag code={country.code} name={country.name} />
                  <span className="country-rank-name">{country.name === "United Kingdom" ? "UK" : country.name}</span>
                  <span className="country-rank-count">{country.count.toLocaleString()}</span>
                </li>
              ))}
            </ol>
            <div className="map-frame">
              <Image src="/world-map.svg" width={1010} height={666} alt="Illustrative world map highlighting selected sourcing regions" />
              <span><a href="https://mapsvg.com/maps/world" target="_blank" rel="noreferrer">MapSVG</a> · illustrative coverage, not order volume</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PriceChart() {
  return (
    <div className="chart-plot-wrap">
      <svg className="price-chart" viewBox="0 0 520 192" role="img" aria-label="Illustrative seven-day price update chart">
        <defs>
          <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a176ed" stopOpacity=".22" />
            <stop offset="100%" stopColor="#a176ed" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart-grid-lines">
          <path d="M48 18H510 M48 52H510 M48 86H510 M48 120H510 M48 154H510" />
        </g>
        <g className="chart-y-labels">
          <text x="0" y="21">2.5K</text><text x="0" y="55">2.0K</text><text x="0" y="89">1.5K</text><text x="0" y="123">1.0K</text><text x="0" y="157">500</text>
        </g>
        <path className="chart-area" d="M48 137 L92 116 L136 104 L180 112 L224 81 L268 89 L312 55 L356 72 L400 39 L444 62 L488 30 L488 154 L48 154 Z" />
        <path className="chart-line" d="M48 137 L92 116 L136 104 L180 112 L224 81 L268 89 L312 55 L356 72 L400 39 L444 62 L488 30" />
        {[ [48,137], [92,116], [136,104], [180,112], [224,81], [268,89], [312,55], [356,72], [400,39], [444,62], [488,30] ].map(([cx, cy]) => (
          <circle className="chart-point" key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.2" />
        ))}
        <g className="chart-x-labels">
          <text x="48" y="181">Oct 17</text><text x="135" y="181">Oct 18</text><text x="222" y="181">Oct 19</text><text x="309" y="181">Oct 20</text><text x="396" y="181">Oct 21</text><text x="488" y="181" textAnchor="end">Oct 22</text>
        </g>
      </svg>
    </div>
  );
}

function TrendIcon() {
  return <svg className="trend-icon" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 8 5 5l2 2 3-4M7.5 3H10v2.5" /></svg>;
}

function CountryFlag({ code, name }: { code: string; name: string }) {
  const common = { role: "img" as const, "aria-label": `${name} flag`, viewBox: "0 0 18 12" };

  if (code === "IN") return <svg {...common} className="country-flag"><path fill="#f59e0b" d="M0 0h18v4H0z" /><path fill="#f8fafc" d="M0 4h18v4H0z" /><path fill="#16855b" d="M0 8h18v4H0z" /><circle cx="9" cy="6" r="1.15" fill="none" stroke="#365caa" strokeWidth=".7" /></svg>;
  if (code === "US") return <svg {...common} className="country-flag"><path fill="#f8fafc" d="M0 0h18v12H0z" /><path fill="#c94850" d="M0 0h18v1.7H0zm0 3.4h18v1.7H0zm0 3.4h18v1.7H0zm0 3.4h18V12H0z" /><path fill="#29446b" d="M0 0h8v6.5H0z" /></svg>;
  if (code === "CA") return <svg {...common} className="country-flag"><path fill="#f8fafc" d="M0 0h18v12H0z" /><path fill="#d3424d" d="M0 0h4.5v12H0zm13.5 0H18v12h-4.5z" /><path fill="#d3424d" d="m9 2 1.1 2 1.2-.6-.5 1.5 1 .8-2 .2-.8 2.4-.8-2.4-2-.2 1-.8-.5-1.5 1.2.6z" /></svg>;
  if (code === "GB") return <svg {...common} className="country-flag"><path fill="#28416b" d="M0 0h18v12H0z" /><path stroke="#f7f8fa" strokeWidth="3" d="m0 0 18 12M18 0 0 12" /><path stroke="#cc4651" strokeWidth="1.2" d="m0 0 18 12M18 0 0 12" /><path stroke="#f7f8fa" strokeWidth="4" d="M9 0v12M0 6h18" /><path stroke="#cc4651" strokeWidth="2" d="M9 0v12M0 6h18" /></svg>;
  if (code === "DE") return <svg {...common} className="country-flag"><path fill="#202329" d="M0 0h18v4H0z" /><path fill="#d2444b" d="M0 4h18v4H0z" /><path fill="#e8bd59" d="M0 8h18v4H0z" /></svg>;
  return <svg {...common} className="country-flag"><rect width="18" height="12" rx="1.5" fill="#304454" /><path d="M3 6h12M9 3v6" stroke="#b7c4cb" strokeWidth="1.4" /></svg>;
}
