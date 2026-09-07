import maplibregl from "maplibre-gl";
import { ungzip } from "pako";

/**
 * The vector tiles in public/data/tiles are stored gzip-compressed but named
 * `.pbf`, so static hosts serve them without a Content-Encoding header and
 * MapLibre would try to parse compressed bytes.
 *
 * This custom protocol fetches a tile and inflates it if the bytes still carry
 * the gzip magic number. When the host does set `Content-Encoding: gzip`
 * (see vercel.json) the browser inflates natively and this is a pass-through,
 * so the same code path works on Vercel, `vite dev`, and the Capacitor shell.
 */

export const GZIP_TILE_PROTOCOL = "gzpbf";

let registered = false;

const isGzip = (bytes: Uint8Array) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

async function inflate(bytes: Uint8Array): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
  }
  const out = ungzip(bytes);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

export function registerGzipTileProtocol(): void {
  if (registered) return;
  registered = true;

  maplibregl.addProtocol(GZIP_TILE_PROTOCOL, async (params, abortController) => {
    const url = params.url.replace(`${GZIP_TILE_PROTOCOL}://`, "");
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`Tile request failed (${response.status}): ${url}`);
    }

    const raw = new Uint8Array(await response.arrayBuffer());
    const data = isGzip(raw) ? await inflate(raw) : raw.buffer;

    return {
      data,
      cacheControl: response.headers.get("Cache-Control") ?? undefined,
      expires: response.headers.get("Expires") ?? undefined,
    };
  });
}

/** Build the templated tile URL for the current platform. */
export function getTileUrlTemplate(): string {
  return `${GZIP_TILE_PROTOCOL}://${window.location.origin}/data/tiles/{z}/{x}/{y}.pbf`;
}
