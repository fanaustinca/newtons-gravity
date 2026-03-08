import { Injectable, NgZone, OnDestroy } from '@angular/core';
import * as THREE from 'three';
import { Subject } from 'rxjs';
import { GameStateService } from './game-state.service';

// Tree-local branch tip positions (scale=1, tree root at origin)
// World position = local * treeScale + treePosition(0,0,-2)
const BRANCH_TIPS_LOCAL: [number, number, number][] = [
  [-10.5, 16.0, -2.0], [ -8.0, 19.5, -1.5], [ -5.5, 22.0, -3.0],
  [ -2.0, 23.5, -2.0], [  0.0, 24.5, -2.5], [  2.0, 23.5, -1.5],
  [  5.5, 22.0, -1.5], [  8.0, 19.5, -2.5], [ 10.5, 16.0, -2.0],
  [ -6.0, 18.0,  0.5], [  6.0, 18.0,  0.5], [  0.0, 20.0,  1.0],
  [ -3.5, 20.0, -4.0], [  3.5, 20.0, -4.0], [  0.0, 16.5, -4.5],
];

export interface FallingObject {
  id: string;
  mesh: THREE.Group;
  type: 'apple' | 'anvil' | 'super-apple' | 'golden-apple';
  speed: number;
  checked: boolean;
  network: boolean; // true = came from server
}

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface RemotePlayer {
  group: THREE.Group;
  nameSprite: THREE.Sprite;
}

// Emitted when Newton catches/is-hit-by an object (so multiplayer service can forward to server)
export interface CatchEvent {
  objectId: string;
  type: 'apple' | 'anvil' | 'super-apple' | 'golden-apple';
  newIq: number;
}

const REMOTE_COLORS = [0xb71c1c, 0x7b1fa2, 0x1b5e20, 0xe65100, 0x880e4f, 0x006064];

@Injectable({ providedIn: 'root' })
export class EngineService implements OnDestroy {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private animId = 0;

  private newtonGroup!: THREE.Group;
  private treeGroup!: THREE.Group;
  private trees: THREE.Group[] = [];
  private fallingObjects: FallingObject[] = [];
  private particles: Particle[] = [];
  private remotePlayers = new Map<string, RemotePlayer>();

  // Newton limb refs
  private newtonLeftLeg!: THREE.Mesh;
  private newtonRightLeg!: THREE.Mesh;
  private newtonLeftArm!: THREE.Mesh;
  private newtonRightArm!: THREE.Mesh;
  private newtonBody!: THREE.Mesh;
  private newtonHeadMesh!: THREE.Mesh;
  private newtonWigMesh!: THREE.Mesh;
  private newtonHatBrim!: THREE.Mesh;
  private newtonHatCrown!: THREE.Mesh;

  // Player state — 2D movement XZ + jump
  private playerX = 0;
  private playerZ = 3.0;
  private playerVelX = 0;
  private playerVelZ = 0;
  private playerY = 0;
  private playerVelY = 0;
  private isGrounded = true;
  private PLAYER_MIN_X = -11;
  private PLAYER_MAX_X = 11;
  private PLAYER_MIN_Z = -5;
  private PLAYER_MAX_Z = 8;
  private readonly PLAYER_Y_CENTER = 1.0;
  private readonly GRAVITY = 22;
  private readonly JUMP_FORCE = 9;

  // Trunk collision radii per trunk (world space)
  private trunkPositions: { x: number; z: number; r: number }[] = [];

  // Power-up timers
  private speedBoostTimer = 0;
  private bigHeadTimer    = 0;

  // Sprint
  private sprintStaminaVal = 1.0;
  private sprintCooldownActive = false;
  private sprintUpdateFrames = 0;

  // ── Camera ─────────────────────────────────────────────────────────────
  private cameraYaw    =  0;
  private cameraPitch  =  0.42;
  private firstPerson  = false;
  private readonly CAM_DIST_3P    =  8;
  private readonly CAM_PITCH_MIN  = -1.45;
  private readonly CAM_PITCH_MAX  =  1.45;
  private readonly CAM_SENSITIVITY = 0.0020;

  private shakeAmount = 0;

  // Input
  private keysHeld   = new Set<string>();
  private touchDirX  = 0;
  private touchDirZ  = 0;
  private touchSprint = false;

  // Multiplayer mode
  multiplayerMode = false;

  // Emits whenever Newton catches an apple or is hit by an anvil
  readonly catchEvent$ = new Subject<CatchEvent>();

  // Timers
  private spawnTimer  = 0;
  private waveTimer   = 0;
  private readonly WAVE_DURATION = 35;

  private branchTips: THREE.Vector3[] = [];

  private readonly MAT = {
    bark:         new THREE.MeshLambertMaterial({ color: 0x5a3020 }),
    foliageDark:  new THREE.MeshLambertMaterial({ color: 0x145214 }),
    foliageMid:   new THREE.MeshLambertMaterial({ color: 0x206020 }),
    foliageLight: new THREE.MeshLambertMaterial({ color: 0x2a7a2a }),
    appleRed:     new THREE.MeshLambertMaterial({ color: 0xcc1111 }),
    appleGreen:   new THREE.MeshLambertMaterial({ color: 0x3a9c3a }),
    superApple:   new THREE.MeshLambertMaterial({ color: 0xff5500 }),
    goldenApple:  new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 }),
    stem:         new THREE.MeshLambertMaterial({ color: 0x4a2c0a }),
    anvilDark:    new THREE.MeshLambertMaterial({ color: 0x333333 }),
    anvilMid:     new THREE.MeshLambertMaterial({ color: 0x4a4a4a }),
    coat:         new THREE.MeshLambertMaterial({ color: 0x1a237e }),
    skin:         new THREE.MeshLambertMaterial({ color: 0xffd0a0 }),
    wig:          new THREE.MeshLambertMaterial({ color: 0xf0ece0 }),
    hat:          new THREE.MeshLambertMaterial({ color: 0x111111 }),
    shoe:         new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    ground:       new THREE.MeshLambertMaterial({ color: 0x3a6b2a }),
    groundEdge:   new THREE.MeshLambertMaterial({ color: 0x2d5220 }),
    eyeWhite:     new THREE.MeshLambertMaterial({ color: 0xffffff }),
    eyeDark:      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    nose:         new THREE.MeshLambertMaterial({ color: 0xe0a880 }),
    mouth:        new THREE.MeshLambertMaterial({ color: 0x9a4030 }),
    eyebrow:      new THREE.MeshLambertMaterial({ color: 0x5a4818 }),
  };

  constructor(private ngZone: NgZone, private gameState: GameStateService) {}

  init(canvas: HTMLCanvasElement, multiplayer = false): void {
    this.multiplayerMode = multiplayer;
    this.setupRenderer(canvas);
    this.setupCamera(canvas);
    this.setupScene();
    this.setupLights();
    this.buildEnvironment(multiplayer);

    this.trees = [];
    this.trunkPositions = [];
    this.branchTips = [];

    const treeScale = multiplayer ? 2.0 : 1.6;
    const treeOffsets: [number, number][] = multiplayer
      ? [[0, -2], [-50, -2], [50, -2]]
      : [[0, -2]];

    treeOffsets.forEach(([tx, tz]) => {
      const t = this.buildTree();
      t.position.set(tx, 0, tz);
      t.scale.setScalar(treeScale);
      this.scene.add(t);
      this.trees.push(t);
      this.trunkPositions.push({ x: tx, z: tz, r: 1.25 * treeScale });
      BRANCH_TIPS_LOCAL.forEach(([lx, ly, lz]) =>
        this.branchTips.push(new THREE.Vector3(lx * treeScale + tx, ly * treeScale, lz * treeScale + tz))
      );
    });

    this.treeGroup = this.trees[0];

    const pad = 6;
    const xSpread = multiplayer ? 50 + 10.5 * treeScale : 10.5 * treeScale;
    this.PLAYER_MIN_X = -xSpread - pad;
    this.PLAYER_MAX_X =  xSpread + pad;
    this.PLAYER_MIN_Z = -4.5 * treeScale - 2 - pad;
    this.PLAYER_MAX_Z =  1.0 * treeScale - 2 + pad + 10;

    this.newtonGroup = this.buildNewton(this.MAT.coat);
    this.newtonGroup.position.set(this.playerX, 0, this.playerZ);
    this.newtonGroup.rotation.y = Math.PI;
    this.scene.add(this.newtonGroup);
    this.setupResizeHandler(canvas);
    this.ngZone.runOutsideAngular(() => this.animate());
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.fallingObjects.forEach(o => this.scene.remove(o.mesh));
    this.fallingObjects = [];
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.remotePlayers.forEach(r => this.scene.remove(r.group));
    this.remotePlayers.clear();
    this.renderer?.dispose();
  }

  ngOnDestroy(): void { this.dispose(); }

  // ── Input ──────────────────────────────────────────────────────────────

  keyDown(key: string): void {
    const k = key.toLowerCase();
    if (k === 'c') {
      this.firstPerson = !this.firstPerson;
      if (this.newtonGroup) this.newtonGroup.visible = !this.firstPerson;
      return;
    }
    if (k === ' ' && this.isGrounded) {
      this.playerVelY = this.JUMP_FORCE;
      this.isGrounded = false;
      return;
    }
    this.keysHeld.add(k);
  }
  keyUp(key: string): void { this.keysHeld.delete(key.toLowerCase()); }

  cameraMouseDelta(dx: number, dy: number): void {
    this.cameraYaw   -= dx * this.CAM_SENSITIVITY;
    this.cameraPitch  = Math.max(
      this.CAM_PITCH_MIN,
      Math.min(this.CAM_PITCH_MAX, this.cameraPitch + dy * this.CAM_SENSITIVITY)
    );
  }

  setTouchDir(x: number, z: number): void { this.touchDirX = x; this.touchDirZ = z; }
  setTouchSprint(active: boolean): void { this.touchSprint = active; }
  touchCameraDelta(dx: number, dy: number): void { this.cameraMouseDelta(dx * 2, dy * 2); }

  // Called by game component on wave start
  onWaveStart(): void {
    this.waveTimer = 0;
    this.spawnTimer = 0;
    this.playerX = 0;
    this.playerZ = 3.0;
    this.playerVelX = 0;
    this.playerVelZ = 0;
    this.playerY = 0;
    this.playerVelY = 0;
    this.isGrounded = true;
    this.sprintStaminaVal = 1.0;
    this.sprintCooldownActive = false;
    this.touchSprint = false;
    this.speedBoostTimer = 0;
    this.bigHeadTimer = 0;
    this.applyHeadScale(1.0);
    this.fallingObjects.forEach(o => this.scene.remove(o.mesh));
    this.fallingObjects = [];
  }

  triggerCameraShake(intensity: number): void { this.shakeAmount = intensity; }

  // ── Multiplayer object API ─────────────────────────────────────────────

  addNetworkObject(id: string, type: 'apple' | 'anvil' | 'super-apple' | 'golden-apple', x: number, y: number, z: number, speed: number): void {
    const mesh = type === 'anvil' ? this.makeAnvilMesh()
               : type === 'super-apple' ? this.makeSuperAppleMesh()
               : type === 'golden-apple' ? this.makeGoldenAppleMesh()
               : this.makeAppleMesh();
    mesh.position.set(x, y, z);
    mesh.rotation.set((Math.random()-0.5)*0.4, Math.random()*Math.PI*2, (Math.random()-0.5)*0.4);
    this.scene.add(mesh);
    this.fallingObjects.push({ id, mesh, type, speed, checked: false, network: true });
  }

  removeNetworkObject(id: string): void {
    const idx = this.fallingObjects.findIndex(o => o.id === id);
    if (idx > -1) {
      this.scene.remove(this.fallingObjects[idx].mesh);
      this.fallingObjects.splice(idx, 1);
    }
  }

  // ── Remote player API ──────────────────────────────────────────────────

  addOrUpdateRemotePlayer(id: string, name: string, colorIdx: number, x: number, z: number, yaw: number): void {
    let rp = this.remotePlayers.get(id);
    if (!rp) {
      const coatMat = new THREE.MeshLambertMaterial({ color: REMOTE_COLORS[colorIdx % REMOTE_COLORS.length] });
      const group = this.buildNewton(coatMat);
      const sprite = this.createNameSprite(name);
      sprite.position.set(0, 3.6, 0);
      group.add(sprite);
      this.scene.add(group);
      rp = { group, nameSprite: sprite };
      this.remotePlayers.set(id, rp);
    }
    rp.group.position.set(x, 0, z);
    rp.group.rotation.y = yaw;
  }

  removeRemotePlayer(id: string): void {
    const rp = this.remotePlayers.get(id);
    if (rp) { this.scene.remove(rp.group); this.remotePlayers.delete(id); }
  }

  /** Current player position + camera yaw for sync */
  getPlayerState(): { x: number; z: number; yaw: number } {
    return { x: this.playerX, z: this.playerZ, yaw: this.cameraYaw };
  }

  // ── Setup ──────────────────────────────────────────────────────────────

  private setupRenderer(canvas: HTMLCanvasElement): void {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
  }

  private setupCamera(canvas: HTMLCanvasElement): void {
    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 300);
    this.applyOrbitCamera();
  }

  private setupScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8e3);
    this.scene.fog = new THREE.FogExp2(0xbce4f0, 0.008);
  }

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xfff8e7, 0.55));
    const sun = new THREE.DirectionalLight(0xffd78a, 1.4);
    sun.position.set(10, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -30;
    sun.shadow.camera.right = sun.shadow.camera.top = 30;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    const fillLight = new THREE.DirectionalLight(0x9bb8d4, 0.35);
    fillLight.position.set(-12, 8, -5);
    this.scene.add(fillLight);
  }

  private buildEnvironment(multiplayer = false): void {
    const gSize = multiplayer ? 250 : 120;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), this.MAT.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const groundEdge = new THREE.Mesh(new THREE.PlaneGeometry(gSize, gSize), this.MAT.groundEdge);
    groundEdge.rotation.x = -Math.PI / 2;
    groundEdge.position.set(0, -0.01, 0);
    this.scene.add(groundEdge);

    const tuffMat = new THREE.MeshLambertMaterial({ color: 0x4a8a30 });
    for (let i = 0; i < 80; i++) {
      const tuff = new THREE.Mesh(new THREE.ConeGeometry(0.08+Math.random()*0.12, 0.35+Math.random()*0.4, 4), tuffMat);
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 24;
      tuff.position.set(Math.cos(a)*r, 0.12, Math.sin(a)*r-2);
      tuff.rotation.y = Math.random() * Math.PI;
      this.scene.add(tuff);
    }

    const hillMat = new THREE.MeshLambertMaterial({ color: 0x3a7a28 });
    [[-36,-7,-36],[36,-9,-38],[0,-14,-46],[-22,-8,-42],[24,-7,-36]].forEach(([x,y,z]) => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(14+Math.random()*8, 10, 8), hillMat);
      h.position.set(x, y, z);
      this.scene.add(h);
    });
  }

  // ── Massive tree (≈2.5× original) ─────────────────────────────────────

  private buildTree(): THREE.Group {
    const tree = new THREE.Group();

    // Trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 1.20, 11, 14), this.MAT.bark);
    trunk.position.y = 5.5;
    trunk.castShadow = trunk.receiveShadow = true;
    tree.add(trunk);

    // Root flares
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.65, 2.2, 7), this.MAT.bark);
      f.position.set(Math.cos(a)*0.9, 0.9, Math.sin(a)*0.9);
      f.rotation.z = Math.cos(a)*0.38; f.rotation.x = Math.sin(a)*0.38;
      tree.add(f);
    }

    // Major branches
    [
      { p:[-0.8,10,0],   r:[0.12,0,0.65],   l:6.0, rad:0.34 },
      { p:[0.8, 10,0],   r:[0.12,0.5,-0.65],l:6.0, rad:0.34 },
      { p:[-0.5,11.5,0.4],r:[0.08,0,0.44],  l:4.8, rad:0.25 },
      { p:[0.5, 11.5,-0.4],r:[0.08,0,-0.44],l:4.8, rad:0.25 },
      { p:[0,  12.5,0],  r:[0,0,0],          l:3.8, rad:0.30 },
      { p:[-0.9,8.5,0.6],r:[0.2,0,0.75],    l:4.2, rad:0.24 },
      { p:[0.9, 8.5,-0.6],r:[0.2,0.3,-0.75],l:4.2, rad:0.24 },
      { p:[-0.5,9.5,-0.5],r:[0.15,0.8,0.55],l:3.6, rad:0.20 },
      { p:[0.5, 9.5, 0.5],r:[0.15,-0.4,-0.55],l:3.6, rad:0.20 },
    ].forEach(b => {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(b.rad*0.55, b.rad, b.l, 8), this.MAT.bark);
      br.position.set(b.p[0], b.p[1], b.p[2]);
      br.rotation.set(b.r[0], b.r[1], b.r[2]);
      br.castShadow = true;
      tree.add(br);
    });

    // Round canopy — dense overlapping spheres centred on the crown
    [
      { x: 0,    y:19.5, z: 0,    r:7.0, m:this.MAT.foliageDark  },
      { x: 0,    y:22.5, z: 0,    r:5.5, m:this.MAT.foliageLight },
      { x: 0,    y:16.5, z: 0,    r:5.5, m:this.MAT.foliageDark  },
      { x:-4.0,  y:19.0, z: 0,    r:5.0, m:this.MAT.foliageMid   },
      { x: 4.0,  y:19.0, z: 0,    r:5.0, m:this.MAT.foliageMid   },
      { x: 0,    y:19.0, z:-4.0,  r:5.0, m:this.MAT.foliageDark  },
      { x: 0,    y:19.0, z: 4.0,  r:5.0, m:this.MAT.foliageMid   },
      { x:-2.8,  y:22.0, z: 2.0,  r:3.8, m:this.MAT.foliageLight },
      { x: 2.8,  y:22.0, z:-2.0,  r:3.8, m:this.MAT.foliageLight },
      { x:-2.8,  y:22.0, z:-2.0,  r:3.5, m:this.MAT.foliageLight },
      { x: 2.8,  y:22.0, z: 2.0,  r:3.5, m:this.MAT.foliageLight },
      { x:-4.5,  y:17.0, z: 3.0,  r:3.5, m:this.MAT.foliageMid   },
      { x: 4.5,  y:17.0, z:-3.0,  r:3.5, m:this.MAT.foliageMid   },
      { x:-4.5,  y:17.0, z:-3.0,  r:3.2, m:this.MAT.foliageDark  },
      { x: 4.5,  y:17.0, z: 3.0,  r:3.2, m:this.MAT.foliageDark  },
      { x: 0,    y:25.0, z: 0,    r:3.0, m:this.MAT.foliageLight },
      { x:-2.0,  y:14.5, z: 0,    r:3.0, m:this.MAT.foliageDark  },
      { x: 2.0,  y:14.5, z: 0,    r:3.0, m:this.MAT.foliageDark  },
    ].forEach(f => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(f.r, 16, 12), f.m);
      m.position.set(f.x, f.y, f.z);
      m.castShadow = m.receiveShadow = true;
      tree.add(m);
    });

    // Decorative hanging apples
    for (let i = 0; i < 16; i++) {
      const d = this.makeAppleMesh();
      const a = (i/16)*Math.PI*2;
      d.position.set(Math.cos(a)*(3.5+Math.random()*3.5), 13+Math.random()*7, Math.sin(a)*2.5+Math.random()-2);
      d.scale.setScalar(0.9 + Math.random() * 0.6);
      tree.add(d);
    }

    return tree;
  }

  // ── Newton — with face ─────────────────────────────────────────────────

  private buildNewton(coatMat: THREE.MeshLambertMaterial): THREE.Group {
    const n = new THREE.Group();

    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.13, 0.38);
    [-0.165, 0.165].forEach(x => {
      const s = new THREE.Mesh(shoeGeo, this.MAT.shoe);
      s.position.set(x, 0.065, 0.04); s.castShadow = true; n.add(s);
    });

    // Legs
    const legGeo = new THREE.BoxGeometry(0.21, 0.62, 0.26);
    const lL = new THREE.Mesh(legGeo, coatMat);
    lL.position.set(-0.165, 0.44, 0); lL.castShadow = true; n.add(lL);
    if (coatMat === this.MAT.coat) this.newtonLeftLeg = lL;

    const rL = new THREE.Mesh(legGeo, coatMat);
    rL.position.set(0.165, 0.44, 0); rL.castShadow = true; n.add(rL);
    if (coatMat === this.MAT.coat) this.newtonRightLeg = rL;

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.88, 0.38), coatMat);
    body.position.y = 1.13; body.castShadow = true; n.add(body);
    if (coatMat === this.MAT.coat) this.newtonBody = body;

    // Buttons
    const btnMat = new THREE.MeshLambertMaterial({ color: 0xd4af37 });
    [1.0, 1.13, 1.26].forEach(y => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 5), btnMat);
      b.position.set(0, y, 0.2); n.add(b);
    });

    // Arms
    const armGeo = new THREE.BoxGeometry(0.19, 0.65, 0.23);
    const lA = new THREE.Mesh(armGeo, coatMat);
    lA.position.set(-0.41, 1.07, 0); lA.rotation.z = 0.15; lA.castShadow = true; n.add(lA);
    if (coatMat === this.MAT.coat) this.newtonLeftArm = lA;

    const rA = new THREE.Mesh(armGeo, coatMat);
    rA.position.set(0.41, 1.07, 0); rA.rotation.z = -0.15; rA.castShadow = true; n.add(rA);
    if (coatMat === this.MAT.coat) this.newtonRightArm = rA;

    // Cravat
    const cravat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.1), new THREE.MeshLambertMaterial({ color: 0xfafafa }));
    cravat.position.set(0, 1.58, 0.17); n.add(cravat);

    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.18, 8), this.MAT.skin);
    neck.position.y = 1.67; n.add(neck);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), this.MAT.skin);
    head.position.y = 2.02; head.castShadow = true; n.add(head);
    if (coatMat === this.MAT.coat) this.newtonHeadMesh = head;

    // ── Face ────────────────────────────────────────────────────────────
    const headY = 2.02;

    // Eyebrows — slightly above eyes, slight angle
    const browGeo = new THREE.BoxGeometry(0.13, 0.028, 0.042);
    [-0.105, 0.105].forEach((x, i) => {
      const brow = new THREE.Mesh(browGeo, this.MAT.eyebrow);
      brow.position.set(x, headY + 0.135, 0.24);
      brow.rotation.z = i === 0 ? -0.18 : 0.18; // slight arch
      n.add(brow);
    });

    // Eye whites
    [-0.105, 0.105].forEach(x => {
      const ew = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), this.MAT.eyeWhite);
      ew.position.set(x, headY + 0.04, 0.235);
      ew.scale.set(1, 0.85, 0.7);
      n.add(ew);

      // Iris (coloured)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 8), new THREE.MeshLambertMaterial({ color: 0x4a6fa5 }));
      iris.position.set(x, headY + 0.04, 0.268);
      iris.scale.set(1, 1, 0.5);
      n.add(iris);

      // Pupil
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), this.MAT.eyeDark);
      pupil.position.set(x, headY + 0.04, 0.276);
      pupil.scale.set(1, 1, 0.5);
      n.add(pupil);

      // Specular highlight
      const spec = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      spec.position.set(x + 0.018, headY + 0.058, 0.282);
      n.add(spec);
    });

    // Nose — small rounded bump
    const noseGeo = new THREE.SphereGeometry(0.048, 8, 7);
    const nose = new THREE.Mesh(noseGeo, this.MAT.nose);
    nose.position.set(0, headY - 0.042, 0.265);
    nose.scale.set(1.0, 0.78, 0.85);
    n.add(nose);

    // Nostrils
    [-0.025, 0.025].forEach(x => {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.016, 5, 5), new THREE.MeshLambertMaterial({ color: 0xc09070 }));
      nostril.position.set(x, headY - 0.062, 0.268);
      nostril.scale.set(1, 0.6, 0.5);
      n.add(nostril);
    });

    // Mouth — 5 segments forming a gentle smile
    for (let i = 0; i < 5; i++) {
      const t = (i / 4) - 0.5;                     // −0.5 … +0.5
      const mx = t * 0.115;
      const my = headY - 0.128 + t * t * 0.055;    // upward arc = smile
      const mz = 0.252 - t * t * 0.006;
      const mp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 5, 5), this.MAT.mouth);
      mp.position.set(mx, my, mz);
      mp.scale.set(1.3, 0.75, 0.7);
      n.add(mp);
    }

    // Wig
    const wig = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), this.MAT.wig);
    wig.scale.set(1.15, 0.95, 1.05); wig.position.set(0, 2.08, -0.04); n.add(wig);
    if (coatMat === this.MAT.coat) this.newtonWigMesh = wig;

    [-0.33, 0.33].forEach(x => {
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), this.MAT.wig);
      curl.position.set(x, 1.85, -0.02); curl.scale.set(0.7, 1.4, 0.7); n.add(curl);
    });

    // Hat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.07, 14), this.MAT.hat);
    brim.position.y = 2.35; n.add(brim);
    if (coatMat === this.MAT.coat) this.newtonHatBrim = brim;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.26, 0.48, 14), this.MAT.hat);
    crown.position.y = 2.63; n.add(crown);
    if (coatMat === this.MAT.coat) this.newtonHatCrown = crown;

    return n;
  }

  // ── Object factories ───────────────────────────────────────────────────

  private makeAppleMesh(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.MAT.appleRed);
    body.castShadow = true; g.add(body);
    const indent = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshLambertMaterial({ color: 0xaa0a0a }));
    indent.position.y = 0.2; g.add(indent);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 5), this.MAT.stem);
    stem.position.y = 0.32; g.add(stem);
    const leafGeo = new THREE.SphereGeometry(0.1, 6, 5);
    leafGeo.scale(1.8, 0.5, 1);
    const leaf = new THREE.Mesh(leafGeo, this.MAT.appleGreen);
    leaf.position.set(0.12, 0.41, 0); leaf.rotation.z = 0.3; g.add(leaf);
    return g;
  }

  private makeAnvilMesh(): THREE.Group {
    const g = new THREE.Group();
    const feet = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.18, 0.52), this.MAT.anvilDark);
    feet.position.y = -0.22; feet.castShadow = true; g.add(feet);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.44), this.MAT.anvilDark);
    neck.position.y = 0.04; g.add(neck);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.22, 0.48), this.MAT.anvilMid);
    top.position.y = 0.24; top.castShadow = true; g.add(top);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.14, 0.4, 7), this.MAT.anvilDark);
    horn.rotation.z = Math.PI/2; horn.position.set(0.57, 0.24, 0); g.add(horn);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 5, 8), new THREE.MeshLambertMaterial({ color: 0x888888 }));
    chain.position.set(0, 0.42, 0); g.add(chain);
    return g;
  }

  private makeSuperAppleMesh(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 10), this.MAT.superApple);
    body.castShadow = true; g.add(body);
    const indent = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), new THREE.MeshLambertMaterial({ color: 0xcc3300 }));
    indent.position.y = 0.40; g.add(indent);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), this.MAT.stem);
    stem.position.y = 0.62; g.add(stem);
    const leafGeo = new THREE.SphereGeometry(0.18, 6, 5); leafGeo.scale(1.8, 0.5, 1);
    const leaf = new THREE.Mesh(leafGeo, this.MAT.appleGreen);
    leaf.position.set(0.22, 0.75, 0); leaf.rotation.z = 0.3; g.add(leaf);
    return g;
  }

  private makeGoldenAppleMesh(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), this.MAT.goldenApple);
    body.castShadow = true; g.add(body);
    const indent = new THREE.Mesh(new THREE.SphereGeometry(0.10, 6, 6), new THREE.MeshLambertMaterial({ color: 0xdaa520 }));
    indent.position.y = 0.32; g.add(indent);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 5), this.MAT.stem);
    stem.position.y = 0.50; g.add(stem);
    const leafGeo = new THREE.SphereGeometry(0.15, 6, 5); leafGeo.scale(1.8, 0.5, 1);
    const leaf = new THREE.Mesh(leafGeo, this.MAT.goldenApple);
    leaf.position.set(0.18, 0.62, 0); leaf.rotation.z = 0.3; g.add(leaf);
    // Halo ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.04, 6, 16), this.MAT.goldenApple);
    ring.rotation.x = Math.PI / 2; g.add(ring);
    return g;
  }

  // Floating name label using a Canvas texture
  private createNameSprite(name: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 60;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(4, 4, 252, 52, 8);
    else ctx.rect(4, 4, 252, 52);
    ctx.fill();
    ctx.font = 'bold 26px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f5e8c0';
    ctx.fillText(name.slice(0, 18), 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.5, 0.6, 1);
    return sprite;
  }

  // ── Spawning (solo mode only — multiplayer uses addNetworkObject) ───────

  private spawnObject(): void {
    if (this.multiplayerMode) return;
    const tip = this.branchTips[Math.floor(Math.random() * this.branchTips.length)];
    const wave = this.gameState.wave();
    const rand = Math.random();
    const anvilChance  = Math.min(0.08 + wave * 0.04, 0.32);
    const goldenChance = 0.01;
    const superChance  = 0.05;
    let type: FallingObject['type'];
    if      (rand < anvilChance)                              type = 'anvil';
    else if (rand < anvilChance + goldenChance)               type = 'golden-apple';
    else if (rand < anvilChance + goldenChance + superChance) type = 'super-apple';
    else                                                      type = 'apple';

    const mesh = type === 'anvil'        ? this.makeAnvilMesh()
               : type === 'super-apple'  ? this.makeSuperAppleMesh()
               : type === 'golden-apple' ? this.makeGoldenAppleMesh()
               : this.makeAppleMesh();
    mesh.position.set(
      tip.x + (Math.random()-0.5) * 2.5,
      tip.y + 0.5,
      tip.z + (Math.random()-0.5) * 4.0
    );
    mesh.rotation.set((Math.random()-0.5)*0.4, Math.random()*Math.PI*2, (Math.random()-0.5)*0.4);
    this.scene.add(mesh);
    this.fallingObjects.push({
      id: `local-${Date.now()}-${Math.random()}`,
      mesh, type,
      speed: (3.5 + wave * 0.4) + Math.random() * 1.5,
      checked: false,
      network: false
    });
  }

  private spawnInterval(): number {
    return Math.max(0.5, 1.8 - this.gameState.wave() * 0.12);
  }

  // ── Particles ──────────────────────────────────────────────────────────

  private spawnCollectParticles(pos: THREE.Vector3, color: number, count: number): void {
    const mat = new THREE.MeshBasicMaterial({ color });
    const geo = new THREE.SphereGeometry(0.07, 5, 5);
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      const vel = new THREE.Vector3((Math.random()-0.5)*5, 2+Math.random()*4, (Math.random()-0.5)*5);
      this.scene.add(p);
      this.particles.push({ mesh: p, velocity: vel, life: 0.8, maxLife: 0.8 });
    }
  }

  // ── Game loop ──────────────────────────────────────────────────────────

  private animate(): void {
    this.animId = requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  private update(delta: number): void {
    const status = this.gameState.status();
    this.applyOrbitCamera();
    this.animateTreeSway();

    if (status !== 'playing') {
      this.animateNewtonIdle(0, 0);
      return;
    }

    this.updatePlayerMovement(delta);
    this.updatePowerUpTimers(delta);
    this.animateNewtonIdle(this.playerVelX, this.playerVelZ);
    this.updateFallingObjects(delta);
    if (!this.multiplayerMode) {
      this.updateSpawnTimer(delta);
      this.updateWaveTimer(delta);
    }
    this.updateMagnet(delta);
    this.updateParticles(delta);
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  private applyOrbitCamera(): void {
    const sinY = Math.sin(this.cameraYaw),   cosY = Math.cos(this.cameraYaw);
    const sinP = Math.sin(this.cameraPitch), cosP = Math.cos(this.cameraPitch);

    if (this.firstPerson) {
      const eyeX = this.playerX;
      const eyeY = this.playerY + 1.7;
      const eyeZ = this.playerZ;
      this.camera.position.set(eyeX, eyeY, eyeZ);
      this.camera.lookAt(
        eyeX - sinY * cosP * 10,
        eyeY - sinP * 10,
        eyeZ - cosY * cosP * 10
      );
    } else {
      const target = new THREE.Vector3(this.playerX, this.playerY + 1.8, this.playerZ);
      const offset = new THREE.Vector3(
        sinY * cosP * this.CAM_DIST_3P,
        sinP        * this.CAM_DIST_3P,
        cosY * cosP * this.CAM_DIST_3P
      );

      if (this.shakeAmount > 0.005) {
        offset.x += (Math.random()-0.5) * this.shakeAmount * 2;
        offset.y += (Math.random()-0.5) * this.shakeAmount;
        this.shakeAmount *= 0.82;
      } else {
        this.shakeAmount = 0;
      }

      this.camera.position.copy(target).add(offset);
      // Keep camera above ground
      if (this.camera.position.y < 0.4) this.camera.position.y = 0.4;
      this.camera.lookAt(target);
    }
  }

  // ── WASD/Arrow movement relative to camera yaw ────────────────────────

  private updatePlayerMovement(delta: number): void {
    // ── Sprint stamina ─────────────────────────────────────────────────
    const wantSprint = (this.keysHeld.has('shift') || this.touchSprint) && !this.sprintCooldownActive && this.sprintStaminaVal > 0;
    if (wantSprint) {
      this.sprintStaminaVal -= delta / this.gameState.sprintDuration();
      if (this.sprintStaminaVal <= 0) {
        this.sprintStaminaVal = 0;
        this.sprintCooldownActive = true;
      }
    } else if (this.sprintCooldownActive) {
      this.sprintStaminaVal += delta / this.gameState.sprintCooldownDuration();
      if (this.sprintStaminaVal >= 1) {
        this.sprintStaminaVal = 1;
        this.sprintCooldownActive = false;
      }
    } else {
      // Passive regen when not sprinting (half cooldown rate)
      this.sprintStaminaVal = Math.min(1, this.sprintStaminaVal + delta / (this.gameState.sprintCooldownDuration() * 2));
    }
    // Push sprint state to Angular signals every 4 frames
    if (++this.sprintUpdateFrames >= 4) {
      this.sprintUpdateFrames = 0;
      this.ngZone.run(() => this.gameState.setSprintState(this.sprintStaminaVal, this.sprintCooldownActive));
    }

    // ── Horizontal movement ────────────────────────────────────────────
    const baseSpeed = 6.5 * this.gameState.moveSpeedMultiplier();
    let speed = wantSprint ? baseSpeed * this.gameState.sprintSpeedMultiplier() : baseSpeed;
    if (this.speedBoostTimer > 0) speed *= 1.8;
    let fwd = 0, str = 0;

    if (this.keysHeld.has('w') || this.keysHeld.has('arrowup'))    fwd += 1;
    if (this.keysHeld.has('s') || this.keysHeld.has('arrowdown'))  fwd -= 1;
    if (this.keysHeld.has('a') || this.keysHeld.has('arrowleft'))  str -= 1;
    if (this.keysHeld.has('d') || this.keysHeld.has('arrowright')) str += 1;
    fwd += this.touchDirZ;
    str += this.touchDirX;

    const fwdX = -Math.sin(this.cameraYaw), fwdZ = -Math.cos(this.cameraYaw);
    const rgtX =  Math.cos(this.cameraYaw), rgtZ = -Math.sin(this.cameraYaw);

    let dx = fwdX*fwd + rgtX*str;
    let dz = fwdZ*fwd + rgtZ*str;
    const len = Math.sqrt(dx*dx + dz*dz);
    if (len > 1) { dx /= len; dz /= len; }

    this.playerVelX = dx * speed;
    this.playerVelZ = dz * speed;
    this.playerX = Math.max(this.PLAYER_MIN_X, Math.min(this.PLAYER_MAX_X, this.playerX + this.playerVelX * delta));
    this.playerZ = Math.max(this.PLAYER_MIN_Z, Math.min(this.PLAYER_MAX_Z, this.playerZ + this.playerVelZ * delta));

    // ── Trunk collision ────────────────────────────────────────────────
    for (const trunk of this.trunkPositions) {
      const txDist = Math.sqrt((this.playerX - trunk.x) ** 2 + (this.playerZ - trunk.z) ** 2);
      if (txDist < trunk.r && txDist > 0.001) {
        const angle = Math.atan2(this.playerX - trunk.x, this.playerZ - trunk.z);
        this.playerX = Math.sin(angle) * trunk.r + trunk.x;
        this.playerZ = Math.cos(angle) * trunk.r + trunk.z;
      }
    }

    // ── Jump / gravity ─────────────────────────────────────────────────
    if (!this.isGrounded) {
      this.playerVelY -= this.GRAVITY * delta;
      this.playerY += this.playerVelY * delta;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.playerVelY = 0;
        this.isGrounded = true;
      }
    }

    this.newtonGroup.position.set(this.playerX, this.playerY, this.playerZ);

    if (len > 0.05) {
      const target = Math.atan2(dx, dz);
      let diff = target - this.newtonGroup.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.newtonGroup.rotation.y += diff * 0.18;
    }
  }

  private animateNewtonIdle(velX: number, velZ: number): void {
    if (!this.newtonLeftLeg) return;
    const t = this.clock.elapsedTime;
    const speed = Math.sqrt(velX*velX + velZ*velZ);
    const walking = speed > 0.5;
    const bobRate = walking ? 8 : 2;
    if (walking) {
      const s = Math.sin(t * bobRate) * 0.35;
      this.newtonLeftLeg.rotation.x  =  s;
      this.newtonRightLeg.rotation.x = -s;
      this.newtonLeftArm.rotation.x  = -s * 0.7;
      this.newtonRightArm.rotation.x =  s * 0.7;
    } else {
      this.newtonLeftLeg.rotation.x  *= 0.85;
      this.newtonRightLeg.rotation.x *= 0.85;
      this.newtonLeftArm.rotation.x  *= 0.85;
      this.newtonRightArm.rotation.x *= 0.85;
    }
    this.newtonBody.position.y = 1.13 + Math.sin(t * bobRate) * (walking ? 0.06 : 0.02);
  }

  // ── Falling object update + collision ─────────────────────────────────

  private updateFallingObjects(delta: number): void {
    const toRemove: FallingObject[] = [];

    for (const obj of this.fallingObjects) {
      if (obj.type === 'anvil') obj.mesh.rotation.z += delta * 3;
      else                       obj.mesh.rotation.y += delta * 1.5;

      obj.mesh.position.y -= obj.speed * delta;

      if (!obj.checked && obj.mesh.position.y <= this.PLAYER_Y_CENTER + 0.6) {
        obj.checked = true;
        const dx = Math.abs(obj.mesh.position.x - this.playerX);
        const dz = Math.abs(obj.mesh.position.z - this.playerZ);
        const baseHr = obj.type === 'anvil' ? 1.15 : 0.90;
        const hr = baseHr + (this.bigHeadTimer > 0 ? 0.6 : 0);

        if (dx < hr && dz < hr) {
          const hitPos = new THREE.Vector3(this.playerX, this.PLAYER_Y_CENTER, this.playerZ);

          // Engine-level effects apply regardless of solo/multi
          if (obj.type === 'super-apple')  { this.speedBoostTimer = 30; }
          if (obj.type === 'golden-apple') { this.bigHeadTimer = 30; this.applyHeadScale(1.7); }

          if (this.multiplayerMode) {
            let newIq: number;
            if      (obj.type === 'apple')        newIq = this.gameState.iq() + this.gameState.iqPerApple();
            else if (obj.type === 'super-apple')  newIq = this.gameState.iq() + this.gameState.iqPerSuperApple();
            else if (obj.type === 'golden-apple') newIq = this.gameState.iq() * 2;
            else                                  newIq = Math.max(0, this.gameState.iq() - 25);
            this.ngZone.run(() => this.catchEvent$.next({ objectId: obj.id, type: obj.type, newIq }));
          } else {
            if (obj.type === 'apple') {
              this.ngZone.run(() => this.gameState.collectApple());
              this.spawnCollectParticles(hitPos, 0xff3333, 10);
            } else if (obj.type === 'super-apple') {
              this.ngZone.run(() => this.gameState.collectSuperApple());
              this.spawnCollectParticles(hitPos, 0xff6600, 15);
            } else if (obj.type === 'golden-apple') {
              this.ngZone.run(() => this.gameState.doubleIq());
              this.spawnCollectParticles(hitPos, 0xffd700, 20);
            } else {
              this.ngZone.run(() => this.gameState.hitByAnvil());
              this.triggerCameraShake(0.5);
              this.spawnCollectParticles(hitPos, 0x777777, 18);
            }
          }
          toRemove.push(obj);
        }
      }

      if (obj.mesh.position.y < -2) toRemove.push(obj);
    }

    for (const obj of toRemove) {
      this.scene.remove(obj.mesh);
      const i = this.fallingObjects.indexOf(obj);
      if (i > -1) this.fallingObjects.splice(i, 1);
    }
  }

  private updateSpawnTimer(delta: number): void {
    this.spawnTimer += delta;
    if (this.spawnTimer >= this.spawnInterval()) { this.spawnTimer = 0; this.spawnObject(); }
  }

  private updateWaveTimer(delta: number): void {
    this.waveTimer += delta;
    if (this.waveTimer >= this.WAVE_DURATION) {
      this.waveTimer = 0;
      this.ngZone.run(() => this.gameState.endWave());
    }
  }

  private updateMagnet(delta: number): void {
    const r = this.gameState.magnetRadius();
    if (r === 0) return;
    for (const obj of this.fallingObjects) {
      if (obj.type === 'anvil') continue;
      const dx = this.playerX - obj.mesh.position.x, dz = this.playerZ - obj.mesh.position.z;
      const d = Math.sqrt(dx*dx + dz*dz);
      if (d < r && d > 0.1) {
        const f = (1 - d/r) * 4 * delta;
        obj.mesh.position.x += (dx/d)*f;
        obj.mesh.position.z += (dz/d)*f;
      }
    }
  }

  private updateParticles(delta: number): void {
    const toRemove: Particle[] = [];
    for (const p of this.particles) {
      p.life -= delta;
      p.velocity.y -= 9.8 * delta;
      p.mesh.position.addScaledVector(p.velocity, delta);
      p.mesh.scale.setScalar(Math.max(0, p.life / p.maxLife));
      if (p.life <= 0) toRemove.push(p);
    }
    for (const p of toRemove) {
      this.scene.remove(p.mesh);
      const i = this.particles.indexOf(p);
      if (i > -1) this.particles.splice(i, 1);
    }
  }

  private animateTreeSway(): void {
    const t = this.clock.elapsedTime;
    this.trees.forEach((tree, i) => {
      tree.rotation.z = Math.sin(t * 0.35 + i * 0.5) * 0.008;
      tree.rotation.x = Math.sin(t * 0.25 + 1 + i * 0.3) * 0.004;
    });
  }

  private applyHeadScale(s: number): void {
    if (this.newtonHeadMesh) this.newtonHeadMesh.scale.setScalar(s);
    if (this.newtonWigMesh)  this.newtonWigMesh.scale.set(1.15 * s, 0.95 * s, 1.05 * s);
    if (this.newtonHatBrim)  this.newtonHatBrim.scale.setScalar(s);
    if (this.newtonHatCrown) this.newtonHatCrown.scale.setScalar(s);
  }

  private updatePowerUpTimers(delta: number): void {
    if (this.speedBoostTimer > 0) this.speedBoostTimer -= delta;
    if (this.bigHeadTimer > 0) {
      this.bigHeadTimer -= delta;
      if (this.bigHeadTimer <= 0) { this.bigHeadTimer = 0; this.applyHeadScale(1.0); }
    }
  }

  private setupResizeHandler(canvas: HTMLCanvasElement): void {
    window.addEventListener('resize', () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }
}
