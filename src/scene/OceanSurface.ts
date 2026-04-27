import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2 } from "@babylonjs/core/Maths/math.vector";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { WaterMaterial } from "@babylonjs/materials/water/waterMaterial";
import type { TerrainData } from "../data/types";

export interface OceanSurfaceOptions {
  /** Uniform scene scale — must match TerrainMesh's meshScale. */
  meshScale: number;
  /** The terrain ground mesh — added to the water's reflection and refraction
   *  render lists so the seabed is visible through the water surface. */
  terrainMesh?: Mesh;
}

/**
 * Creates an animated water surface at sea level (scene Y=0) using BabylonJS
 * WaterMaterial: bump-mapped wave animation, reflection RTT, refraction RTT.
 *
 * All geometry wave parameters (waveHeight, waveLength) are scaled by meshScale
 * so the waves feel proportional at table-top scale (MESH_SCALE = 0.00005).
 *
 * Sea level = 0 m ASL = scene Y=0 — no offset arithmetic needed.
 */
export function createOceanSurface(
  scene: Scene,
  terrainData: TerrainData,
  options: OceanSurfaceOptions
): Mesh {
  const { meshScale, terrainMesh } = options;
  const { planeSizeX, planeSizeZ } = terrainData;

  const width = planeSizeX * meshScale;
  const height = planeSizeZ * meshScale;

  console.log(
    `OceanSurface: Y=0 (sea level), plane ${width.toFixed(3)} × ${height.toFixed(3)} scene units`
  );

  // subdivisions: 32 gives the shader vertices to deform into wave geometry.
  // Without subdivisions the default flat quad shows no geometric wave motion.
  const waterMesh = MeshBuilder.CreateGround(
    "ocean-surface",
    { width, height, subdivisions: 32 },
    scene
  );
  // Tiny epsilon above Y=0 prevents z-fighting with coastal terrain vertices
  // that sit exactly at sea level.
  waterMesh.position.y = meshScale * 0.5-0.005;

  const waterMat = new WaterMaterial("ocean-water", scene);

  // Bump map provides the high-frequency normal perturbation (sparkle/ripple detail).
  // This is separate from the geometry deformation controlled by waveHeight.
  waterMat.bumpTexture = new Texture(
    "https://assets.babylonjs.com/textures/waterbump.png",
    scene
  );

  // Wave geometry — scale to meshScale so waves feel physically proportional.
  // waveHeight: ~1.5 m real-world wave amplitude
  // waveLength: ~200 m real-world wavelength (long ocean swell)
  waterMat.waveHeight  = meshScale * 1.5 *10;
  waterMat.waveLength  = meshScale * 200 *5;
  waterMat.waveSpeed   = 0.05;    // slow, calm Norwegian Sea
  waterMat.windForce   = 3;       // default 6 is too choppy at this scale
  waterMat.windDirection = new Vector2(1, 1); // diagonal swell direction

  // Bump-map intensity — controls the sparkle/refraction sharpness.
  // Intentionally decoupled from waveHeight; can be tuned independently.
  waterMat.bumpHeight = 0.25;

  // Colour — match the scene's existing dark ocean blue.
  waterMat.waterColor       = new Color3(0.02, 0.12, 0.28);
  waterMat.colorBlendFactor = 0.5; // subtle tint; let reflections dominate

  // Add the terrain to the reflection and refraction render target lists so
  // the seabed (and satellite texture) appear through/in the water surface.
  if (terrainMesh) {
    waterMat.addToRenderList(terrainMesh);
  }

  waterMesh.material = waterMat;
  return waterMesh;
}
