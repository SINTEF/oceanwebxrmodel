import Martini from "@mapbox/martini";
import type { TerrainData, TerrainGeometry } from "./types";

export interface BuildOptions {
  /** Martini max vertical error in metres (lower = more triangles, default 10). */
  maxError?: number;
  /** Multiplier applied to Y (altitude) for visual clarity (default 1). */
  elevExaggeration?: number;
}

/**
 * Builds terrain geometry from decoded DEM data using the Martini RTIN algorithm.
 * Pure computation over float arrays — no BabylonJS involved.
 * meshScale is NOT applied here; scaling is a scene-layer rendering concern.
 */
export function buildGeometry(
  data: TerrainData,
  options: BuildOptions = {}
): TerrainGeometry {
  const { maxError = 10, elevExaggeration = 1 } = options;
  const { elevation, planeSizeX, planeSizeZ, satelliteUrl, anchor, meshCenter } = data;

  const martini = new Martini(257);
  const marTile = martini.createTile(elevation);
  const { vertices, triangles } = marTile.getMesh(maxError);
  console.log(
    `Martini mesh: ${vertices.length / 2} vertices, ${triangles.length / 3} triangles`
  );

  // Convert Martini pixel-space vertices to world-space positions and UVs.
  // Tile pixel convention: x=0 west, y=0 north (y increases southward).
  // Output space: X=east (right), Y=altitude (up), Z=north (forward) — BabylonJS Y-up left-handed.
  const numVertices = vertices.length / 2;
  const positions = new Float32Array(numVertices * 3);
  const uvs = new Float32Array(numVertices * 2);

  for (let i = 0; i < numVertices; i++) {
    const px = vertices[i * 2];     // 0..256 east-west
    const py = vertices[i * 2 + 1]; // 0..256 north-south (0 = north)
    const nx = px / 256;
    const ny = py / 256;

    positions[i * 3 + 0] = (nx - 0.5) * planeSizeX;                     // X = east
    positions[i * 3 + 1] = elevation[py * 257 + px] * elevExaggeration; // Y = altitude
    positions[i * 3 + 2] = (0.5 - ny) * planeSizeZ;                     // Z = north (flip tile Y)

    uvs[i * 2 + 0] = nx;       // U: 0=west, 1=east
    uvs[i * 2 + 1] = 1 - ny;   // V: flip for BabylonJS (V=1 is top/north)
  }

  const indices = Array.from(triangles) as number[];

  return { positions, indices, uvs, satelliteUrl, anchor, meshCenter };
}
