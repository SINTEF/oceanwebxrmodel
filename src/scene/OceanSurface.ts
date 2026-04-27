import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { WaterMaterial } from "@babylonjs/materials/water/waterMaterial";
import type { TerrainData } from "../data/types";

const WATERBUMP_URL = "https://assets.babylonjs.com/textures/waterbump.png";

export interface OceanSurfaceOptions {
  /** Uniform scene scale — must match TerrainMesh's meshScale. */
  meshScale: number;
  /** Added to the WaterMaterial reflection/refraction render lists so the
   *  seabed satellite texture appears through the water. */
  terrainMesh?: Mesh;
}

/**
 * Creates an animated WaterMaterial surface at sea level (scene Y=0).
 * Wave geometry, reflection RTT, and refraction RTT are all active.
 *
 * Temperature visualisation is handled separately by TemperatureLayer, which
 * sits just below this mesh and shows through the semi-transparent water.
 */
export function createOceanSurface(
  scene: Scene,
  terrainData: TerrainData,
  options: OceanSurfaceOptions
): Mesh {
  const { meshScale, terrainMesh } = options;
  const { planeSizeX, planeSizeZ } = terrainData;

  const width  = planeSizeX * meshScale;
  const height = planeSizeZ * meshScale;

  console.log(`OceanSurface: Y=0 (sea level), plane ${width.toFixed(3)} × ${height.toFixed(3)} scene units`);

  // subdivisions: 32 gives the vertex shader enough geometry to deform into waves.
  const waterMesh = MeshBuilder.CreateGround(
    "ocean-surface",
    { width, height, subdivisions: 32 },
    scene
  );
  waterMesh.position.y = meshScale * 0.5; 

  const waterMat = new WaterMaterial("ocean-water", scene);
  waterMat.bumpTexture     = new Texture(WATERBUMP_URL, scene);
  waterMat.waveHeight      = meshScale * 1.5 * 10;
  waterMat.waveLength      = meshScale * 200 * 5;
  waterMat.waveSpeed       = 0.05;
  waterMat.windForce       = 3;
  waterMat.windDirection   = new Vector2(1, 1);
  waterMat.bumpHeight      = 0.25;
  waterMat.waterColor      = new Color3(0.02, 0.12, 0.0);
  waterMat.colorBlendFactor = 0.1;

  if (terrainMesh) {
    waterMat.addToRenderList(terrainMesh);
  }

  waterMesh.material = waterMat;
  return waterMesh;
}
