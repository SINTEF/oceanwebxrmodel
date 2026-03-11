import type { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ActionManager } from "@babylonjs/core/Actions/actionManager";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import type { PointFeature } from "../data/loaders/geojsonLoader";
import type { TerrainMesh } from "./TerrainMesh";

export interface PointLayerOptions<P> {
  /** Diameter of each marker in scene units (default 0.05 = 1 km at meshScale 0.00005). */
  markerDiameter?: number;
  /** Called to determine the marker colour from feature properties. Defaults to green. */
  colorFn?: (properties: P) => Color3;
  /** Y offset above the computed altitude, in scene units. Keeps markers above the terrain surface. */
  altitudeOffset?: number;
  /**
   * Called on pointer-over to produce the tooltip text for a feature.
   * Return null/undefined to suppress the tooltip for that feature.
   * If omitted entirely, no tooltip is shown.
   */
  labelFn?: (properties: P) => string | null | undefined;
}

const DEFAULT_COLOR = new Color3(0.1, 0.8, 0.2); // green

const randomColor3 = (): Color3 =>
  new Color3(Math.random(), Math.random(), Math.random());

/**
 * Creates a single shared billboard tooltip plane for a point layer.
 * Shown on hover, hidden otherwise. One instance per layer keeps memory usage constant.
 */
function createTooltip(scene: Scene, markerDiameter: number): {
  show: (text: string, position: Vector3) => void;
  hide: () => void;
} {
  const tooltipHeight = markerDiameter * 0.8;
  const tooltipWidth = tooltipHeight * 5;

  const plane = CreatePlane("point-tooltip", { width: tooltipWidth, height: tooltipHeight }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.renderingGroupId = 1;
  plane.isVisible = false;

  const tex = AdvancedDynamicTexture.CreateForMesh(plane, 512, 96);

  const bg = new Rectangle("tooltip-bg");
  bg.background = "rgba(0,0,0,0.72)";
  bg.color = "transparent";
  bg.cornerRadius = 8;
  bg.thickness = 0;
  tex.addControl(bg);

  const text = new TextBlock("tooltip-text", "");
  text.color = "white";
  text.fontSize = 44;
  text.fontFamily = "monospace";
  text.paddingLeft = "14px";
  text.paddingRight = "14px";
  text.textWrapping = true;
  bg.addControl(text);

  return {
    show(label: string, position: Vector3) {
      text.text = label;
      plane.position = new Vector3(
        position.x,
        position.y + markerDiameter * 0.75 + tooltipHeight * 0.6,
        position.z,
      );
      plane.isVisible = true;
    },
    hide() {
      plane.isVisible = false;
    },
  };
}

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
    labelFn,
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

  // Shared tooltip — created only if a labelFn is provided.
  const tooltip = labelFn ? createTooltip(scene, markerDiameter) : null;

  return features.map((feature, idx) => {
    const sphere = CreateSphere(`point-${idx}`, { diameter: markerDiameter, segments: 4 }, scene);

    const pos = terrainMesh.latLngToScaledWorld(feature.position);
    pos.y += altitudeOffset;
    sphere.position = pos;

    sphere.material = getMaterial(colorFn(feature.properties));

    sphere.actionManager = new ActionManager(scene);

    // OnPickTrigger fires on mouse click in 2D and on XR controller select (trigger press).
    // BabylonJS routes XR ray-cast picks through the same action system, so no XR-specific code needed.
    sphere.actionManager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
        sphere.material = getMaterial(randomColor3());
      })
    );

    if (tooltip) {
      sphere.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOverTrigger, () => {
          const label = labelFn(feature.properties);
          if (label) tooltip.show(label, sphere.position);
        })
      );
      sphere.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPointerOutTrigger, () => {
          tooltip.hide();
        })
      );
    }

    return sphere;
  });
}
