import * as THREE from 'three';

/**
 * GrandpaScene — a tiny procedural Three.js scene for the Ko-fi widget.
 *
 * ONE grandpa, one rig, every state. The same procedural model (bench,
 * tree, mug, kettle — no models, textures, or network loads) produces
 * the walk-in, the sit-down, the seated idle, and the refill; the
 * fallback still KofiBench shows when WebGL is unavailable is a render
 * of this exact scene (scripts/kofi/render-grandpa-still.mjs), so the
 * character never changes identity between states.
 *
 * Entrance: on mount he walks left→right across the front of the bench
 * (3.45s, five short steps), turns, backs onto the seat line, and lowers
 * himself (1.90s), landing bit-exact on the seated pose the idle and the
 * refill were choreographed against. `opts.onSeated` fires once at that
 * landing. Under reduced motion there is no entrance: the scene builds
 * seated and renders one static frame.
 *
 * The React component owns all behavior (copy, confirm, env gating);
 * this file only owns the 3D scene. It exposes a mount function that
 * returns a handle, or null when WebGL is unavailable so the caller can
 * fall back to the rendered still. Import only from 'three' — no React
 * here.
 */

export interface GrandpaSceneHandle {
  /** Stop the loop and release every GPU resource. Safe to call once. */
  dispose(): void;
  /**
   * Play the one-shot refill (mug raises, kettle pours, mug lowers).
   * Called before he is seated, it is queued and plays just after the
   * sit lands — never mid-walk.
   */
  playRefill(): void;
}

// ---------------------------------------------------------------------------
// Palette. The set (bench, tree, kettle) keeps the scene's original
// colours; the man himself is sampled from the owner's design
// reference (docs/kofi-grandpa-reference.jpg): a flat vintage
// cartoon — matte colour everywhere, no gloss.
// ---------------------------------------------------------------------------
const COLORS = {
  woodLight: 0x92400e,
  woodDark: 0x78350f,
  benchLeg: 0x44403c,
  cap: 0x1d100c, // near-black warm brown flat cap
  skin: 0xef9550, // peach-orange
  hair: 0xfdf8ec, // warm white — side hair and the big round mustache
  blazer: 0xc08a5e, // tan/camel jacket
  shirt: 0xfdfcf8, // white shirt front
  tie: 0x241a14, // dark tie
  trousers: 0x1c1713, // black
  shoe: 0x17120f, // black, oversized
  eye: 0x1c1917,
  mug: 0x98908c, // grey mug
  steam: 0xe7e2da, // pale steam curls
  kettle: 0xa8a29e,
  kettleDark: 0x78716c,
  stream: 0x38bdf8,
  canopy: [0x0f7668, 0x059669, 0x047857],
} as const;

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

/** A flat-shaded standard material — the material style for the set and props. */
function flat(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true, ...extra });
}

/**
 * A flat matte material for the character himself — Lambert: a pure
 * colour response with no specular gloss, like the reference's flat
 * inks. (Toon shading without a gradient map bands unpredictably
 * under this rig's hemisphere + directional mix.)
 */
function toon(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
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
// Entrance constants (Game Designer spec, team review 2026-10-23).
// ---------------------------------------------------------------------------

/** Walk: five steps at ~1.45 steps/s, an unhurried stroll. */
const WALK_SECONDS = 3.45;
const WALK_STEPS = 5;
/** Sit: arrive, turn + back up, lower, settle. */
const SIT_SECONDS = 1.9;
const ENTRANCE_SECONDS = WALK_SECONDS + SIT_SECONDS;
/** How far the root travels: character centre −1.00 → seat centre 1.35. */
const WALK_TRAVEL = 2.35;
/** Standing hip lift over the seated zero pose. */
const LIFT = 0.62;
/** Thigh pitch (rad about the hip pivot) that takes a leg from seated-forward to standing-down. */
const HIP_STAND = 1.28;
/** He walks in front of the bench (seat front edge is z≈0.42), then backs to z=0 to sit. */
const WALK_PLANE_Z = 0.55;
/** Body yaw while walking (¾ profile); his head compensates part-way back to camera. */
const WALK_YAW = 1.26;

// ---------------------------------------------------------------------------
// Scene construction.
// ---------------------------------------------------------------------------

interface BuiltScene {
  root: THREE.Group;
  grandpaRoot: THREE.Group;
  hipsGroup: THREE.Group;
  torso: THREE.Mesh;
  headGroup: THREE.Group;
  eyesGroup: THREE.Group;
  restArm: THREE.Group;
  mugArm: THREE.Group;
  mugGroup: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  ankleL: THREE.Group;
  ankleR: THREE.Group;
  walkShadowMaterial: THREE.MeshBasicMaterial;
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

  // -- Grandpa. --------------------------------------------------------------
  // Rig rule: THE SEATED POSE IS THE ZERO POSE. Every pivot sits at
  // rotation 0 and every mesh keeps the exact transform it had before the
  // rig existed, so when the entrance ends and the pivots snap back to 0
  // he is bit-exact the seated grandpa the idle and refill were built
  // against. Standing/walking are rotations AWAY from zero:
  //   hipPivot.rotation.x  +1.28 swings a thigh from forward to down
  //   kneePivot.rotation.x −hip − bend keeps the shin vertical / kicks the foot back
  //   anklePivot           −(hip + knee) keeps the shoe flat
  // hipsGroup carries torso, head, arms and hip pivots as one pelvis
  // unit; its y is the standing lift. grandpaRoot carries the whole man
  // across the frame (x), onto the seat line (z), and around (yaw).
  const grandpaRoot = new THREE.Group();
  const grandpa = new THREE.Group();
  grandpaRoot.add(grandpa);
  const gx = 1.35; // his centre along the bench

  // Travelling ground blob: under him while he walks, fades out as he
  // lowers into the bench shadow.
  const walkShadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const walkShadow = mesh(new THREE.CircleGeometry(1, 32), walkShadowMaterial);
  walkShadow.rotation.x = -Math.PI / 2;
  walkShadow.scale.set(0.78, 0.3, 1);
  walkShadow.position.set(gx, 0.012, 0);
  grandpaRoot.add(walkShadow);

  const hipsGroup = new THREE.Group();
  grandpa.add(hipsGroup);

  // Legs: hip pivot → thigh, knee pivot → shin, ankle pivot → shoe.
  // Child offsets are (today's mesh centre − pivot position), so at zero
  // rotation every mesh lands exactly where the pre-rig build put it.
  const trouserMat = toon(COLORS.trousers);
  const shoeMat = toon(COLORS.shoe);
  const buildLeg = (side: -1 | 1) => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(gx + side * 0.24, 1.58, 0.02);
    const thigh = mesh(new THREE.CapsuleGeometry(0.17, 0.5, 3, 8), trouserMat);
    thigh.rotation.x = Math.PI / 2;
    thigh.position.set(0, -0.02, 0.36);
    hipPivot.add(thigh);
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.08, 0.72);
    hipPivot.add(kneePivot);
    const shin = mesh(new THREE.CapsuleGeometry(0.14, 0.5, 3, 8), trouserMat);
    shin.position.set(0, -0.55, -0.06);
    kneePivot.add(shin);
    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.98, -0.04);
    kneePivot.add(anklePivot);
    // Oversized black shoes, per the reference — same ankle anchor,
    // just more shoe around it.
    const shoe = mesh(new THREE.BoxGeometry(0.27, 0.17, 0.57), shoeMat);
    shoe.position.set(0, -0.43, 0.12);
    anklePivot.add(shoe);
    hipsGroup.add(hipPivot);
    return { hipPivot, kneePivot, anklePivot };
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  // Torso in the tan blazer; breathing scales this mesh.
  const torso = mesh(new THREE.CapsuleGeometry(0.52, 0.85, 4, 10), toon(COLORS.blazer));
  torso.position.set(gx, 2.5, -0.05);
  torso.rotation.x = -0.06;
  hipsGroup.add(torso);

  // White shirt front + dark tie on the chest: flat panels half-sunk
  // into the capsule, so only their front faces show.
  const shirt = mesh(new THREE.BoxGeometry(0.27, 0.36, 0.07), toon(COLORS.shirt));
  shirt.position.set(gx, 2.91, 0.43);
  shirt.rotation.x = -0.06;
  hipsGroup.add(shirt);
  const tie = mesh(new THREE.BoxGeometry(0.1, 0.28, 0.03), toon(COLORS.tie));
  tie.position.set(gx, 2.9, 0.48);
  tie.rotation.x = -0.06;
  hipsGroup.add(tie);

  // Resting arm (viewer's left): shoulder down to a hand on the thigh.
  const blazerMat = toon(COLORS.blazer);
  const skinMat = toon(COLORS.skin);
  const restArm = new THREE.Group();
  restArm.position.set(gx - 0.56, 3.08, 0);
  const restUpper = mesh(new THREE.CapsuleGeometry(0.13, 0.4, 3, 8), blazerMat);
  restUpper.position.set(-0.08, -0.28, 0.02);
  restUpper.rotation.z = -0.25;
  restArm.add(restUpper);
  const restFore = mesh(new THREE.CapsuleGeometry(0.11, 0.34, 3, 8), blazerMat);
  restFore.position.set(-0.16, -0.6, 0.28);
  restFore.rotation.x = -1.1;
  restArm.add(restFore);
  const restHand = mesh(new THREE.SphereGeometry(0.12, 8, 8), skinMat);
  restHand.position.set(-0.17, -0.66, 0.52);
  restArm.add(restHand);
  hipsGroup.add(restArm);

  // Mug arm (viewer's right): a group pivoted at the shoulder so the
  // refill can raise the forearm + mug toward the body.
  const mugArm = new THREE.Group();
  mugArm.position.set(gx + 0.56, 3.08, 0);
  const mugUpper = mesh(new THREE.CapsuleGeometry(0.13, 0.4, 3, 8), blazerMat);
  mugUpper.position.set(0.08, -0.28, 0.02);
  mugUpper.rotation.z = 0.25;
  mugArm.add(mugUpper);
  const mugFore = mesh(new THREE.CapsuleGeometry(0.11, 0.34, 3, 8), blazerMat);
  mugFore.position.set(0.18, -0.58, 0.28);
  mugFore.rotation.x = -1.15;
  mugArm.add(mugFore);
  const mugHand = mesh(new THREE.SphereGeometry(0.12, 8, 8), skinMat);
  mugHand.position.set(0.2, -0.62, 0.52);
  mugArm.add(mugHand);

  // The grey mug, held at lap height at rest — and in his hand through
  // the whole walk (the mug arm keeps its seated bend; only its shoulder
  // swings, a few degrees, so nothing spills).
  const mugGroup = new THREE.Group();
  mugGroup.position.set(0.2, -0.55, 0.62);
  const mugBody = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.27, 12), toon(COLORS.mug));
  mugGroup.add(mugBody);
  const mugHandle = mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 12), toon(COLORS.mug));
  mugHandle.position.x = 0.17;
  mugGroup.add(mugHandle);
  // Two thin steam curls over the mug — the reference's signature
  // wisps. Children of the mug group, so they ride the walk and the
  // refill raise with it; they stand ~0.44 clear of where the kettle
  // hovers during the pour, so the two never meet.
  const steamMat = new THREE.MeshLambertMaterial({ color: COLORS.steam, transparent: true, opacity: 0.55 });
  const steamCurl = (x: number, height: number, sway: number): THREE.Mesh => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0.14, 0),
      new THREE.Vector3(x + sway, 0.14 + height * 0.38, 0),
      new THREE.Vector3(x - sway, 0.14 + height * 0.72, 0),
      new THREE.Vector3(x + sway * 0.6, 0.14 + height, 0),
    ]);
    return mesh(new THREE.TubeGeometry(curve, 12, 0.016, 5), steamMat);
  };
  mugGroup.add(steamCurl(-0.05, 0.34, 0.035));
  mugGroup.add(steamCurl(0.06, 0.42, -0.03));
  mugArm.add(mugGroup);
  hipsGroup.add(mugArm);

  // Head: pivots at the neck so the sway looks natural.
  const headGroup = new THREE.Group();
  headGroup.position.set(gx, 3.32, 0);
  const head = mesh(new THREE.SphereGeometry(0.46, 14, 12), skinMat);
  head.position.y = 0.44;
  headGroup.add(head);
  // White hair: flattened tufts swept at the sides and back of the
  // head — the top of the head belongs to the cap. Children of the
  // head group like everything else here, so the sway/blink
  // choreography and the seated zero pose are untouched.
  const hairMat = toon(COLORS.hair);
  const tuftSpecs: Array<[number, number, number, number, [number, number, number]]> = [
    // [x, y, z, radius, scale] — flattened against the skull
    [-0.42, 0.52, -0.08, 0.2, [0.55, 0.85, 0.95]],
    [0.42, 0.52, -0.08, 0.2, [0.55, 0.85, 0.95]],
    [0, 0.56, -0.38, 0.26, [1.2, 0.75, 0.55]],
  ];
  for (const [x, y, z, r, s] of tuftSpecs) {
    const tuft = mesh(new THREE.SphereGeometry(r, 10, 8), hairMat);
    tuft.scale.set(s[0], s[1], s[2]);
    tuft.position.set(x, y, z);
    headGroup.add(tuft);
  }
  // The flat cap: a squashed sphere hugging the skull (its lower half
  // is inside the head, so rim and skull meet with no gap), a short
  // brim over the face, and the little button on top.
  const capMat = toon(COLORS.cap);
  const capDome = mesh(new THREE.SphereGeometry(0.5, 14, 10), capMat);
  capDome.scale.set(1, 0.52, 1);
  capDome.position.y = 0.66;
  capDome.rotation.x = 0.06;
  headGroup.add(capDome);
  const capBrim = mesh(new THREE.BoxGeometry(0.5, 0.04, 0.26), capMat);
  capBrim.position.set(0, 0.7, 0.44);
  capBrim.rotation.x = 0.1;
  headGroup.add(capBrim);
  const capButton = mesh(new THREE.SphereGeometry(0.05, 8, 6), capMat);
  capButton.position.set(0, 0.94, -0.02);
  headGroup.add(capButton);
  // Nose: a small round knob nestled into the top of the mustache.
  const nose = mesh(new THREE.SphereGeometry(0.09, 8, 8), skinMat);
  nose.position.set(0, 0.4, 0.44);
  headGroup.add(nose);
  // The mustache — the reference's dominant feature, and the end of
  // the old beard (the reference has none): three flattened white
  // spheres fused into one big round mass under the nose.
  const mustacheSpecs: Array<[number, number, number, number]> = [
    // [x, y, z, radius]
    [-0.13, 0.26, 0.42, 0.17],
    [0.13, 0.26, 0.42, 0.17],
    [0, 0.29, 0.44, 0.15],
  ];
  for (const [x, y, z, r] of mustacheSpecs) {
    const lobe = mesh(new THREE.SphereGeometry(r, 10, 8), hairMat);
    lobe.scale.set(1.15, 0.8, 0.62);
    lobe.position.set(x, y, z);
    headGroup.add(lobe);
  }
  // Eyes in their own group so a blink is one scale change.
  const eyesGroup = new THREE.Group();
  eyesGroup.position.y = 0.5;
  const eyeMat = toon(COLORS.eye);
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eye.position.set(side * 0.16, 0, 0.42);
    eyesGroup.add(eye);
  }
  headGroup.add(eyesGroup);
  hipsGroup.add(headGroup);
  root.add(grandpaRoot);

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

  return {
    root,
    grandpaRoot,
    hipsGroup,
    torso,
    headGroup,
    eyesGroup,
    restArm,
    mugArm,
    mugGroup,
    hipL: legL.hipPivot,
    hipR: legR.hipPivot,
    kneeL: legL.kneePivot,
    kneeR: legR.kneePivot,
    ankleL: legL.anklePivot,
    ankleR: legR.anklePivot,
    walkShadowMaterial,
    kettle,
    kettleMaterials,
    stream,
    streamMaterial,
  };
}

// ---------------------------------------------------------------------------
// Mount: renderer, camera, loop discipline, and the public handle.
// ---------------------------------------------------------------------------

const REFILL_SECONDS = 3.5;

export function mountGrandpaScene(
  canvas: HTMLCanvasElement,
  opts: { reducedMotion: boolean; onContextLost?: () => void; onSeated?: () => void },
): GrandpaSceneHandle | null {
  // Graceful fallback: no WebGL context, no scene — caller uses the still.
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null;
  }

  // A lost context never recovers here: surface it so the caller can
  // fall back to the rendered still instead of leaving a blank canvas up.
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    opts.onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
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
    // setSize clears the canvas; under reduced motion there is no loop
    // to repaint it, so redraw the one static frame here.
    if (opts.reducedMotion) renderer.render(scene, camera);
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

  // Entrance state. The clock starts at mount; the entrance clock is
  // scene-tick time (the loop below drops paused gaps on resume), so a
  // walk hidden by a closed tab or an off-screen widget freezes mid-
  // stride and resumes — onSeated can only fire for a walk that was
  // actually seen to complete.
  let entranceStart = clock.getElapsedTime();
  let seated = opts.reducedMotion; // reduced motion: born seated, no entrance
  let seatedAt = -1;
  let seatedNotified = false;
  let queuedRefill = false;

  const setKettleOpacity = (opacity: number): void => {
    for (const m of built.kettleMaterials) m.opacity = opacity;
    built.kettle.visible = opacity > 0.01;
  };

  /** Pose one leg: hip pitch, knee bend (≥0 kicks the foot back), ankle keeps the shoe flat. */
  const poseLeg = (
    hip: THREE.Group,
    knee: THREE.Group,
    ankle: THREE.Group,
    hipRot: number,
    bend: number,
    push: number,
  ): void => {
    hip.rotation.x = hipRot;
    knee.rotation.x = -hipRot - bend;
    ankle.rotation.x = bend + push;
  };

  /** Walking pose at entrance-elapsed t (0..WALK_SECONDS). */
  const poseWalk = (t: number): void => {
    // Distance is eased once; the gait is driven off that same progress,
    // so each of the 5 steps covers exactly its share of the ground —
    // feet track ground speed, no moonwalk slide.
    const s = phase(t, 0, WALK_SECONDS);
    const g = s * WALK_STEPS * Math.PI; // one π = one step
    // First and last steps are gathered: amplitude ramps in and out.
    const env = phase(t, 0, 0.35) * (1 - phase(t, WALK_SECONDS - 0.35, WALK_SECONDS));
    built.grandpaRoot.position.x = -WALK_TRAVEL + WALK_TRAVEL * s;
    built.grandpaRoot.position.z = WALK_PLANE_Z;
    built.grandpaRoot.position.y = -0.03 * (0.5 - 0.5 * Math.cos(2 * g)) * env;
    built.grandpaRoot.rotation.y = WALK_YAW;
    built.hipsGroup.position.y = LIFT;
    built.hipsGroup.rotation.z = 0.03 * Math.sin(g) * env;
    const swing = 0.28 * env;
    poseLeg(built.hipL, built.kneeL, built.ankleL,
      HIP_STAND + swing * Math.sin(g),
      0.5 * env * Math.max(0, Math.sin(g + 0.6)),
      0.22 * env * Math.max(0, Math.sin(g + 2.6)));
    poseLeg(built.hipR, built.kneeR, built.ankleR,
      HIP_STAND + swing * Math.sin(g + Math.PI),
      0.5 * env * Math.max(0, Math.sin(g + Math.PI + 0.6)),
      0.22 * env * Math.max(0, Math.sin(g + Math.PI + 2.6)));
    // Arms: the rest arm swings against its leg; the mug arm barely
    // swings and keeps its seated bend, mug level in hand.
    built.restArm.rotation.x = -0.26 * env * Math.sin(g);
    built.mugArm.rotation.x = -0.09 * env * Math.sin(g + Math.PI);
    // Forward lean for the walk; face turns part-way back to camera.
    built.torso.rotation.x = -0.06 + 0.14 * env;
    built.headGroup.rotation.y = -0.88 * env;
    built.walkShadowMaterial.opacity = 0.1 * Math.max(env, 0.35);
  };

  /** Sit pose at sit-elapsed u (0..SIT_SECONDS). Ends at the zero pose. */
  const poseSit = (u: number): void => {
    // Turn & back up onto the seat line.
    const turn = phase(u, 0.4, 0.9);
    built.grandpaRoot.rotation.y = WALK_YAW * (1 - turn);
    built.grandpaRoot.position.z = WALK_PLANE_Z * (1 - turn);
    built.headGroup.rotation.y = -0.88 * (1 - turn);
    // Lower: hips sink, legs fold back to the seated zero.
    const lower = phase(u, 0.9, 1.6);
    built.hipsGroup.position.y = LIFT * (1 - lower);
    built.hipsGroup.rotation.z = 0;
    built.grandpaRoot.position.y = 0;
    poseLeg(built.hipL, built.kneeL, built.ankleL, HIP_STAND * (1 - lower), 0, 0);
    poseLeg(built.hipR, built.kneeR, built.ankleR, HIP_STAND * (1 - lower), 0, 0);
    built.torso.rotation.x = -0.06 + 0.14 * (1 - lower);
    built.restArm.rotation.x = 0;
    built.mugArm.rotation.x = 0;
    // His travelling shadow hands over to the bench shadow as he lands.
    built.walkShadowMaterial.opacity = 0.1 * (1 - lower);
    // Settle: one dip-and-recover after seat contact, mirroring the
    // refill's landing bob.
    if (u > 1.6) {
      const v = (u - 1.6) / 0.3;
      if (v >= 0 && v <= 1) built.hipsGroup.position.y = -0.03 * Math.sin(Math.PI * v) * (1 - v);
    }
  };

  /** Snap every entrance-written transform to its seated rest value. */
  const snapSeated = (): void => {
    built.grandpaRoot.position.set(0, 0, 0);
    built.grandpaRoot.rotation.set(0, 0, 0);
    built.hipsGroup.position.y = 0;
    built.hipsGroup.rotation.z = 0;
    for (const pivot of [built.hipL, built.hipR, built.kneeL, built.kneeR, built.ankleL, built.ankleR]) {
      pivot.rotation.set(0, 0, 0);
    }
    built.restArm.rotation.set(0, 0, 0);
    built.mugArm.rotation.set(0, 0, 0);
    built.torso.rotation.x = -0.06;
    built.headGroup.rotation.set(0, 0, 0);
    built.walkShadowMaterial.opacity = 0;
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

    if (!seated) {
      const elapsed = t - entranceStart;
      if (elapsed < WALK_SECONDS) poseWalk(elapsed);
      else if (elapsed < ENTRANCE_SECONDS) poseSit(elapsed - WALK_SECONDS);
      else {
        snapSeated();
        seated = true;
        seatedAt = t;
      }
    }

    if (seated && !seatedNotified) {
      seatedNotified = true;
      opts.onSeated?.();
    }
    // A refill requested during the entrance starts just after the sit.
    if (seated && queuedRefill && refillStart < 0 && t - seatedAt >= 0.35) {
      queuedRefill = false;
      refillStart = t;
    }

    if (seated && !opts.reducedMotion) {
      // Idle life: breathing, a slight head sway, and the occasional blink.
      const breath = 1 + 0.01 * Math.sin(t * 1.4);
      built.torso.scale.set(breath, 1, breath);
      built.headGroup.rotation.z = 0.03 * Math.sin(t * 0.5);
      built.headGroup.rotation.y = 0.05 * Math.sin(t * 0.33);
    }
    // The blink runs in every state — a walking man blinks too.
    if (t >= nextBlinkAt) {
      const blinkPhase = t - nextBlinkAt;
      built.eyesGroup.scale.y = blinkPhase < 0.12 ? 0.1 : 1;
      if (blinkPhase >= 0.12) nextBlinkAt = t + 3 + Math.random() * 2;
    }

    if (refillStart >= 0) {
      const elapsed = t - refillStart;
      if (elapsed >= REFILL_SECONDS) clearRefill();
      else poseRefill(elapsed);
    }

    renderer.render(scene, camera);
  };

  const syncLoop = (): void => {
    if (opts.reducedMotion) {
      // Reduced motion: render one static frame and never start the RAF
      // loop — a perpetual loop repainting an identical frame is waste.
      // The single frame is the seated pose, and seated is reported once
      // it exists.
      if (!disposed && intersecting && document.visibilityState === 'visible') {
        renderer.render(scene, camera);
        if (!seatedNotified) {
          seatedNotified = true;
          seatedAt = clock.getElapsedTime();
          opts.onSeated?.();
        }
      }
      return;
    }
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
      if (!seated) {
        queuedRefill = true; // plays just after the sit lands
        return;
      }
      refillStart = clock.getElapsedTime();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('webglcontextlost', onContextLost);
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
