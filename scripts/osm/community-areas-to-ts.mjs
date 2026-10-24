#!/usr/bin/env node
// Turn the City of Chicago "Boundaries - Community Areas" GeoJSON into
// src/utils/chicago_neighborhoods.ts (simplified polygons, ≤ 40 vertices each).
//
//   node scripts/osm/community-areas-to-ts.mjs <community-areas.geojson> <out.ts>
//
// No npm dependencies: Douglas–Peucker is implemented inline.
import { readFileSync, writeFileSync } from "node:fs";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: community-areas-to-ts.mjs <community-areas.geojson> <out.ts>");
  process.exit(2);
}

const MAX_VERTICES = 40;
const START_TOLERANCE = 0.0015; // degrees, ≈ 150 m
const KEEP_LOWERCASE = new Set(["of", "the", "and"]);
// Portal spellings that title-casing alone cannot recover.
const NAME_OVERRIDES = { OHARE: "O'Hare", "O'HARE": "O'Hare" };

function titleCase(raw) {
  const key = raw.trim().toUpperCase();
  if (NAME_OVERRIDES[key]) return NAME_OVERRIDES[key];
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      // "o'hare" → "O'Hare", "mckinley" → "McKinley"
      let w = word.replace(/(^|['-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
      if (w.startsWith("Mc") && w.length > 2) w = "Mc" + w[2].toUpperCase() + w.slice(3);
      return i > 0 && KEEP_LOWERCASE.has(word) ? word : w;
    })
    .join(" ");
}

// ---- Douglas–Peucker on an open polyline of [lng, lat]
function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const cx = a[0] + Math.max(0, Math.min(1, t)) * dx;
  const cy = a[1] + Math.max(0, Math.min(1, t)) * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}
function douglasPeucker(pts, tol) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  const left = douglasPeucker(pts.slice(0, idx + 1), tol);
  const right = douglasPeucker(pts.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}
function simplifyRing(ring, tol) {
  // Ring is closed (first == last). Simplify as open line, then re-close.
  const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  // Split at the vertex farthest from the start so the two halves both get simplified well.
  let far = 0, farD = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const a = douglasPeucker(open.slice(0, far + 1), tol);
  const b = douglasPeucker(open.slice(far).concat([open[0]]), tol);
  const out = a.slice(0, -1).concat(b.slice(0, -1));
  out.push(out[0]);
  return out;
}
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
}
function largestOuterRing(geom) {
  if (geom.type === "Polygon") return geom.coordinates[0];
  if (geom.type === "MultiPolygon") {
    let best = null, bestA = -1;
    for (const poly of geom.coordinates) {
      const a = ringArea(poly[0]);
      if (a > bestA) { bestA = a; best = poly[0]; }
    }
    return best;
  }
  throw new Error(`unsupported geometry ${geom.type}`);
}

// ---- main
const fc = JSON.parse(readFileSync(inPath, "utf8"));
const areas = [];
for (const f of fc.features) {
  const props = f.properties ?? {};
  const rawName = props.community ?? props.COMMUNITY ?? props.name;
  if (!rawName) continue;
  const name = titleCase(rawName);
  const ring = largestOuterRing(f.geometry);
  let tol = START_TOLERANCE;
  let simplified = simplifyRing(ring, tol);
  while (simplified.length - 1 > MAX_VERTICES) {
    tol *= 1.3;
    simplified = simplifyRing(ring, tol);
  }
  // Round and drop consecutive duplicates introduced by rounding.
  const pts = [];
  for (const [lng, lat] of simplified) {
    const p = { lat: +lat.toFixed(4), lon: +lng.toFixed(4) };
    const last = pts[pts.length - 1];
    if (!last || last.lat !== p.lat || last.lon !== p.lon) pts.push(p);
  }
  if (pts[0].lat !== pts[pts.length - 1].lat || pts[0].lon !== pts[pts.length - 1].lon) pts.push({ ...pts[0] });
  areas.push({ name, number: Number(props.area_numbe ?? props.area_num_1 ?? props.AREA_NUMBE ?? 0), original: ring.length, pts, tol });
}
areas.sort((a, b) => a.number - b.number || a.name.localeCompare(b.name));

const dupes = areas.map((a) => a.name).filter((n, i, arr) => arr.indexOf(n) !== i);
if (dupes.length) throw new Error(`duplicate community names: ${dupes.join(", ")}`);

const fmt = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));
const lines = [];
lines.push("// ---------------- Chicago community areas (simplified polygons) ----------------");
lines.push("// Generated by scripts/osm/community-areas-to-ts.mjs from the City of Chicago");
lines.push('// "Boundaries - Community Areas" dataset. Do not edit by hand.');
lines.push('import type { NeighborhoodBounds } from "./nyc_neighborhoods";');
lines.push("");
lines.push("export const chicagoNeighborhoodBoundaries: Record<string, Record<string, { lat: number; lon: number }[]>> = {");
lines.push('  "Chicago": {');
areas.forEach((a, i) => {
  const body = a.pts.map((p) => `{ lat: ${fmt(p.lat)}, lon: ${fmt(p.lon)} }`).join(", ");
  lines.push(`    ${JSON.stringify(a.name)}: [${body}]${i < areas.length - 1 ? "," : ""}`);
});
lines.push("  },");
lines.push("};");
lines.push("");
lines.push("export const chicagoNeighborhoods: NeighborhoodBounds[] = Object.entries(chicagoNeighborhoodBoundaries).flatMap(([borough, areas]) =>");
lines.push("  Object.entries(areas).map(([name, boundary]) => ({ borough, name, boundary })),");
lines.push(");");
lines.push("");
writeFileSync(outPath, lines.join("\n"));

const maxV = Math.max(...areas.map((a) => a.pts.length - 1));
const avgV = areas.reduce((s, a) => s + a.pts.length - 1, 0) / areas.length;
console.log(`   ${areas.length} community areas → ${outPath}`);
console.log(`   vertices per area: max ${maxV}, avg ${avgV.toFixed(1)} (max allowed ${MAX_VERTICES})`);
console.log(`   names: ${areas.map((a) => a.name).join(", ")}`);
