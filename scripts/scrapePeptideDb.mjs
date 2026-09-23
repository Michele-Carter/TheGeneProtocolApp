// One-off scraping tool: pulls peptide-db.com's own per-page data model (embedded in each page's
// SvelteKit hydration payload) rather than parsing rendered HTML, so the data lands in
// src/data/*.json exactly as peptide-db.com structures it — no paraphrasing, no lossy DOM
// re-derivation. Not shipped in the app bundle; run manually with `node scripts/scrapePeptideDb.mjs`.
//
// Usage:
//   node scripts/scrapePeptideDb.mjs                 # scrape all peptides from sitemap.xml
//   node scripts/scrapePeptideDb.mjs --pilot          # scrape only the hand-picked PILOT_SLUGS
//   node scripts/scrapePeptideDb.mjs --slugs=a,b,c    # scrape a specific slug list

import fs from "node:fs";
import path from "node:path";

const SITE = "https://peptide-db.com";
const RAW_DIR = path.join("scripts", ".peptide-db-raw");
const DELAY_MS = 500;

// Covers: an existing-catalog overlap (bpc-157), a dual oral/injectable overlap (5-amino-1mq), a
// peptide-db-only FDA-approved drug (abaloparatide), a peptide-db-only obscure peptide (ace-031),
// a popular weekly-injection overlap (semaglutide), another overlap (tb-500), a blend/"protocol"
// page (wolverine-stack) to see if it's structurally different, and a nasal-route overlap (semax).
const PILOT_SLUGS = [
  "bpc-157",
  "5-amino-1mq",
  "abaloparatide",
  "ace-031",
  "semaglutide",
  "tb-500",
  "wolverine-stack",
  "semax"
];

function extractBalancedObject(src, start) {
  let i = start;
  let depth = 0;
  let inStr = null;
  let escaped = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced object literal in boot payload");
}

function extractLdJsonArticleDates(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    try {
      const parsed = JSON.parse(raw);
      const graph = parsed["@graph"] ?? [parsed];
      const article = graph.find((n) => n["@type"] === "Article");
      if (article) {
        return { datePublished: article.datePublished, dateModified: article.dateModified };
      }
    } catch {
      // ld+json block wasn't valid JSON on its own (e.g. spans multiple @graph roots) — skip it,
      // dates are optional metadata, not core data.
    }
  }
  return {};
}

async function fetchSitemapSlugs() {
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { "User-Agent": "Mozilla/5.0" } });
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return urls.filter((u) => u.includes("/peptides/")).map((u) => u.split("/peptides/")[1]);
}

async function scrapeOne(slug) {
  const url = `${SITE}/peptides/${slug}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) {
    return { slug, error: `HTTP ${res.status}` };
  }
  const html = await res.text();

  const marker = "kit.start(app, element, ";
  const markerIdx = html.indexOf(marker);
  if (markerIdx === -1) {
    return { slug, error: "boot payload marker not found — page shape may have changed" };
  }
  const objSrc = extractBalancedObject(html, markerIdx + marker.length);

  let payload;
  try {
    // eslint-disable-next-line no-new-func
    payload = new Function(`return (${objSrc})`)();
  } catch (e) {
    return { slug, error: `failed to evaluate boot payload: ${e.message}` };
  }

  const pageData = payload.data?.find((d) => d?.data?.peptide)?.data;
  const peptide = pageData?.peptide;
  if (!peptide) {
    return { slug, error: "no peptide object in boot payload data" };
  }

  const { datePublished, dateModified } = extractLdJsonArticleDates(html);

  return { slug, sourceUrl: url, peptide, datePublished, dateModified };
}

function validate(slug, peptide) {
  const missing = [];
  if (!peptide.deliveryMethods?.length) missing.push("deliveryMethods");
  if (!peptide.indications?.length) missing.push("indications");
  if (!peptide.timeline?.length) missing.push("timeline");
  if (!peptide.sideEffects?.common?.length) missing.push("sideEffects.common");
  if (!peptide.faqs?.length) missing.push("faqs");
  if (!peptide.references?.length) missing.push("references");
  if (!peptide.quickStats?.typicalDose) missing.push("quickStats.typicalDose");
  return missing;
}

async function main() {
  const args = process.argv.slice(2);
  const usePilot = args.includes("--pilot");
  const slugsArg = args.find((a) => a.startsWith("--slugs="));

  let slugs;
  if (slugsArg) {
    slugs = slugsArg.slice("--slugs=".length).split(",").map((s) => s.trim()).filter(Boolean);
  } else if (usePilot) {
    slugs = PILOT_SLUGS;
  } else {
    slugs = await fetchSitemapSlugs();
  }

  console.log(`Scraping ${slugs.length} peptide(s)...`);
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const index = [];
  const validationReport = [];

  for (const [i, slug] of slugs.entries()) {
    process.stdout.write(`[${i + 1}/${slugs.length}] ${slug} ... `);
    const result = await scrapeOne(slug);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
      validationReport.push({ slug, error: result.error });
      continue;
    }

    const missing = validate(slug, result.peptide);
    if (missing.length > 0) {
      console.log(`OK (flagged: missing ${missing.join(", ")})`);
      validationReport.push({ slug, missing });
    } else {
      console.log("OK");
    }

    const outPath = path.join(RAW_DIR, `${slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    index.push({ slug, name: result.peptide.name, hasFlags: missing.length > 0 });

    if (i < slugs.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  fs.writeFileSync(path.join(RAW_DIR, "_index.json"), JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(RAW_DIR, "_validation-report.json"), JSON.stringify(validationReport, null, 2));

  console.log(`\nDone. ${index.length} scraped, ${validationReport.length} flagged/errored.`);
  console.log(`Raw output: ${RAW_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
