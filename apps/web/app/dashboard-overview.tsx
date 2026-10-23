import type { FeatureCollection, Geometry } from "geojson";
import { feature as topoFeature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import worldAtlas from "world-atlas/countries-110m.json";
import { Area, AreaChart } from "@/components/charts/area-chart";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { YAxis } from "@/components/charts/y-axis";
import { ChartTooltip } from "@/components/charts/tooltip";
import {
  ChoroplethChart,
  ChoroplethFeatureComponent,
  ChoroplethTooltip,
} from "@/components/charts/choropleth";

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

const priceHistory = [
  { date: new Date("2026-10-17T12:00:00"), updates: 1260 },
  { date: new Date("2026-10-18T12:00:00"), updates: 1520 },
  { date: new Date("2026-10-19T12:00:00"), updates: 1380 },
  { date: new Date("2026-10-20T12:00:00"), updates: 1910 },
  { date: new Date("2026-10-21T12:00:00"), updates: 1760 },
  { date: new Date("2026-10-22T12:00:00"), updates: 2260 },
  { date: new Date("2026-10-23T12:00:00"), updates: 2050 },
];

type MapProperties = { name?: string; offers?: number; [key: string]: unknown };
type WorldMap = FeatureCollection<Geometry, MapProperties>;

const topology = worldAtlas as unknown as Topology;
const countryCollection = (topology.objects as { countries: GeometryCollection<MapProperties> }).countries;
const worldMap = topoFeature(topology, countryCollection) as WorldMap;

const countryNameAliases: Record<string, string> = {
  "united states of america": "united states",
  "united republic of tanzania": "tanzania",
  "russian federation": "russia",
  "czech republic": "czechia",
  "democratic republic of the congo": "democratic republic of congo",
  "republic of the congo": "congo",
};

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
    .map((country) => ({ code: country.code, name: country.name, count: country.published_offer_count }));
  const countryRows = liveCountries.length ? liveCountries.slice(0, 5) : referenceCountries;
  const mappedCountries = liveCountries.length ? liveCountries : referenceCountries;
  const offersByName = new Map(
    mappedCountries.map((country) => [normalizeCountryName(country.name), country.count]),
  );
  const mapData = {
    ...worldMap,
    features: worldMap.features.map((country) => ({
      ...country,
      properties: {
        ...country.properties,
        offers: offersByName.get(normalizeCountryName(country.properties.name ?? "")) ?? 0,
      },
    })),
  } satisfies WorldMap;

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
              <ChoroplethChart
                className="bklit-map"
                data={mapData}
                aspectRatio="2 / 1"
                center={[8, 18]}
                animationDuration={600}
              >
                <ChoroplethFeatureComponent
                  getFeatureColor={(country) => getCountryMapColor(Number(country.properties?.offers ?? 0))}
                  stroke="var(--chart-grid)"
                  strokeWidth={0.55}
                />
                <ChoroplethTooltip
                  getFeatureName={(country) => String(country.properties?.name ?? "Country")}
                  getFeatureValue={(country) => Number(country.properties?.offers ?? 0)}
                  valueLabel="Published offers"
                  formatValue={(value) => value.toLocaleString()}
                />
              </ChoroplethChart>
              <span>{liveCountries.length ? "Hover a region for offer counts" : "Illustrative coverage shading"}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PriceChart() {
  const dateLabels = priceHistory.map(({ date }) =>
    new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
  );

  return (
    <div className="chart-plot-wrap" role="group" aria-label="Illustrative seven-day price update chart">
      <AreaChart
        className="bklit-price-chart"
        data={priceHistory}
        margin={{ top: 10, right: 12, bottom: 25, left: 43 }}
        style={{ height: 191 }}
        animationDuration={600}
      >
        <Grid horizontal numTicksRows={5} stroke="var(--chart-grid)" strokeDasharray="2,5" />
        <Area
          dataKey="updates"
          fill="var(--chart-line-primary)"
          fillOpacity={0.2}
          gradientToOpacity={0}
          strokeWidth={2}
          showMarkers
        />
        <XAxis numTicks={7} labels={dateLabels} tickMode="domain" />
        <YAxis numTicks={5} formatValue={formatUpdateCount} />
        <ChartTooltip showDatePill={false} indicatorColor="var(--chart-line-primary)" />
      </AreaChart>
    </div>
  );
}

function formatUpdateCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return value.toLocaleString();
}

function normalizeCountryName(name: string) {
  const normalized = name
    .toLocaleLowerCase("en")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return countryNameAliases[normalized] ?? normalized;
}

function getCountryMapColor(offers: number) {
  if (offers >= 1000) return "var(--chart-scale-05)";
  if (offers >= 650) return "var(--chart-scale-04)";
  if (offers > 0) return "var(--chart-scale-03)";
  return "var(--chart-scale-01)";
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
