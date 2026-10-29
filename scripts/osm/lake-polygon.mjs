#!/usr/bin/env node
// Build water polygons from shoreline ways that do not form closed rings
// inside the extract: a lake whose OSM multipolygon relation is only partially
// present (Lake Michigan spans four states), or the sea, which OSM maps as
// natural=coastline lines with no polygon at all (New York harbor).
//
//   node scripts/osm/lake-polygon.mjs --bbox W,S,E,N --water-point LNG,LAT \
//        --ways <shoreline-ways.geojsonseq> --out <out.geojsonseq> \
//        [--relation <relation.osm>] [--tags natural=water,name=Lake]
//
// With --relation the polygon takes the relation's natural/water/name tags;
// without it, --tags (default natural=water) is used and every LineString in
// --ways is a shoreline.
//
// Algorithm: chain the member ways that are in the extract into shorelines,
// clip them to the bbox, then close the water faces along the bbox perimeter.
// Walking the perimeter clockwise, every shoreline endpoint flips land/water;
// which parity is "water" is decided by checking that --water-point ends up
// inside a ring, so OSM way direction and roles do not matter. Closed
// shorelines entirely inside the bbox become islands (holes) or lakes.
import { readFileSync, writeFileSync } from "node:fs";

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[++i];
for (const k of ["bbox", "water-point", "ways", "out"]) {
  if (!opts[k]) { console.error(`missing --${k}`); process.exit(2); }
}
const [W, S, E, N] = opts.bbox.split(",").map(Number);
const waterPoint = opts["water-point"].split(",").map(Number);
const Wd = E - W, Hd = N - S, P = 2 * (Wd + Hd);
const EPS = 1e-9;

// ---------------------------------------------------------------- inputs
const relXml = opts.relation ? readFileSync(opts.relation, "utf8") : "";
const roles = new Map();
for (const m of relXml.matchAll(/<member type="way" ref="(\d+)" role="([^"]*)"/g)) roles.set(m[1], m[2]);
const tags = opts.relation
  ? Object.fromEntries([...relXml.matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map((m) => [m[1], m[2]]))
  : Object.fromEntries((opts.tags ?? "natural=water").split(",").map((kv) => kv.split("=")));

const ways = [];
for (const line of readFileSync(opts.ways, "utf8").split("\n")) {
  const l = line.replace(/^\x1e/, "").trim();
  if (!l) continue;
  const f = JSON.parse(l);
  if (f.geometry?.type !== "LineString") continue;
  const id = String(f.properties?.["@id"]);
  ways.push({ id, role: roles.get(id) ?? "outer", coords: f.geometry.coordinates });
}
console.log(opts.relation ? `   relation members: ${roles.size}, member ways in extract: ${ways.length}` : `   shoreline ways: ${ways.length}`);

// ---------------------------------------------------------------- chain ways
const key = (c) => `${c[0]},${c[1]}`;
const byEnd = new Map();
for (const w of ways) {
  for (const k of [key(w.coords[0]), key(w.coords[w.coords.length - 1])]) {
    if (!byEnd.has(k)) byEnd.set(k, []);
    byEnd.get(k).push(w);
  }
}
const used = new Set();
const chains = [];
for (const w of ways) {
  if (used.has(w.id)) continue;
  used.add(w.id);
  let coords = w.coords.slice();
  const rolesSeen = new Set([w.role]);
  const extend = (forward) => {
    for (;;) {
      const end = forward ? coords[coords.length - 1] : coords[0];
      const next = (byEnd.get(key(end)) ?? []).find((o) => !used.has(o.id));
      if (!next) return;
      used.add(next.id);
      rolesSeen.add(next.role);
      let c = next.coords;
      if (forward) {
        if (key(c[0]) !== key(end)) c = c.slice().reverse();
        coords = coords.concat(c.slice(1));
      } else {
        if (key(c[c.length - 1]) !== key(end)) c = c.slice().reverse();
        coords = c.slice(0, -1).concat(coords);
      }
      if (key(coords[0]) === key(coords[coords.length - 1])) return; // closed
    }
  };
  extend(true);
  if (key(coords[0]) !== key(coords[coords.length - 1])) extend(false);
  chains.push({ coords, closed: key(coords[0]) === key(coords[coords.length - 1]), roles: [...rolesSeen] });
}
console.log(`   chains: ${chains.length} (${chains.filter((c) => c.closed).length} closed)`);

// ---------------------------------------------------------------- clip to bbox
const inside = (p) => p[0] >= W - EPS && p[0] <= E + EPS && p[1] >= S - EPS && p[1] <= N + EPS;
function clipSegment(p, q) {
  // Liang–Barsky; returns [t0, t1] or null.
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = 0, t1 = 1;
  for (const [pk, qk] of [[-dx, p[0] - W], [dx, E - p[0]], [-dy, p[1] - S], [dy, N - p[1]]]) {
    if (pk === 0) { if (qk < 0) return null; continue; }
    const r = qk / pk;
    if (pk < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
function clipPolyline(coords) {
  const pieces = [];
  let cur = null;
  const push = (pt) => {
    if (!cur) cur = [];
    const last = cur[cur.length - 1];
    if (!last || Math.abs(last[0] - pt[0]) > EPS || Math.abs(last[1] - pt[1]) > EPS) cur.push(pt);
  };
  for (let i = 0; i < coords.length - 1; i++) {
    const p = coords[i], q = coords[i + 1];
    const t = clipSegment(p, q);
    if (!t) { if (cur && cur.length > 1) pieces.push(cur); cur = null; continue; }
    const [t0, t1] = t;
    if (t0 > 0 && cur && cur.length > 1) { pieces.push(cur); cur = null; }
    push(t0 > 0 ? lerp(p, q, t0) : p);
    push(t1 < 1 ? lerp(p, q, t1) : q);
    if (t1 < 1) { if (cur.length > 1) pieces.push(cur); cur = null; }
  }
  if (cur && cur.length > 1) pieces.push(cur);
  return pieces;
}
// Perimeter parameter, clockwise from the NW corner.
function perimT(p) {
  const onN = Math.abs(p[1] - N) < 1e-7, onS = Math.abs(p[1] - S) < 1e-7;
  const onW = Math.abs(p[0] - W) < 1e-7, onE = Math.abs(p[0] - E) < 1e-7;
  if (onN) return p[0] - W;
  if (onE) return Wd + (N - p[1]);
  if (onS) return Wd + Hd + (E - p[0]);
  if (onW) return 2 * Wd + Hd + (p[1] - S);
  return null;
}
const corners = [[0, [W, N]], [Wd, [E, N]], [Wd + Hd, [E, S]], [2 * Wd + Hd, [W, S]]];
function perimPath(t1, t2) {
  // Corner points strictly between t1 and t2 walking clockwise (wrapping).
  const out = [];
  const span = ((t2 - t1) % P + P) % P;
  for (const [tc, pt] of corners) {
    const d = ((tc - t1) % P + P) % P;
    if (d > EPS && d < span - EPS) out.push([d, pt]);
  }
  return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

const open = [];   // pieces with both ends on the perimeter
const loops = [];  // closed chains fully inside the bbox
for (const ch of chains) {
  if (ch.closed && ch.coords.every(inside)) { loops.push(ch); continue; }
  for (const piece of clipPolyline(ch.coords)) {
    const ta = perimT(piece[0]), tb = perimT(piece[piece.length - 1]);
    if (ta == null || tb == null) {
      // A shoreline ending inside the bbox means the relation is missing a
      // member here; nothing sensible can be closed, so skip it loudly.
      console.warn(`   WARNING: shoreline piece ends inside bbox (${piece[0]} .. ${piece[piece.length - 1]}), skipped`);
      continue;
    }
    open.push({ coords: piece, ta, tb });
  }
}
console.log(`   clipped shoreline pieces: ${open.length}, interior loops: ${loops.length}`);

// ---------------------------------------------------------------- close rings
function ringArea(r) {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
}
function pointInRing(pt, r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function buildRings(waterParity) {
  const events = [];
  open.forEach((p, i) => { events.push({ t: p.ta, piece: i, end: "a" }); events.push({ t: p.tb, piece: i, end: "b" }); });
  events.sort((a, b) => a.t - b.t);
  if (events.length === 0) return waterParity === 0 ? [[[W, N], [E, N], [E, S], [W, S], [W, N]]] : [];
  const byPiece = new Map();
  events.forEach((e, i) => byPiece.set(`${e.piece}${e.end}`, i));
  const rings = [];
  const visited = new Set();
  for (let start = 0; start < events.length; start++) {
    if (start % 2 !== waterParity || visited.has(start)) continue;
    const ring = [];
    let i = start;
    for (let guard = 0; guard < events.length + 1; guard++) {
      if (i % 2 !== waterParity) throw new Error("inconsistent shoreline topology: land interval reached while tracing water");
      visited.add(i);
      const next = (i + 1) % events.length;
      const e = events[i], f = events[next];
      ring.push(e.t === f.t ? events[i].t : null); // placeholder removed below
      ring.pop();
      // perimeter from e to f
      const pe = open[e.piece].coords[e.end === "a" ? 0 : open[e.piece].coords.length - 1];
      ring.push(pe, ...perimPath(e.t, f.t));
      // traverse piece f from its endpoint f.end to the other end
      let coords = open[f.piece].coords;
      if (f.end === "b") coords = coords.slice().reverse();
      ring.push(...coords);
      visited.add(next);
      const otherIdx = byPiece.get(`${f.piece}${f.end === "a" ? "b" : "a"}`);
      i = otherIdx;
      if (i === start) break;
    }
    ring.push(ring[0]);
    rings.push(ring);
  }
  return rings;
}
let rings = null, parityUsed = null;
for (const parity of [0, 1]) {
  try {
    const r = buildRings(parity);
    if (r.some((ring) => pointInRing(waterPoint, ring))) { rings = r; parityUsed = parity; break; }
  } catch (e) {
    console.warn(`   parity ${parity}: ${e.message}`);
  }
}
if (!rings) { console.error("   could not build a water ring containing the water point"); process.exit(1); }
console.log(`   water rings: ${rings.length} (parity ${parityUsed})`);

// Loops: holes if inside a water ring, otherwise standalone water.
const polygons = rings.map((r) => [ringArea(r) < 0 ? r : r.slice().reverse()]); // outer rings CCW
let holes = 0, extra = 0;
for (const loop of loops) {
  const sample = loop.coords[0];
  const host = polygons.find((poly) => pointInRing(sample, poly[0]));
  const ring = loop.coords;
  if (host) { host.push(ringArea(ring) > 0 ? ring.slice().reverse() : ring); holes++; }
  else { polygons.push([ringArea(ring) < 0 ? ring : ring.slice().reverse()]); extra++; }
}
console.log(`   islands (holes): ${holes}, standalone loops: ${extra}`);

const props = { natural: tags.natural ?? "water" };
if (tags.water) props.water = tags.water;
else if (opts.relation) props.water = "lake";
if (tags.name) props.name = tags.name;
const lines = polygons.map((poly) => JSON.stringify({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: poly } }));
writeFileSync(opts.out, lines.join("\n") + "\n");
const areaKm2 = polygons.reduce((s, poly) => s + Math.abs(ringArea(poly[0])), 0) * 111.32 * 111.32 * Math.cos((((S + N) / 2) * Math.PI) / 180);
console.log(`   wrote ${polygons.length} polygon(s), ≈ ${areaKm2.toFixed(0)} km² → ${opts.out}`);
// If the shoreline never reaches the bbox edge (e.g. the bbox extends past the
// extract's shoreline ways), the "water" face is the whole box. Fail loudly.
const bboxKm2 = (E - W) * (N - S) * 111.32 * 111.32 * Math.cos((((S + N) / 2) * Math.PI) / 180);
if (areaKm2 > 0.7 * bboxKm2) {
  console.error(`   ERROR: water covers ${((areaKm2 / bboxKm2) * 100).toFixed(0)}% of the bbox; the shoreline probably does not reach every edge it crosses. Shrink the bbox to where the shoreline ways end.`);
  process.exit(1);
}
