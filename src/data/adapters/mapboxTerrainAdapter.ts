import type { LatLngAltLike, TerrainData } from "../types";
import type { ITerrainProvider } from "../ports/terrainProvider";

// ---------------------------------------------------------------------------
// Tile coordinate helpers (standard slippy-map / Web Mercator)
// ---------------------------------------------------------------------------

function lngLatToTile(lng: number, lat: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * (Math.PI / 180);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z: zoom };
}

async function fetchSatelliteTile(
  tx: number,
  ty: number,
  tz: number,
  token: string
): Promise<string> {
  const url = `https://api.mapbox.com/v4/mapbox.satellite/${tz}/${tx}/${ty}@2x.jpg90?access_token=${token}`;
  const blob = await fetch(url).then((r) => r.blob());
  return URL.createObjectURL(blob);
}

async function fetchDEMTile(
  tx: number,
  ty: number,
  tz: number,
  token: string
): Promise<ImageBitmap> {
  // colorSpaceConversion: "none" → prevent sRGB gamma from corrupting elevation values.
  // premultiplyAlpha: "none"    → terrain-rgb alpha should always be 255, but guard anyway.
  const url = `https://api.mapbox.com/v4/mapbox.terrain-rgb/${tz}/${tx}/${ty}.png?access_token=${token}`;
  const blob = await fetch(url).then((r) => r.blob());
  return createImageBitmap(blob, {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
}

/**
 * 3×3 median filter on decoded elevation values.
 *
 * Why elevation values and not raw RGB: R, G, B together encode a single 24-bit
 * integer so filtering each channel independently would corrupt the values.
 * Operating on floats avoids that entirely.
 *
 * Why median: preserves sharp ridgelines and cliff edges (unlike Gaussian blur)
 * while eliminating isolated speckle pixels that appear as elevation spikes.
 */
function applyMedianFilter(raw: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(raw.length);
  const window = new Float32Array(9);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const r = Math.min(height - 1, Math.max(0, row + dy));
          const c = Math.min(width - 1, Math.max(0, col + dx));
          window[n++] = raw[r * width + c];
        }
      }
      // Partial insertion sort to find the median (index 4) — faster than full sort for n=9
      for (let i = 1; i < 9; i++) {
        const v = window[i];
        let j = i - 1;
        while (j >= 0 && window[j] > v) { window[j + 1] = window[j]; j--; }
        window[j + 1] = v;
      }
      out[row * width + col] = window[4];
    }
  }
  return out;
}

function decodeTerrain(img: ImageBitmap): {
  elevation: Float32Array;
  minElev: number;
  maxElev: number;
} {
  // Read raw RGBA pixels from the 256×256 tile.
  const canvas = new OffscreenCanvas(256, 256);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, 256, 256);

  // Log raw pixel values at 5 sample points to detect gamma/premultiply corruption.
  const samples = [
    { label: "NW", row: 0, col: 0 },
    { label: "NE", row: 0, col: 255 },
    { label: "SW", row: 255, col: 0 },
    { label: "SE", row: 255, col: 255 },
    { label: "center", row: 128, col: 128 },
  ];
  for (const { label, row, col } of samples) {
    const i = (row * 256 + col) * 4;
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    const elev = -10000 + (r * 65536 + g * 256 + b) * 0.1;
    console.log(
      `  DEM pixel ${label} (${col},${row}): R=${r} G=${g} B=${b} A=${a} → ${elev.toFixed(1)} m ASL`
    );
  }

  // Step 1: Decode 256×256 elevation values from terrain-rgb encoding.
  const raw = new Float32Array(256 * 256);
  let badPixels = 0;
  for (let i = 0; i < 256 * 256; i++) {
    const px = i * 4;
    const elev = -10000 + (data[px] * 65536 + data[px + 1] * 256 + data[px + 2]) * 0.1;
    raw[i] = elev;
    if (elev < -500 || elev > 9000) badPixels++;
  }
  if (badPixels > 0)
    console.warn(
      `  DEM: ${badPixels} pixels outside plausible range — check premultiplyAlpha or tile format`
    );

  // Step 2: Median filter — removes speckle while preserving ridgelines and cliffs.
  const smoothed = applyMedianFilter(raw, 256, 256);

  // Step 3: Build 257×257 Martini grid by duplicating the last row/col.
  const terrain = new Float32Array(257 * 257);
  let minElev = Infinity;
  let maxElev = -Infinity;

  for (let row = 0; row < 257; row++) {
    for (let col = 0; col < 257; col++) {
      const srcRow = Math.min(row, 255);
      const srcCol = Math.min(col, 255);
      const elev = smoothed[srcRow * 256 + srcCol];
      terrain[row * 257 + col] = elev;
      if (elev < minElev) minElev = elev;
      if (elev > maxElev) maxElev = elev;
    }
  }

  // Normalize so the lowest point sits at Y=0
  for (let j = 0; j < terrain.length; j++) terrain[j] -= minElev;

  return { elevation: terrain, minElev, maxElev };
}

// ---------------------------------------------------------------------------

export interface MapboxTerrainAdapterOptions {
  /** When true, shows a raw DEM bitmap overlay in the browser corner for debugging. */
  debug?: boolean;
}

export class MapboxTerrainAdapter implements ITerrainProvider {
  private readonly _token: string;
  private readonly _debug: boolean;

  constructor(token: string, options: MapboxTerrainAdapterOptions = {}) {
    this._token = token;
    this._debug = options.debug ?? false;
  }

  async fetchTerrain(anchor: LatLngAltLike, zoom: number): Promise<TerrainData> {
    const tile = lngLatToTile(anchor.lng, anchor.lat, zoom);

    // Actual geographic width of one tile at this zoom and latitude (metres)
    const planeSize =
      (40075016.686 * Math.cos(anchor.lat * (Math.PI / 180))) / 2 ** zoom;
    console.log(`Tile ${tile.z}/${tile.x}/${tile.y}, planeSize ${planeSize.toFixed(0)} m`);

    const [demBitmap, satelliteUrl] = await Promise.all([
      fetchDEMTile(tile.x, tile.y, tile.z, this._token),
      fetchSatelliteTile(tile.x, tile.y, tile.z, this._token),
    ]);

    if (this._debug) {
      // Show the raw terrain-rgb tile as a browser overlay — duplicate before consuming
      const copyBitmap = await createImageBitmap(demBitmap, {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      this._debugShowBitmap(copyBitmap);
    }

    const { elevation, minElev, maxElev } = decodeTerrain(demBitmap);
    console.log(
      `DEM decoded — ${minElev.toFixed(0)}–${maxElev.toFixed(0)} m ASL, range ${(maxElev - minElev).toFixed(0)} m`
    );

    return { elevation, minElev, maxElev, satelliteUrl, planeSize, anchor };
  }

  private async _debugShowBitmap(demBitmap: ImageBitmap): Promise<void> {
    const canvas = document.createElement("canvas");
    canvas.width = demBitmap.width;
    canvas.height = demBitmap.height;
    const ctx = canvas.getContext("bitmaprenderer")!;
    ctx.transferFromImageBitmap(demBitmap);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res));
    if (blob) {
      const img = document.body.appendChild(new Image());
      img.src = URL.createObjectURL(blob);
      img.style.cssText =
        "position:fixed;top:0;right:0;z-index:9999;width:256px;height:256px;border:2px solid red;";
    }
  }
}
