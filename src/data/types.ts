export type LatLngAltLike = {
  lat: number;
  lng: number;
  altitude: number;
};

/** Geographic anchor with a map zoom level — used for tile fetching and as the terrain origin. */
export type LatLngZoomLike = {
  lat: number;
  lng: number;
  zoom: number;
};

/** Raw terrain data returned by ITerrainProvider. No BabylonJS. */
export interface TerrainData {
  /** 257×257 elevation grid in metres, normalized so the minimum value is 0. */
  elevation: Float32Array;
  /** Raw elevation of the lowest point in metres ASL (before normalization). */
  minElev: number;
  /** Raw elevation of the highest point in metres ASL (before normalization). */
  maxElev: number;
  /** blob: URL for the satellite image — pass directly to BabylonJS Texture. */
  satelliteUrl: string;
  /** Tile width in metres (east-west). Used for mesh X axis. */
  planeSizeX: number;
  /** Tile height in metres (north-south). Used for mesh Z axis. */
  planeSizeZ: number;
  /** Geographic centre of the terrain tile — corresponds to world-space origin (0,0,0). */
  meshCenter: { lat: number; lng: number };
  /** Geographic reference point used to select the tile. */
  anchor: LatLngZoomLike;
}

/** Computed geometry ready for a 3D renderer. Produced by TerrainBuilder. No BabylonJS. */
export interface TerrainGeometry {
  /** Flat XYZ triples in BabylonJS world space (X=east, Y=altitude, Z=north), in metres. */
  positions: Float32Array;
  /** Triangle indices (three indices per triangle). */
  indices: number[];
  /** Flat UV pairs (U=west→east, V=south→north after BabylonJS flip). */
  uvs: Float32Array;
  /** Passed through from TerrainData — blob: URL for satellite texture. */
  satelliteUrl: string;
  /** Geographic centre of the tile — the true world-space origin (0,0,0) for coordinate conversions. */
  meshCenter: { lat: number; lng: number };
  /** Passed through from TerrainData — used by scene layer for coordinate conversions. */
  anchor: LatLngZoomLike;
}
