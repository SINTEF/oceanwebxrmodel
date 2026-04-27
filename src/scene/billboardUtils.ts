import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";

/**
 * Creates a billboard-mode plane with a dark rounded background and a centred TextBlock.
 * The plane always faces the camera (BILLBOARDMODE_ALL) and renders in group 1 (above terrain).
 *
 * Text content, color, and visibility are NOT set here — callers configure those directly
 * via the returned handles to support both shared hover tooltips and permanent per-pin labels.
 */
export function createBillboardLabel(
  name: string,
  width: number,
  height: number,
  texWidth: number,
  texHeight: number,
  scene: Scene
): { plane: Mesh; textBlock: TextBlock } {
  const plane = CreatePlane(name, { width, height }, scene);
  plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
  plane.renderingGroupId = 1;

  const tex = AdvancedDynamicTexture.CreateForMesh(plane, texWidth, texHeight);

  const bg = new Rectangle(`${name}-bg`);
  bg.background = "rgba(0,0,0,0.65)";
  bg.color = "transparent";
  bg.cornerRadius = 8;
  bg.thickness = 0;
  tex.addControl(bg);

  const textBlock = new TextBlock(`${name}-text`, "");
  textBlock.fontFamily = "monospace";
  textBlock.paddingLeft = "12px";
  textBlock.paddingRight = "12px";
  bg.addControl(textBlock);

  return { plane, textBlock };
}
