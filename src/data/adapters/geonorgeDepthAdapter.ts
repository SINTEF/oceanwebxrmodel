import { tileBoundsLngLat } from "./mapboxTerrainAdapter";

// ---------------------------------------------------------------------------
// EPSG:3857 (Web Mercator) helpers
// ---------------------------------------------------------------------------

/** Converts a longitude in degrees to Web Mercator easting in metres. */
function lngToMercatorX(lng: number): number {
  return (lng * 20037508.34) / 180;
}

/**
 * Converts a latitude in degrees to Web Mercator northing in metres.
 * Uses the standard Gudermannian inverse.
 */
function latToMercatorY(lat: number): number {
  return (
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / Math.PI) * 20037508.34
  );
}

// ---------------------------------------------------------------------------

const WMS_BASE = "https://wms.geonorge.no/skwms1/wms.havbunnraster3";

/**
 * Fetches the Kartverket/MAREANO bathymetric depth grid for a given Web Mercator
 * tile and returns it as a 256×256 Float32Array of elevation values in metres ASL
 * (negative = below sea level, 0 = sea level, land pixels = 0).
 *
 * The grayscale depth layer (`graa_5m_dybde`) is used: each pixel brightness
 * represents relative depth — bright = shallow, dark = deep. Values are
 * calibrated against the Mapbox tile's own minElev so the two datasets share
 * the same absolute depth scale.
 *
 * Returns undefined when the tile is outside MAREANO coverage or the request fails.
 */
export class GeonorgeDepthAdapter {
  async fetchDepthGrid(
    tx: number,
    ty: number,
    tz: number,
    /** Minimum elevation (metres ASL, negative) from the Mapbox DEM for this tile.
     *  Used to scale Geonorge relative depths to absolute metres. */
    mapboxMinElev: number
  ): Promise<Float32Array | undefined> {
    const { north, south, east, west } = tileBoundsLngLat(tx, ty, tz);

    const minX = lngToMercatorX(west);
    const minY = latToMercatorY(south);
    const maxX = lngToMercatorX(east);
    const maxY = latToMercatorY(north);

    const params = new URLSearchParams({
      SERVICE: "WMS",
      VERSION: "1.3.0",
      REQUEST: "GetMap",
      CRS: "EPSG:3857",
      BBOX: `${minX},${minY},${maxX},${maxY}`,
      WIDTH: "256",
      HEIGHT: "256",
      // Composite grayscale layer that blends multiple source resolutions
      // (50 m, 25 m, 5 m) and covers all zoom scales — same data as the
      // coloured "farget_havbunnraster_dybde_skygge" layer that was previously
      // confirmed to return coverage for this area.
      // Pixel brightness ≈ proportional to depth (includes some hillshade, which
      // adds local slope variation but is acceptable for a research prototype).
      LAYERS: "graa_havbunnraster_dybde_skygge",
      STYLES: "",
      FORMAT: "image/png",
      TRANSPARENT: "TRUE",
    });

    const url = `${WMS_BASE}?${params.toString()}`;
    console.log(`Geonorge depth grid request: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Geonorge WMS returned HTTP ${response.status} — skipping depth merge`);
        return undefined;
      }

      const blob = await response.blob();
      // A very small response means no data / outside coverage area.
      if (blob.size < 200) {
        console.log("Geonorge WMS: no coverage for this tile");
        return undefined;
      }

      // colorSpaceConversion: "none" — prevent sRGB gamma from corrupting the
      // grayscale values we'll use as depth proxy data.
      const bitmap = await createImageBitmap(blob, {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });

      const canvas = new OffscreenCanvas(256, 256);
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const { data } = ctx.getImageData(0, 0, 256, 256);
      const grid = new Float32Array(256 * 256);

      // At low zoom levels (e.g. zoom 7) Mapbox terrain-rgb represents the ocean
      // as a flat 0 m plane — it carries no sub-sea-level depth data there.
      // When mapboxMinElev is 0 (or very close), fall back to a conservative
      // Norwegian-shelf default so the Geonorge depth range is still meaningful.
      const NORWEGIAN_SHELF_MAX_DEPTH = -600; // metres; covers shelf + deep fjords
      const calibrationDepth = mapboxMinElev < -10 ? mapboxMinElev : NORWEGIAN_SHELF_MAX_DEPTH;

      // Map grayscale brightness linearly to depth:
      //   pixel 255 (white / shallowest) → 0 m (sea level)
      //   pixel 0   (black / deepest)    → calibrationDepth (e.g. −600 m)
      // Transparent pixels (land / outside coverage) stay at 0 (no-data sentinel).
      let dataPixels = 0;
      for (let i = 0; i < 256 * 256; i++) {
        const alpha = data[i * 4 + 3];
        if (alpha < 64) {
          grid[i] = 0; // no-data sentinel
          continue;
        }
        const brightness = data[i * 4]; // R channel (R=G=B for grayscale)
        grid[i] = calibrationDepth * (1 - brightness / 255);
        dataPixels++;
      }

      return grid;
    } catch (err) {
      console.warn("Geonorge depth grid fetch failed:", err);
      return undefined;
    }
  }
}
