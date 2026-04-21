import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";

/**
 * Initialises WebXR with standard VR options and a floor mesh for teleportation.
 * Returns null instead of throwing when XR is unavailable (e.g. desktop browser).
 */
export async function initXR(
  scene: Scene,
  floorMeshes: Mesh[]
): Promise<WebXRDefaultExperience | null> {
  try {
    const xrHelper = await WebXRDefaultExperience.CreateAsync(scene, {
      floorMeshes,
      uiOptions: {
        sessionMode: "immersive-vr", // swap to "immersive-ar" for passthrough AR
      },
      optionalFeatures: true,
    });
    console.log("WebXR available", xrHelper);
    return xrHelper;
  } catch (e) {
    console.log("WebXR not available:", e);
    return null;
  }
}
