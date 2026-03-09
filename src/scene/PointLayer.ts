import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions";
import type { PointFeature } from "../data/loaders/geojsonLoader";
import type { TerrainMesh } from "./TerrainMesh";

export interface PointLayerOptions<P> {
  /** Diameter of each marker in scene units (default 0.05 = 1 km at meshScale 0.00005). */
  markerDiameter?: number;
  /** Called to determine the marker colour from feature properties. Defaults to green. */
  colorFn?: (properties: P) => Color3;
  /** Y offset above the computed altitude, in scene units. Keeps markers above the terrain surface. */
  altitudeOffset?: number;
}

const DEFAULT_COLOR = new Color3(0.1, 0.8, 0.2); // green

const randomColor3 = (): Color3 =>
  new Color3(Math.random(), Math.random(), Math.random());

/**
 * Places a BabylonJS sphere marker in the scene for each GeoJSON point feature.
 * Positions are converted via TerrainMesh.latLngToScaledWorld(), which accounts
 * for the terrain's meshScale so markers land correctly in table-top scale.
 */
export function createPointLayer<P>(
  features: PointFeature<P>[],
  terrainMesh: TerrainMesh,
  scene: Scene,
  options: PointLayerOptions<P> = {}
): Mesh[] {
  const {
    markerDiameter = 0.05,
    colorFn = (_p: P) => DEFAULT_COLOR,
    altitudeOffset = 0.05,
  } = options;

  // One material per unique colour to avoid redundant GPU state changes.
  const matCache = new Map<string, StandardMaterial>();

  const getMaterial = (color: Color3): StandardMaterial => {
    const key = color.toHexString();
    if (!matCache.has(key)) {
      const mat = new StandardMaterial(`point-mat-${key}`, scene);
      mat.diffuseColor = color;
      mat.emissiveColor = color.scale(0.3); // slight self-illumination so markers are visible in shadow
      matCache.set(key, mat);
    }
    return matCache.get(key)!;
  };

  return features.map((feature, idx) => {
    const sphere = CreateSphere(`point-${idx}`, { diameter: markerDiameter, segments: 4 }, scene);

    const pos = terrainMesh.latLngToScaledWorld(feature.position);
    pos.y += altitudeOffset;
    sphere.position = pos;

    sphere.material = getMaterial(colorFn(feature.properties));

    // OnPickTrigger fires on mouse click in 2D and on XR controller select (trigger press).
    // BabylonJS routes XR ray-cast picks through the same action system, so no XR-specific code needed.
    sphere.actionManager = new ActionManager(scene);
    sphere.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        sphere.material = getMaterial(randomColor3());
      })
    );

    return sphere;
  });
}
