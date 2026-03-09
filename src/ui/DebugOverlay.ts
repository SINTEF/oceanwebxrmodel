import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { Rectangle } from "@babylonjs/gui/2D/controls/rectangle";
import { Control } from "@babylonjs/gui/2D/controls/control";

/**
 * Adds a top-left debug label to an existing fullscreen GUI texture.
 */
export function createDebugOverlay(ui: AdvancedDynamicTexture, terrainMesh: Mesh): void {
  const triangleCount = terrainMesh.getTotalIndices() / 3;

  const bg = new Rectangle("debug-bg");
  bg.width = "180px";
  bg.height = "36px";
  bg.cornerRadius = 4;
  bg.color = "transparent";
  bg.background = "rgba(0,0,0,0.5)";
  bg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
  bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
  bg.left = "12px";
  bg.top = "12px";
  ui.addControl(bg);

  const label = new TextBlock("debug-label", `Triangles: ${triangleCount.toLocaleString()}`);
  label.color = "white";
  label.fontSize = 13;
  label.fontFamily = "monospace";
  bg.addControl(label);
}
