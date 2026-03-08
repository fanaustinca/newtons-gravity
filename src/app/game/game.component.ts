import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy,
  HostListener, inject, effect, signal, NgZone, Output, EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { EngineService } from './engine.service';
import { GameStateService } from './game-state.service';
import { AppStateService } from '../services/app-state.service';
import { MultiplayerService } from '../services/multiplayer.service';
import { AuthService } from '../services/auth.service';
import { HudComponent } from '../ui/hud/hud.component';
import { UpgradeComponent } from '../ui/upgrade/upgrade.component';
import { GameOverComponent } from '../ui/game-over/game-over.component';
import { ScoreboardComponent } from '../ui/scoreboard/scoreboard.component';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, HudComponent, UpgradeComponent, GameOverComponent, ScoreboardComponent],
  template: `
    <div class="game-wrapper">
      <canvas #gameCanvas class="game-canvas" (click)="requestPointerLock()"></canvas>

      <!-- "Click to look" overlay — rendered before ui-layer so buttons stay on top -->
      @if (gameState.status() === 'playing' && !pointerLocked()) {
        <div class="click-overlay" (click)="requestPointerLock()">
          <div class="click-hint">
            <div class="click-icon">🖱️</div>
            <div>Click to control camera</div>
            <div class="click-sub">WASD / Arrow keys to move · ESC to release</div>
          </div>
        </div>
      }

      <div class="ui-layer">
        @if (gameState.status() === 'playing') {
          <app-hud />
        }
        @if (gameState.status() === 'upgrade') {
          <app-upgrade (nextWave)="onNextWave()" />
        }
        @if (gameState.status() === 'dead') {
          <app-game-over (restart)="onRestart()" (exitToMenu)="exitToMenu.emit()" />
        }
        @if (isMulti && gameState.status() === 'playing') {
          <app-scoreboard />
        }
        @if (isMulti) {
          <button class="disconnect-btn" (click)="onDisconnect()">✕ Leave Game</button>
        }
        @if (!isMulti && gameState.status() === 'playing') {
          <button class="disconnect-btn" (click)="exitToMenu.emit()">✕ Leave Game</button>
        }
      </div>

      <!-- Touch controls -->
      @if (gameState.status() === 'playing') {
        <!-- Camera zone (right half) -->
        <div class="cam-zone"
             (touchstart)="camTouchStart($event)"
             (touchmove)="camTouchMove($event)"
             (touchend)="camTouchEnd($event)"
             (touchcancel)="camTouchEnd($event)">
        </div>

        <!-- D-pad -->
        <div class="dpad"
             (touchstart)="dpadTouchStart($event)"
             (touchmove)="dpadTouchMove($event)"
             (touchend)="dpadTouchEnd($event)"
             (touchcancel)="dpadTouchEnd($event)">
          <div class="dpad-btn dpad-up">▲</div>
          <div class="dpad-btn dpad-left">◀</div>
          <div class="dpad-btn dpad-right">▶</div>
          <div class="dpad-btn dpad-down">▼</div>
          <div class="dpad-center"></div>
        </div>

        <!-- Sprint button -->
        <div class="sprint-touch-btn" [class.active]="sprintActive()"
             (touchstart)="sprintTouchStart($event)"
             (touchend)="sprintTouchEnd($event)"
             (touchcancel)="sprintTouchEnd($event)">
          💨
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block; width: 100%; height: 100%;
    }
    .game-wrapper {
      position: relative; width: 100%; height: 100%; overflow: hidden;
    }
    .game-canvas {
      display: block; width: 100%; height: 100%; cursor: crosshair;
    }
    .ui-layer {
      position: absolute; inset: 0; pointer-events: none;
    }
    .ui-layer > * { pointer-events: auto; }
    .disconnect-btn {
      position: absolute; top: 14px; right: 14px;
      background: rgba(180,30,30,.75); border: 1px solid rgba(255,80,80,.4);
      border-radius: 8px; padding: 6px 14px; color: #ffd0d0;
      font-size: .75rem; cursor: pointer; transition: background .18s;
    }
    .disconnect-btn:hover { background: rgba(200,40,40,.95); }
    .click-overlay {
      position: absolute; inset: 0; display: flex; align-items: center;
      justify-content: center; background: rgba(0,0,0,0.45);
      cursor: pointer; animation: fadeIn 0.3s ease;
    }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    .click-hint {
      background: rgba(20,10,2,.85); border: 1px solid rgba(200,160,40,.5);
      border-radius: 14px; padding: 28px 44px; text-align: center;
      color: #f0e0c0; font-family: 'Georgia',serif; pointer-events: none;
    }
    .click-icon { font-size: 2.5rem; margin-bottom: 10px; }
    .click-hint > div:nth-child(2) { font-size: 1.1rem; font-weight: bold; margin-bottom: 6px; }
    .click-sub { font-size: .75rem; color: rgba(200,180,130,.65); }
    .dpad {
      position: absolute; bottom: 28px; left: 28px;
      width: 130px; height: 130px;
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: 1fr 1fr 1fr; gap: 3px; touch-action: none;
    }
    .dpad-btn {
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2);
      border-radius: 6px; color: rgba(255,255,255,.55); font-size: 1rem; user-select: none;
    }
    .dpad-center { background: rgba(255,255,255,.06); border-radius: 6px; }
    .dpad-up    { grid-column: 2; grid-row: 1; }
    .dpad-left  { grid-column: 1; grid-row: 2; }
    .dpad-center{ grid-column: 2; grid-row: 2; }
    .dpad-right { grid-column: 3; grid-row: 2; }
    .dpad-down  { grid-column: 2; grid-row: 3; }
    .cam-zone {
      position: absolute; right: 0; top: 0;
      width: 50%; height: 100%; touch-action: none;
    }
    .sprint-touch-btn {
      position: absolute; bottom: 28px; left: 172px;
      width: 60px; height: 60px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2);
      border-radius: 50%; font-size: 1.4rem; touch-action: none; user-select: none;
      transition: background .1s;
    }
    .sprint-touch-btn.active { background: rgba(79,195,247,.35); border-color: rgba(79,195,247,.6); }
  `]
})
export class GameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') private canvasRef!: ElementRef<HTMLCanvasElement>;
  @Output() exitToMenu = new EventEmitter<void>();

  readonly gameState = inject(GameStateService);
  private readonly engine    = inject(EngineService);
  private readonly appState  = inject(AppStateService);
  private readonly mp        = inject(MultiplayerService);
  private readonly auth      = inject(AuthService);
  private readonly ngZone    = inject(NgZone);

  readonly pointerLocked = signal(false);
  get isMulti(): boolean { return this.appState.gameMode() === 'multi'; }

  private resizeObs!: ResizeObserver;
  private subs = new Subscription();
  private positionSyncTimer: ReturnType<typeof setInterval> | null = null;

  private readonly onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.canvasRef?.nativeElement;
    this.ngZone.run(() => this.pointerLocked.set(locked));
    if (!locked) this.engine.setTouchDir(0, 0);
  };

  private dpadOriginX = 0;
  private dpadOriginY = 0;

  private camTouchId: number | null = null;
  private camLastX = 0;
  private camLastY = 0;
  readonly sprintActive = signal(false);

  constructor() {
    // Trigger engine wave reset whenever status becomes 'playing'
    effect(() => {
      if (this.gameState.status() === 'playing') {
        this.engine.onWaveStart();
      }
    });

    // Release pointer lock when leaving the playing state
    effect(() => {
      if (this.gameState.status() !== 'playing' && this.pointerLocked()) {
        document.exitPointerLock();
      }
    });

    // Report solo score to server when player dies (registered users only)
    effect(() => {
      if (this.gameState.status() === 'dead' && !this.isMulti) {
        const iq = this.gameState.totalIqEarned();
        if (iq > 0) this.auth.reportSoloScore(iq);
      }
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width  = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    this.engine.init(canvas, this.isMulti);

    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    this.resizeObs = new ResizeObserver(() => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
    this.resizeObs.observe(canvas);

    if (this.isMulti) {
      this.gameState.startGame();
      this.setupMultiplayer();
    } else {
      this.gameState.startGame();
    }
  }

  ngOnDestroy(): void {
    this.engine.dispose();
    this.resizeObs?.disconnect();
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    if (this.pointerLocked()) document.exitPointerLock();
    this.subs.unsubscribe();
    if (this.positionSyncTimer) clearInterval(this.positionSyncTimer);
    if (this.isMulti) {
      this.engine.multiplayerMode = false;
    }
  }

  private setupMultiplayer(): void {
    // Server-spawned objects
    this.subs.add(this.mp.objectSpawned$.subscribe(obj => {
      this.engine.addNetworkObject(obj.id, obj.type, obj.x, obj.y, obj.z, obj.speed);
    }));

    // Object caught by any player — remove from scene
    this.subs.add(this.mp.objectCaught$.subscribe(({ objectId }) => {
      this.engine.removeNetworkObject(objectId);
    }));

    // Remote player movement
    this.subs.add(this.mp.playerMoved$.subscribe(({ socketId, x, z, yaw }) => {
      if (socketId === this.mp.mySocketId()) return;
      const room = this.mp.currentRoom();
      const p = room?.players.find(pl => pl.socketId === socketId);
      if (p) this.engine.addOrUpdateRemotePlayer(socketId, p.username, p.colorIdx, x, z, yaw);
    }));

    // Player joined mid-game
    this.subs.add(this.mp.playerJoined$.subscribe(p => {
      this.engine.addOrUpdateRemotePlayer(p.socketId, p.username, p.colorIdx, p.x, p.z, p.yaw);
    }));

    // Player disconnected
    this.subs.add(this.mp.playerLeft$.subscribe(socketId => {
      this.engine.removeRemotePlayer(socketId);
    }));

    // Wave ended — show upgrade screen
    this.subs.add(this.mp.waveEnd$.subscribe(() => {
      this.ngZone.run(() => this.gameState.endWave());
    }));

    // Next wave started by server
    this.subs.add(this.mp.waveStart$.subscribe(() => {
      this.ngZone.run(() => this.gameState.startNextWave());
    }));

    // Server authoritative score update
    this.subs.add(this.mp.scoreUpdate$.subscribe(({ socketId, iq }) => {
      if (socketId === this.mp.mySocketId()) {
        this.ngZone.run(() => this.gameState.setIq(iq));
      }
    }));

    // Local catch events → report to server + optimistic local update
    this.subs.add(this.engine.catchEvent$.subscribe(event => {
      this.mp.reportCatch(event.objectId, event.type, event.newIq);
      if (event.type === 'apple')              this.gameState.collectApple();
      else if (event.type === 'super-apple')   this.gameState.collectSuperApple();
      else if (event.type === 'golden-apple')  this.gameState.doubleIq();
      else                                     this.gameState.hitByAnvilMultiplayer();
    }));

    // Game ended after wave 20
    this.subs.add(this.mp.gameEnded$.subscribe(() => {
      this.ngZone.run(() => this.exitToMenu.emit());
    }));

    // Throttled position sync ~10Hz
    this.positionSyncTimer = setInterval(() => {
      const state = this.engine.getPlayerState();
      this.mp.sendMove(state.x, state.z, state.yaw);
    }, 100);
  }

  requestPointerLock(): void {
    if (this.gameState.status() === 'playing') {
      this.canvasRef.nativeElement.requestPointerLock();
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (this.pointerLocked() && this.gameState.status() === 'playing') {
      this.engine.cameraMouseDelta(e.movementX, e.movementY);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) {
      e.preventDefault();
    }
    this.engine.keyDown(e.key);
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    this.engine.keyUp(e.key);
  }

  dpadTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.dpadOriginX = rect.left + rect.width  / 2;
    this.dpadOriginY = rect.top  + rect.height / 2;
    this.dpadUpdate(t.clientX, t.clientY);
  }

  dpadTouchMove(e: TouchEvent): void {
    e.preventDefault();
    if (e.touches.length === 0) return;
    this.dpadUpdate(e.touches[0].clientX, e.touches[0].clientY);
  }

  dpadTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this.engine.setTouchDir(0, 0);
  }

  camTouchStart(e: TouchEvent): void {
    e.preventDefault();
    if (this.camTouchId !== null) return;
    const t = e.changedTouches[0];
    this.camTouchId = t.identifier;
    this.camLastX = t.clientX;
    this.camLastY = t.clientY;
  }

  camTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== this.camTouchId) continue;
      this.engine.touchCameraDelta(t.clientX - this.camLastX, t.clientY - this.camLastY);
      this.camLastX = t.clientX;
      this.camLastY = t.clientY;
    }
  }

  camTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.camTouchId) {
        this.camTouchId = null;
      }
    }
  }

  sprintTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.sprintActive.set(true);
    this.engine.setTouchSprint(true);
  }

  sprintTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this.sprintActive.set(false);
    this.engine.setTouchSprint(false);
  }

  private dpadUpdate(cx: number, cy: number): void {
    const dx = (cx - this.dpadOriginX) / 48;
    const dz = -(cy - this.dpadOriginY) / 48;
    const len = Math.sqrt(dx * dx + dz * dz);
    const nx = len > 1 ? dx / len : dx;
    const nz = len > 1 ? dz / len : dz;
    this.engine.setTouchDir(nx, nz);
  }

  onNextWave(): void {
    if (this.isMulti) {
      this.mp.sendReady(this.gameState.upgrades());
    } else {
      this.gameState.startNextWave();
    }
  }

  onDisconnect(): void {
    this.mp.leaveRoom();
    this.mp.disconnect();
    this.exitToMenu.emit();
  }

  onRestart(): void {
    if (this.isMulti) {
      this.exitToMenu.emit();
    } else {
      this.gameState.startGame();
    }
  }
}
