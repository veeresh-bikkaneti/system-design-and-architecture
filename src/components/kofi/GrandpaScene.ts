import * as THREE from 'three';

/**
 * GrandpaScene — a tiny procedural Three.js scene for the Ko-fi widget.
 *
 * Grandpa sits on a bench under a tree, mug in hand, built entirely from
 * low-poly primitives (no models, textures, or network loads). It replaces
 * the flat SVG figure in KofiBench with the same identity and footprint.
 *
 * The React component owns all behavior (copy, confirm, env gating); this
 * file only owns the 3D scene. It exposes a mount function that returns a
 * handle, or null when WebGL is unavailable so the caller can fall back to
 * the SVG figure. Import only from 'three' — no React here.
 */

export interface GrandpaSceneHandle {
  /** Stop the loop and release every GPU resource. Safe to call once. */
  dispose(): void;
  /** Play the one-shot refill (mug raises, kettle pours, mug lowers). */
  playRefill(): void;
}

// ---------------------------------------------------------------------------
// Palette — matched to the SVG figure this scene replaces.
// ---------------------------------------------------------------------------
const COLORS = {
  woodLight: 0x92400e,
  woodDark: 0x78350f,
  benchLeg: 0x44403c,
  sweater: 0x0f7668,
  skin: 0xfed7aa,
  hair: 0xd6d3d1,
  trousers: 0x57534e,
  shoe: 0x292524,
  eye: 0x1c1917,
  mug: 0xf59e0b,
  kettle: 0xa8a29e,
  kettleDark: 0x78716c,
  stream: 0x38bdf8,
  canopy: [0x0f7668, 0x059669, 0x047857],
} as const;

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

/** A flat-shaded standard material — the one material style for the scene. */
function flat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...extra });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  return m;
}

/** 0..1 smoothstep, for gentle animation easing. */
function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Map elapsed time in [start, end] to a smoothed 0..1. */
function phase(elapsed: number, start: number, end: number): number {
  return smooth((elapsed - start) / (end - start));
}

/**
 * Same window, but a hard ease-out (fast start, decisive landing).
 * Choreography rule borrowed from huashu-motion's rhythm notes: soft
 * smoothstep everywhere reads sleepy; physical moves — a mug lifting, a
 * kettle tipping into the pour — want the hard ease-out, with smoothstep
 * kept for the gentle returns.
 */
function phaseOut(elapsed: number, start: number, end: number): number {
  const x = Math.min(1, Math.max(0, (elapsed - start) / (end - start)));
  return 1 - Math.pow(1 - x, 3);
}

// ---------------------------------------------------------------------------
// Scene construction.
// ---------------------------------------------------------------------------

interface BuiltScene {
  root: THREE.Group;
  torso: THREE.Mesh;
  headGroup: THREE.Group;
  eyesGroup: THREE.Group;
  mugArm: THREE.Group;
  mugGroup: THREE.Group;
  kettle: THREE.Group;
  kettleMaterials: THREE.MeshStandardMaterial[];
  stream: THREE.Mesh;
  streamMaterial: THREE.MeshStandardMaterial;
}

function buildScene(): BuiltScene {
  const root = new THREE.Group();

  // -- Ground shadow: one translucent ellipse, no real shadow maps. --------
  const shadow = mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(3.9, 1.05, 1);
  shadow.position.x = -0.2;
  shadow.position.y = 0.01;
  root.add(shadow);

  // -- Tree, to the viewer's left of the bench. -----------------------------
  const tree = new THREE.Group();
  tree.position.x = -2.55;
  const trunk = mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.6, 7), flat(COLORS.woodDark));
  trunk.position.y = 1.3;
  tree.add(trunk);
  const canopySpecs: Array<[number, number, number, number, number]> = [
    // [x, y, z, radius, colorIndex]
    [0, 3.6, 0, 1.15, 0],
    [-0.85, 3.0, 0.15, 0.85, 1],
    [0.8, 3.05, -0.1, 0.8, 2],
  ];
  for (const [x, y, z, r, ci] of canopySpecs) {
    const blob = mesh(new THREE.SphereGeometry(r, 10, 8), flat(COLORS.canopy[ci]));
    blob.position.set(x, y, z);
    tree.add(blob);
  }
  root.add(tree);

  // -- Bench: wood slats + dark legs. ---------------------------------------
  const bench = new THREE.Group();
  const woodLight = flat(COLORS.woodLight);
  const woodDark = flat(COLORS.woodDark);
  const legMat = flat(COLORS.benchLeg);
  for (const z of [-0.3, 0, 0.3]) {
    const seatSlat = mesh(new THREE.BoxGeometry(3.4, 0.12, 0.24), z === 0 ? woodDark : woodLight);
    seatSlat.position.set(1.15, 1.5, z);
    bench.add(seatSlat);
  }
  for (const y of [2.45, 3.05]) {
    const backSlat = mesh(new THREE.BoxGeometry(3.4, 0.3, 0.1), y > 2.7 ? woodDark : woodLight);
    backSlat.position.set(1.15, y, -0.44);
    bench.add(backSlat);
  }
  for (const x of [-0.3, 2.6]) {
    for (const z of [-0.3, 0.3]) {
      const leg = mesh(new THREE.BoxGeometry(0.15, 1.5, 0.15), legMat);
      leg.position.set(x, 0.75, z);
      bench.add(leg);
    }
  }
  root.add(bench);

  // -- Grandpa, seated at the right end of the bench. -----------------------
  const grandpa = new THREE.Group();
  const gx = 1.35; // his center along the bench

  // Legs: thighs forward, shins down, shoes on the ground.
  const trouserMat = flat(COLORS.trousers);
  const shoeMat = flat(COLORS.shoe);
  for (const side of [-1, 1]) {
    const thigh = mesh(new THREE.CapsuleGeometry(0.17, 0.5, 3, 8), trouserMat);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(gx + side * 0.24, 1.56, 0.38);
    grandpa.add(thigh);
    const shin = mesh(new THREE.CapsuleGeometry(0.14, 0.5, 3, 8), trouserMat);
    shin.position.set(gx + side * 0.24, 0.95, 0.68);
    grandpa.add(shin);
    const shoe = mesh(new THREE.BoxGeometry(0.24, 0.14, 0.44), shoeMat);
    shoe.position.set(gx + side * 0.24, 0.09, 0.8);
    grandpa.add(shoe);
  }

  // Torso in the teal sweater; breathing scales this mesh.
  const torso = mesh(new THREE.CapsuleGeometry(0.52, 0.85, 4, 10), flat(COLORS.sweater));
  torso.position.set(gx, 2.5, -0.05);
  torso.rotation.x = -0.06;
  grandpa.add(torso);

  // Resting arm (viewer's left): shoulder down to a hand on the thigh.
  const sweaterMat = flat(COLORS.sweater);
  const skinMat = flat(COLORS.skin);
  const restArm = new THREE.Group();
  restArm.position.set(gx - 0.56, 3.08, 0);
  const restUpper = mesh(new THREE.CapsuleGeometry(0.13, 0.4, 3, 8), sweaterMat);
  restUpper.position.set(-0.08, -0.28, 0.02);
  restUpper.rotation.z = -0.25;
  restArm.add(restUpper);
  const restFore = mesh(new THREE.CapsuleGeometry(0.11, 0.34, 3, 8), sweaterMat);
  restFore.position.set(-0.16, -0.6, 0.28);
  restFore.rotation.x = -1.1;
  restArm.add(restFore);
  const restHand = mesh(new THREE.SphereGeometry(0.12, 8, 8), skinMat);
  restHand.position.set(-0.17, -0.66, 0.52);
  restArm.add(restHand);
  grandpa.add(restArm);

  // Mug arm (viewer's right): a group pivoted at the shoulder so the
  // refill can raise the forearm + mug toward the body.
  const mugArm = new THREE.Group();
  mugArm.position.set(gx + 0.56, 3.08, 0);
  const mugUpper = mesh(new THREE.CapsuleGeometry(0.13, 0.4, 3, 8), sweaterMat);
  mugUpper.position.set(0.08, -0.28, 0.02);
  mugUpper.rotation.z = 0.25;
  mugArm.add(mugUpper);
  const mugFore = mesh(new THREE.CapsuleGeometry(0.11, 0.34, 3, 8), sweaterMat);
  mugFore.position.set(0.18, -0.58, 0.28);
  mugFore.rotation.x = -1.15;
  mugArm.add(mugFore);
  const mugHand = mesh(new THREE.SphereGeometry(0.12, 8, 8), skinMat);
  mugHand.position.set(0.2, -0.62, 0.52);
  mugArm.add(mugHand);

  // The amber mug, held at lap height at rest.
  const mugGroup = new THREE.Group();
  mugGroup.position.set(0.2, -0.55, 0.62);
  const mugBody = mesh(
    new THREE.CylinderGeometry(0.15, 0.13, 0.27, 12),
    flat(COLORS.mug, { roughness: 0.55 }),
  );
  mugGroup.add(mugBody);
  const mugHandle = mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 12), flat(COLORS.mug, { roughness: 0.55 }));
  mugHandle.position.x = 0.17;
  mugGroup.add(mugHandle);
  mugArm.add(mugGroup);
  grandpa.add(mugArm);

  // Head: pivots at the neck so the sway looks natural.
  const headGroup = new THREE.Group();
  headGroup.position.set(gx, 3.32, 0);
  const head = mesh(new THREE.SphereGeometry(0.46, 14, 12), skinMat);
  head.position.y = 0.44;
  headGroup.add(head);
  // Grey curls: a small arc of spheres over the top and back of the head.
  const hairMat = flat(COLORS.hair);
  const curlSpecs: Array<[number, number, number, number]> = [
    [-0.3, 0.78, -0.05, 0.17],
    [-0.12, 0.86, -0.1, 0.18],
    [0.08, 0.87, -0.1, 0.18],
    [0.28, 0.79, -0.05, 0.17],
    [-0.4, 0.62, -0.14, 0.15],
    [0.4, 0.63, -0.14, 0.15],
    [0, 0.9, 0.08, 0.16],
  ];
  for (const [x, y, z, r] of curlSpecs) {
    const curl = mesh(new THREE.SphereGeometry(r, 8, 8), hairMat);
    curl.position.set(x, y, z);
    headGroup.add(curl);
  }
  // Beard: a flattened sphere tucked under the chin, front of the face.
  const beard = mesh(new THREE.SphereGeometry(0.34, 10, 8), hairMat);
  beard.scale.set(1.05, 0.85, 0.6);
  beard.position.set(0, 0.16, 0.24);
  headGroup.add(beard);
  // Eyes in their own group so a blink is one scale change.
  const eyesGroup = new THREE.Group();
  eyesGroup.position.y = 0.5;
  const eyeMat = flat(COLORS.eye, { roughness: 0.4 });
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eye.position.set(side * 0.16, 0, 0.42);
    eyesGroup.add(eye);
  }
  headGroup.add(eyesGroup);
  grandpa.add(headGroup);
  root.add(grandpa);

  // -- Kettle + pour stream: hidden at rest, only seen during a refill. -----
  const kettleMaterials = [
    flat(COLORS.kettle, { roughness: 0.35, metalness: 0.65, transparent: true, opacity: 0 }),
    flat(COLORS.kettleDark, { roughness: 0.45, metalness: 0.5, transparent: true, opacity: 0 }),
  ];
  const kettle = new THREE.Group();
  const kettleBody = mesh(new THREE.CylinderGeometry(0.2, 0.29, 0.42, 12), kettleMaterials[0]);
  kettle.add(kettleBody);
  const kettleLid = mesh(new THREE.SphereGeometry(0.07, 8, 6), kettleMaterials[1]);
  kettleLid.position.y = 0.25;
  kettle.add(kettleLid);
  const kettleSpout = mesh(new THREE.ConeGeometry(0.07, 0.3, 8), kettleMaterials[0]);
  kettleSpout.position.set(-0.3, 0.02, 0);
  kettleSpout.rotation.z = -2.25; // tip swung down toward the mug side
  kettle.add(kettleSpout);
  const kettleHandle = mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 12, Math.PI), kettleMaterials[1]);
  kettleHandle.position.set(-0.05, 0.19, 0);
  kettle.add(kettleHandle);
  kettle.visible = false;
  root.add(kettle);

  const streamMaterial = flat(COLORS.stream, { transparent: true, opacity: 0, roughness: 0.3 });
  const stream = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 6), streamMaterial);
  stream.rotation.z = 0.3;
  stream.visible = false;
  root.add(stream);

  return { root, torso, headGroup, eyesGroup, mugArm, mugGroup, kettle, kettleMaterials, stream, streamMaterial };
}

// ---------------------------------------------------------------------------
// Mount: renderer, camera, loop discipline, and the public handle.
// ---------------------------------------------------------------------------

const REFILL_SECONDS = 3.5;

export function mountGrandpaScene(
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean },
): GrandpaSceneHandle | null {
  // Graceful fallback: no WebGL context, no scene — caller uses the SVG.
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const built = buildScene();
  scene.add(built.root);

  // Lighting: soft hemisphere fill + one directional key light. No shadows
  // (the fake ground ellipse does that job, for free).
  scene.add(new THREE.HemisphereLight(0xfff7e6, 0x8a7f70, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  // Default camera matters: a fixed gentle 3/4 front view, framed so the
  // tree, bench, and headroom for the speech cloud all fit the widget box.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
  camera.position.set(1.7, 3.6, 10);
  camera.lookAt(-0.7, 2.3, 0);

  // The ortho camera has no aspect property of its own; we track it here.
  let viewAspect = 230 / 160;
  const fitCamera = (): void => {
    const aspect = viewAspect;
    const frustumHeight = Math.max(5.3, 7.8 / aspect);
    camera.top = frustumHeight / 2;
    camera.bottom = -frustumHeight / 2;
    camera.left = (-frustumHeight * aspect) / 2;
    camera.right = (frustumHeight * aspect) / 2;
    camera.updateProjectionMatrix();
  };

  const resize = (): void => {
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 230;
    const height = canvas.clientHeight || canvas.parentElement?.clientHeight || 160;
    renderer.setSize(width, height, false);
    viewAspect = width / height;
    fitCamera();
  };
  resize();

  // Loop discipline: render only while the canvas is on screen and the tab
  // is visible. The RAF handle is cancelled whenever either goes away.
  let rafId = 0;
  let running = false;
  let intersecting = true;
  let disposed = false;
  const clock = new THREE.Clock();

  // Animation state.
  let refillStart = -1; // clock time the current refill began; -1 = at rest
  let nextBlinkAt = 2.5 + Math.random() * 2;
  const mugWorld = new THREE.Vector3();

  const setKettleOpacity = (opacity: number): void => {
    for (const m of built.kettleMaterials) m.opacity = opacity;
    built.kettle.visible = opacity > 0.01;
  };

  /** Pose the mug arm / kettle / stream for a refill progress 0..1. */
  const poseRefill = (elapsed: number): void => {
    // Choreography (huashu-motion rhythm notes): a beat of anticipation,
    // a hard ease-out up, the pour landing exactly at full tilt, a gentle
    // return, and a small settle bob when the mug lands — motion, then a
    // held stillness, so the refill reads as one event against the quiet
    // idle instead of a constant wiggle.
    const anticipation = phase(elapsed, 0, 0.08) - phase(elapsed, 0.08, 0.22);
    const raise = phaseOut(elapsed, 0.08, 0.62) - phase(elapsed, 2.5, 3.05);
    built.mugArm.rotation.x = -0.5 * raise + 0.07 * anticipation;
    built.mugArm.rotation.y = -0.3 * raise;
    // The landing hit: one small dip-and-recover just after the mug is down.
    const settleT = (elapsed - 3.05) / 0.45;
    if (settleT >= 0 && settleT <= 1) {
      built.mugArm.rotation.x += 0.045 * Math.sin(settleT * Math.PI) * (1 - settleT);
    }

    // Kettle fades in, tilts to pour, untilts, fades out.
    const fadeIn = phase(elapsed, 0.15, 0.6);
    const fadeOut = phase(elapsed, 2.5, 3.05);
    setKettleOpacity(fadeIn * (1 - fadeOut));
    const tilt = phaseOut(elapsed, 0.7, 1.0) - phase(elapsed, 2.2, 2.5);
    built.kettle.rotation.z = -0.45 * tilt;

    // The kettle hovers just above wherever the raised mug is.
    built.mugGroup.getWorldPosition(mugWorld);
    built.kettle.position.set(mugWorld.x + 0.5, mugWorld.y + 0.55, mugWorld.z);

    // The stream runs only while the kettle is fully tilted.
    const pouring = elapsed >= 1.0 && elapsed <= 2.2 ? 1 : 0;
    built.stream.visible = pouring > 0;
    built.streamMaterial.opacity = 0.9 * pouring;
    if (pouring > 0) {
      built.stream.position.set(mugWorld.x + 0.12, mugWorld.y + 0.32, mugWorld.z);
    }
  };

  const clearRefill = (): void => {
    refillStart = -1;
    built.mugArm.rotation.set(0, 0, 0);
    built.kettle.rotation.z = 0;
    setKettleOpacity(0);
    built.stream.visible = false;
    built.streamMaterial.opacity = 0;
  };

  const tick = (): void => {
    if (!running || disposed) return;
    rafId = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();

    if (!opts.reducedMotion) {
      // Idle life: breathing, a slight head sway, and the occasional blink.
      const breath = 1 + 0.01 * Math.sin(t * 1.4);
      built.torso.scale.set(breath, 1, breath);
      built.headGroup.rotation.z = 0.03 * Math.sin(t * 0.5);
      built.headGroup.rotation.y = 0.05 * Math.sin(t * 0.33);
      if (t >= nextBlinkAt) {
        const blinkPhase = t - nextBlinkAt;
        built.eyesGroup.scale.y = blinkPhase < 0.12 ? 0.1 : 1;
        if (blinkPhase >= 0.12) nextBlinkAt = t + 3 + Math.random() * 2;
      }
    }

    if (refillStart >= 0) {
      const elapsed = t - refillStart;
      if (elapsed >= REFILL_SECONDS) clearRefill();
      else poseRefill(elapsed);
    }

    renderer.render(scene, camera);
  };

  const syncLoop = (): void => {
    const shouldRun = intersecting && document.visibilityState === 'visible' && !disposed;
    if (shouldRun && !running) {
      running = true;
      clock.getDelta(); // drop the paused gap so animations don't jump
      rafId = requestAnimationFrame(tick);
    } else if (!shouldRun && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  };

  const observer = new IntersectionObserver((entries) => {
    intersecting = entries[0]?.isIntersecting ?? true;
    syncLoop();
  });
  observer.observe(canvas);

  const resizeObserver = new ResizeObserver(resize);
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  else window.addEventListener('resize', resize);

  const onVisibility = (): void => syncLoop();
  document.addEventListener('visibilitychange', onVisibility);
  syncLoop();

  return {
    playRefill(): void {
      if (opts.reducedMotion || disposed) return;
      if (refillStart >= 0) return; // re-entry guard: one refill at a time
      refillStart = clock.getElapsedTime();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const material = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
