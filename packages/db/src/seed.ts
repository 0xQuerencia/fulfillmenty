import "dotenv/config";
import { countries as isoCountries } from "countries-list";
import { currencies as isoCurrencies } from "countries-list/currencies";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? "postgres://fulfillmenty:fulfillmenty_dev_only@127.0.0.1:5432/fulfillmenty",
});
const tierA = new Set(["US", "IN", "CA", "GB", "EG"]);
const tierB = new Set(["AU", "NP", "PK", "DE", "PL"]);
const tierC = new Set(["BR"]);
const countries = Object.entries(isoCountries).map(([code, country]) => {
  const currencyCodes = country.currency;
  const defaultCurrency = currencyCodes.find((currencyCode) => !isoCurrencies[currencyCode]?.withdrawn) ?? currencyCodes[0] ?? null;
  const tier = tierA.has(code) ? "A" : tierB.has(code) ? "B" : tierC.has(code) ? "C" : "global";
  return { code, name: country.name, defaultCurrency, currencyCodes, tier };
});

try {
  await pool.query("BEGIN");
  for (const [code, currency] of Object.entries(isoCurrencies)) {
    await pool.query(
      `INSERT INTO currencies(code,numeric_code,name,symbol,decimals,active) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(code) DO UPDATE SET numeric_code=EXCLUDED.numeric_code,name=EXCLUDED.name,
         symbol=EXCLUDED.symbol,decimals=EXCLUDED.decimals,active=EXCLUDED.active`,
      [code, currency.numeric, currency.name, currency.symbol, currency.decimals, !currency.withdrawn],
    );
  }
  for (const country of countries) {
    await pool.query(
      `INSERT INTO countries(code, name, default_currency, currency_codes, coverage_tier) VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, default_currency=EXCLUDED.default_currency,
         currency_codes=EXCLUDED.currency_codes, coverage_tier=EXCLUDED.coverage_tier`,
      [country.code, country.name, country.defaultCurrency, country.currencyCodes, country.tier],
    );
  }
  const categories = [
    ["cat-electronics", "Electronics", "electronics"],
    ["cat-3d-printing", "3D printing", "3d-printing"],
    ["cat-computing", "Computing", "computing"],
    ["cat-maker-tools", "Maker tools", "maker-tools"],
  ];
  for (const [id, name, slug] of categories) {
    await pool.query(`INSERT INTO categories(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING`, [id, name, slug]);
  }

  const products = [
    ["prod-demo-mcu", "Example Circuits", "Microcontroller Starter Board", "MCU-01", "cat-electronics", "Illustrative starter board for electronics projects."],
    ["prod-demo-printer", "Example Fabrication", "Desktop 3D Printer", "FAB-220", "cat-3d-printing", "Illustrative 220–240 V desktop printer variant."],
    ["prod-demo-laptop", "Example Computing", "Developer Laptop", "DEV-14", "cat-computing", "Illustrative 14-inch development laptop."],
    ["prod-demo-soldering", "Example Tools", "Temperature Controlled Soldering Station", "TOOL-60", "cat-maker-tools", "Illustrative soldering station with regional power plug variants."],
  ];
  for (const [id, brand, name, model, categoryId, description] of products) {
    await pool.query(
      `INSERT INTO products(id,brand,name,model,category_id,description,is_synthetic) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(id) DO NOTHING`,
      [id, brand, name, model, categoryId, description],
    );
  }
  const variants = [
    ["var-demo-mcu", "prod-demo-mcu", "MCU-01", { board: "starter", connectivity: "USB-C" }],
    ["var-demo-printer-in", "prod-demo-printer", "FAB-220-IN", { voltage: "220-240V", plug: "India" }],
    ["var-demo-printer-us", "prod-demo-printer", "FAB-110-US", { voltage: "110-120V", plug: "US" }],
    ["var-demo-laptop", "prod-demo-laptop", "DEV-14-16-512", { screen: "14-inch", memory: "16 GB", storage: "512 GB" }],
    ["var-demo-soldering", "prod-demo-soldering", "TOOL-60-220", { voltage: "220-240V" }],
  ];
  for (const [id, productId, mpn, attributes] of variants) {
    await pool.query(
      `INSERT INTO product_variants(id,product_id,mpn,attributes) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING`,
      [id, productId, mpn, JSON.stringify(attributes)],
    );
  }
  const merchants = [
    ["merchant-demo-in", "Illustrative Local Electronics Shop (fictional)", "IN", "https://example.com", "local_retailer"],
    ["merchant-demo-us", "Illustrative Maker Supply Shop (fictional)", "US", "https://example.org", "local_retailer"],
    ["merchant-demo-gb", "Illustrative Components Store (fictional)", "GB", "https://example.net", "local_retailer"],
  ];
  for (const [id, name, country, site, type] of merchants) {
    await pool.query(
      `INSERT INTO merchants(id,name,home_country,site,seller_type,is_synthetic) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT(id) DO NOTHING`,
      [id, name, country, site, type],
    );
  }
  const listings = [
    ["listing-demo-mcu-in", "merchant-demo-in", "https://example.com/demo/mcu-01", "MCU-01 starter board — illustrative"],
    ["listing-demo-printer-in", "merchant-demo-in", "https://example.com/demo/fab-220", "FAB-220 printer — illustrative"],
    ["listing-demo-mcu-us", "merchant-demo-us", "https://example.org/demo/mcu-01", "MCU-01 starter board — illustrative"],
    ["listing-demo-solder-gb", "merchant-demo-gb", "https://example.net/demo/tool-60", "TOOL-60 soldering station — illustrative"],
  ];
  for (const [id, merchantId, url, title] of listings) {
    await pool.query(
      `INSERT INTO merchant_listings(id,merchant_id,canonical_url,title,is_synthetic,source_type) VALUES($1,$2,$3,$4,true,'illustrative_fixture') ON CONFLICT(id) DO NOTHING`,
      [id, merchantId, url, title],
    );
  }
  const offerRows = [
    ["offer-demo-mcu-in", "listing-demo-mcu-in", "var-demo-mcu", "IN", "available", "INR", "2500000"],
    ["offer-demo-printer-in", "listing-demo-printer-in", "var-demo-printer-in", "IN", "unknown", "INR", "24999000"],
    ["offer-demo-mcu-us", "listing-demo-mcu-us", "var-demo-mcu", "US", "available", "USD", "800"],
    ["offer-demo-solder-gb", "listing-demo-solder-gb", "var-demo-soldering", "GB", "unknown", "GBP", "6500"],
  ];
  for (const [id, listingId, variantId, country, availability, currency, amount] of offerRows) {
    await pool.query(
      `INSERT INTO offers(id,listing_id,variant_id,destination_country,status,availability,shipping_status,tax_inclusion)
       VALUES($1,$2,$3,$4,'published',$5,'unknown','unknown') ON CONFLICT(id) DO NOTHING`,
      [id, listingId, variantId, country, availability],
    );
    await pool.query(
      `INSERT INTO price_observations(id,offer_id,amount_minor,currency,observed_at,status,source_type,source_url,method,is_synthetic)
       VALUES($1,$2,$3,$4,NULL,'illustrative','illustrative_fixture',$5,'synthetic',true) ON CONFLICT(id) DO NOTHING`,
      [`obs-${id}`, id, amount, currency, listings.find((row) => row[0] === listingId)?.[2] ?? "https://example.com/"],
    );
  }
  await pool.query("COMMIT");
  console.info(`Seeded ${countries.length} ISO country references and ${products.length} synthetic demo products/offers. Values are illustrative, not live.`);
} catch (error) {
  await pool.query("ROLLBACK");
  throw error;
} finally {
  await pool.end();
}
