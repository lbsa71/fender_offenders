import type {Scene} from '@babylonjs/core/scene';

/** Babylon 9.32 can retain incompatible draw bindings across garage/light changes.
 * Compile synchronously and use ordinary uniforms instead of shared uniform buffers.
 * This trades CPU/compilation cost for correct rendering; WebGL2 stays enabled. */
export function requireMatchingMaterialShaders(scene:Scene):void{
  const engine=scene.getEngine();
  engine.getCaps().parallelShaderCompile=undefined;
  if('disableUniformBuffers' in engine)engine.disableUniformBuffers=true;
}
