import type { LatLngZoomLike, TerrainData } from "../types";
import type { ITerrainProvider } from "../ports/terrainProvider";
import type { GeonorgeDepthAdapter } from "./geonorgeDepthAdapter";

// ---------------------------------------------------------------------------
// Tile coordinate helpers (standard slippy-map / Web Mercator)
// ---------------------------------------------------------------------------

export function lngLatToTile(lng: number, lat: number, zoom: number) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = lat * (Math.PI / 180);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z: zoom };
}

/**
 * Returns the geographic bounding box of a Web Mercator tile in degrees.
 *
 * The latitude formula uses the inverse Gudermannian (sinh/atan) to invert the
 * Mercator projection, which is non-linear — tiles near the poles span more
 * degrees of latitude than equatorial tiles at the same zoom level.
 */
export function tileBoundsLngLat(tx: number, ty: number, tz: number) {
  const n = 2 ** tz;
  const west  = (tx / n) * 360 - 180;
  const east  = ((tx + 1) / n) * 360 - 180;
  const north = Math.atan(Math.sinh(Math.PI * (1 - (2 * ty)       / n))) * (180 / Math.PI);
  const south = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 1)) / n))) * (180 / Math.PI);
  return { north, south, east, west };
}

/**
 * Returns the real-world dimensions of a Web Mercator tile in metres.
 *
 * Width applies the cosine correction for the centre latitude: Mercator stretches
 * horizontal spacing toward the poles, so a degree of longitude at 60° is only
 * half as wide in metres as at the equator.
 * Height uses 110 540 m/° which is accurate to within ~1% for all latitudes.
 */
export function tileSizeMetres(tx: number, ty: number, tz: number): { widthMetres: number; heightMetres: number } {
  const { north, south, east, west } = tileBoundsLngLat(tx, ty, tz);
  const centerLat    = (north + south) / 2;
  const widthMetres  = (east  - west)  * 111_320 * Math.cos(centerLat * (Math.PI / 180));
  const heightMetres = (north - south) * 110_540;
  return { widthMetres, heightMetres };
}

async function fetchSatelliteTile(
  tx: number,
  ty: number,
  tz: number,
  token: string
): Promise<string> {
  // Each tile at zoom z maps to a 4×4 grid of descendants at zoom z+2.
  const zoomOffset = 2;
  const childZ = tz + zoomOffset;
  const gridSize = 2 ** zoomOffset; // 4
  const baseX = tx * gridSize;
  const baseY = ty * gridSize;
  const childTiles = Array.from({ length: gridSize * gridSize }, (_, i) => ({
    x: baseX + (i % gridSize),
    y: baseY + Math.floor(i / gridSize),
    col: i % gridSize,
    row: Math.floor(i / gridSize),
  }));

  const tileSize = 512; // @2x tiles are 512×512
  const canvas = new OffscreenCanvas(tileSize * gridSize, tileSize * gridSize);
  const ctx = canvas.getContext("2d")!;

  await Promise.all(
    childTiles.map(async ({ x, y, col, row }) => {
      const url = `https://api.mapbox.com/v4/mapbox.satellite/${childZ}/${x}/${y}@2x.jpg90?access_token=${token}`;
      const blob = await fetch(url).then((r) => r.blob());
      const bitmap = await createImageBitmap(blob);
      ctx.drawImage(bitmap, col * tileSize, row * tileSize);
      bitmap.close();
    })
  );

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
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

function decodeTerrain(
  img: ImageBitmap,
  debug: boolean,
  /** Optional 256×256 depth grid from Geonorge (metres ASL, negative = ocean,
   *  0 = land/no-data sentinel). When provided, Geonorge values replace Mapbox
   *  values for underwater pixels, adding higher-accuracy seafloor detail. */
  geonorgeGrid?: Float32Array
): {
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
  if (debug) {
    for (const { label, row, col } of samples) {
      const i = (row * 256 + col) * 4;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      const elev = -10000 + (r * 65536 + g * 256 + b) * 0.1;
      console.log(
        `  DEM pixel ${label} (${col},${row}): R=${r} G=${g} B=${b} A=${a} → ${elev.toFixed(1)} m ASL`
      );
    }
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

  // Step 2b: Merge Geonorge bathymetry into ocean pixels (raw ASL space,
  // before normalization so both grids are in the same units).
  // Geonorge grid value 0 is the "no data" sentinel (land or outside coverage).
  // Geonorge wins whenever it has ocean data — at low zoom levels Mapbox shows
  // the sea as a flat 0 m plane (no sub-sea-level depth), so we intentionally
  // do NOT require smoothed[i] < 0 here.
  let mergedPixels = 0;
  if (geonorgeGrid) {
    for (let i = 0; i < 256 * 256; i++) {
      const geoDepth = geonorgeGrid[i];
      if (geoDepth < 0) {
        // Both say ocean — Geonorge gives better depth detail.
        smoothed[i] = geoDepth;
        mergedPixels++;
      }
    }
    console.log(`Geonorge merge: replaced ${mergedPixels} underwater pixels out of total ${256 * 256} pixels (${((mergedPixels / (256 * 256)) * 100).toFixed(2)}%)`);
  }

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

  // Do NOT normalize. Elevation values are kept in raw ASL metres so that sea
  // level (0 m) always maps to local Y=0 in the mesh, and the OceanSurface plane
  // can be placed unconditionally at scene Y=0. Ocean floor vertices are negative,
  // land vertices are positive — the natural coordinate system.

  return { elevation: terrain, minElev, maxElev };
}

// ---------------------------------------------------------------------------

export interface MapboxTerrainAdapterOptions {
  /** When true, shows a raw DEM bitmap overlay in the browser corner for debugging. */
  debug?: boolean;
  /** Optional Geonorge depth adapter. When provided, MAREANO bathymetry is
   *  fetched in parallel and merged into the elevation grid for underwater pixels. */
  depthAdapter?: GeonorgeDepthAdapter;
}

export class MapboxTerrainAdapter implements ITerrainProvider {
  private readonly _token: string;
  private readonly _debug: boolean;
  private readonly _depthAdapter: GeonorgeDepthAdapter | undefined;

  constructor(token: string, options: MapboxTerrainAdapterOptions = {}) {
    this._token = token;
    this._debug = options.debug ?? false;
    this._depthAdapter = options.depthAdapter;
  }

  async fetchTerrain(anchor: LatLngZoomLike): Promise<TerrainData> {
    const { zoom } = anchor;
    const tile = lngLatToTile(anchor.lng, anchor.lat, zoom);

    const bounds = tileBoundsLngLat(tile.x, tile.y, tile.z);
    const meshCenter = {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east  + bounds.west)  / 2,
    };
    const { widthMetres, heightMetres } = tileSizeMetres(tile.x, tile.y, tile.z);
    if (this._debug) console.log(
      `Tile ${tile.z}/${tile.x}/${tile.y} | centre lat=${meshCenter.lat.toFixed(5)}, lng=${meshCenter.lng.toFixed(5)} | ` +
      `size: ${widthMetres.toFixed(0)} m (EW) × ${heightMetres.toFixed(0)} m (NS)`
    );

    // Fetch DEM, satellite, and (optionally) Geonorge depth in parallel.
    // Geonorge needs Mapbox minElev for calibration — so we do a two-step fetch:
    // first DEM + satellite together, then decode DEM to get minElev, then Geonorge.
    // In practice the Geonorge fetch is fast enough that sequential is acceptable.
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

    // First pass: decode without Geonorge to find minElev, needed to calibrate
    // the Geonorge grayscale pixels to an absolute depth scale.
    // ImageBitmap is not consumed by drawImage, so the bitmap can be reused.
    const firstPass = decodeTerrain(demBitmap, this._debug);

    // Fetch Geonorge depth grid calibrated to the Mapbox depth range.
    const geonorgeGrid = this._depthAdapter
      ? await this._depthAdapter.fetchDepthGrid(tile.x, tile.y, tile.z, firstPass.minElev)
      : undefined;

    // Second pass: re-decode + merge Geonorge into underwater pixels.
    // If no Geonorge data was returned, reuse the first-pass result as-is.
    const { elevation, minElev, maxElev } = geonorgeGrid
      ? decodeTerrain(demBitmap, this._debug, geonorgeGrid)
      : firstPass;
    if (this._debug) console.log(
      `DEM decoded — ${minElev.toFixed(0)}–${maxElev.toFixed(0)} m ASL, range ${(maxElev - minElev).toFixed(0)} m`
    );

    return { elevation, minElev, maxElev, satelliteUrl, planeSizeX: widthMetres, planeSizeZ: heightMetres, meshCenter, anchor };
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
