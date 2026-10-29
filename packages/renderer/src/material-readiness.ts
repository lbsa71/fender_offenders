import type {Scene} from '@babylonjs/core/scene';

/** Babylon 9.32 can reuse/deallocate parallel programs during light/layout changes.
 * Compile synchronously so draw bindings and the linked program change together.
 * This trades a compilation-time hitch for correct rendering; WebGL2 stays enabled. */
export function requireMatchingMaterialShaders(scene:Scene):void{
  scene.getEngine().getCaps().parallelShaderCompile=undefined;
}
