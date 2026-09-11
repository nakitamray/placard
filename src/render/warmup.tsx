/**
 * Compile the shaders before anybody is looking at the room.
 *
 * A WebGL program is not built when it is written, it is built when something
 * first tries to draw with it — and building it blocks the thread it is on.
 * For a scene with a custom glyph shader, a reflective floor and a lit vault
 * that is one hard stall, a few hundred milliseconds to a couple of seconds,
 * landing on precisely the frame the visitor is first looking at. Then it is
 * cached and never happens again, which is exactly the shape of the complaint:
 * rough for a second or two, perfectly smooth afterwards.
 *
 * Nothing can make that compile free. What it can do is happen somewhere else.
 * This runs it while the entrance curtain is still down, so the cost is paid
 * against a loading screen that is already asking the visitor to wait rather
 * than against the first seconds of the exhibition.
 *
 * `compileAsync` hands the work to the driver and resolves when it is done,
 * using KHR_parallel_shader_compile where the browser has it — so even this
 * wait does not lock the page, and the rule across the bottom keeps moving.
 * Older renderers fall back to the synchronous compile, which is still in the
 * right place; it just holds the curtain instead of the exhibition.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { markBoot } from '../state/boot';

type Compilable = THREE.WebGLRenderer & {
  compileAsync?: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<unknown>;
};

/**
 * Compile a scene and report the step, once.
 *
 * `deps` is what must exist before compiling is worth anything: compiling an
 * empty scene succeeds instantly and teaches the driver nothing, so the pass
 * that owns the expensive material asks for this only once it has one.
 */
export function useWarmup(
  scene: THREE.Object3D | null,
  ready: boolean,
  /**
   * Whether finishing this compile is what the door is waiting on.
   *
   * Both the room and the glyph pre-pass are warmed, but only one of them can
   * be the step that opens it, and it has to be the expensive one. The glyph
   * material — tens of thousands of instanced quads, each sampling a corpus
   * and an atlas — is the compile worth waiting for; reporting when the far
   * cheaper room finished would open the door straight back onto the stall
   * this exists to move.
   */
  reports = false,
) {
  const gl = useThree((s) => s.gl) as Compilable;
  const camera = useThree((s) => s.camera);
  const defaultScene = useThree((s) => s.scene);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const target = scene ?? defaultScene;
    const done = () => {
      if (alive && reports) markBoot('light');
    };
    if (gl.compileAsync) {
      void gl.compileAsync(target, camera).then(done, done);
    } else {
      gl.compile(target, camera);
      done();
    }
    return () => {
      alive = false;
    };
  }, [gl, camera, scene, defaultScene, ready, reports]);
}

/** The same thing as a component, for the main scene graph. */
export function Warmup({ ready }: { ready: boolean }) {
  useWarmup(null, ready);
  return null;
}
