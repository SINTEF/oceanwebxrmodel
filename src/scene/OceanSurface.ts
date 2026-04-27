import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { TerrainData } from "../data/types";

export interface OceanSurfaceOptions {

  /** Uniform scene scale — must match TerrainMesh's meshScale. */
  meshScale: number;
}

/**
 * Creates a semi-transparent water surface plane at sea level (scene Y=0).
 *
 * Elevation values are stored as raw ASL metres, so 0 m ASL = local Y=0 in
 * the terrain mesh = scene Y=0 after meshScale is applied. No offset arithmetic
 * is needed — the ocean surface is unconditionally at Y=0.
 *
 * Depth geometry is encoded directly in the terrain mesh (merged from Mapbox DEM
 * and Geonorge MAREANO bathymetry inside MapboxTerrainAdapter), so no separate
 * depth-texture plane is needed here.
 */
export function createOceanSurface(
  scene: Scene,
  terrainData: TerrainData,
  options: OceanSurfaceOptions
): Mesh {
  const { meshScale } = options;
  const { planeSizeX, planeSizeZ } = terrainData;

  const width = planeSizeX * meshScale;
  const height = planeSizeZ * meshScale;

  console.log(
    `OceanSurface: Y=0 (sea level), plane ${width.toFixed(3)} × ${height.toFixed(3)} scene units`
  );

  const waterMesh = MeshBuilder.CreateGround(
    "ocean-surface",
    { width, height },
    scene
  );
  // Sea level = 0 m ASL = scene Y=0. A tiny epsilon avoids z-fighting with
  // coastal terrain vertices that sit exactly at sea level.
  waterMesh.position.y = meshScale * 0.5;

  const waterMat = new PBRMaterial("ocean-surface-mat", scene);
  // Deep ocean blue, slightly reflective
  waterMat.albedoColor = new Color3(0.02, 0.12, 0.28);
  waterMat.metallic = 0.1;
  waterMat.roughness = 0.05;
  waterMat.alpha = 0.55;
  waterMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  waterMat.backFaceCulling = false;
  waterMesh.material = waterMat;

  return waterMesh;
}
