import { Injectable, signal, computed } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  hostName: string;
  inProgress: boolean;
  wave: number;
}

export interface RemotePlayerInfo {
  socketId: string;
  username: string;
  iq: number;
  x: number;
  z: number;
  yaw: number;
  colorIdx: number;
}

export interface RoomState {
  id: string;
  name: string;
  status: 'waiting' | 'playing' | 'upgrade' | 'ended';
  wave: number;
  hostSocketId: string;
  players: RemotePlayerInfo[];
}

export interface WaveScore {
  socketId: string;
  username: string;
  iq: number;
}

export interface SpawnedObject {
  id: string;
  type: 'apple' | 'anvil';
  x: number; y: number; z: number;
  speed: number;
}

const SERVER_URL = () =>
  window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;

@Injectable({ providedIn: 'root' })
export class MultiplayerService {
  private socket: Socket | null = null;

  // ── Signals (reactive state for UI) ────────────────────────────────────
  readonly connected      = signal(false);
  readonly mySocketId     = signal<string>('');
  readonly currentRoom    = signal<RoomState | null>(null);
  readonly scores         = signal<Map<string, number>>(new Map());
  readonly availableRooms = signal<RoomInfo[]>([]);
  readonly waveScores     = signal<WaveScore[]>([]);
  readonly isHost         = computed(() => {
    const r = this.currentRoom();
    return r ? r.hostSocketId === this.mySocketId() : false;
  });

  // ── Observables for engine / game-component integration ────────────────
  readonly objectSpawned$ = new Subject<SpawnedObject>();
  readonly objectCaught$  = new Subject<{ objectId: string; catcherSocketId: string }>();
  readonly playerMoved$   = new Subject<{ socketId: string; x: number; z: number; yaw: number }>();
  readonly playerJoined$  = new Subject<RemotePlayerInfo>();
  readonly playerLeft$    = new Subject<string>(); // socketId
  readonly waveStart$     = new Subject<{ wave: number }>();
  readonly waveEnd$       = new Subject<WaveScore[]>();
  readonly scoreUpdate$   = new Subject<{ socketId: string; iq: number }>();
  readonly gameEnded$     = new Subject<WaveScore[]>();

  // ── Connection ─────────────────────────────────────────────────────────

  connect(token: string): void {
    if (this.socket?.connected) return;

    this.socket = io(SERVER_URL(), {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.mySocketId.set(this.socket!.id ?? '');
      // If connecting with a socket (no REST token), authenticate via event
      if (!token) this.socket!.emit('auth:anonymous', { name: 'Newton' });
    });

    this.socket.on('disconnect', () => {
      this.connected.set(false);
      this.currentRoom.set(null);
    });

    this.socket.on('auth:ok', (data: { token: string; user: { id: string; username: string; isAnonymous: boolean } }) => {
      // Could persist token here; for now just note connection is authenticated
      console.log('[mp] auth ok:', data.user.username);
    });

    this.socket.on('room:list', (list: RoomInfo[]) => this.availableRooms.set(list));

    this.socket.on('room:joined', (data: { room: RoomState; you: RemotePlayerInfo }) => {
      this.currentRoom.set(data.room);
      this.mySocketId.set(data.you.socketId);
      this.syncScores(data.room.players);
    });

    this.socket.on('room:playerJoined', (data: { player: RemotePlayerInfo }) => {
      this.currentRoom.update(r => r ? ({
        ...r, players: [...r.players, data.player]
      }) : r);
      this.scores.update(m => { const n = new Map(m); n.set(data.player.socketId, data.player.iq); return n; });
      this.playerJoined$.next(data.player);
    });

    this.socket.on('room:playerLeft', (data: { socketId: string }) => {
      this.currentRoom.update(r => r ? ({
        ...r, players: r.players.filter(p => p.socketId !== data.socketId)
      }) : r);
      this.scores.update(m => { const n = new Map(m); n.delete(data.socketId); return n; });
      this.playerLeft$.next(data.socketId);
    });

    this.socket.on('room:newHost', (data: { socketId: string }) => {
      this.currentRoom.update(r => r ? ({ ...r, hostSocketId: data.socketId }) : r);
    });

    this.socket.on('game:waveStart', (data: { wave: number }) => {
      this.currentRoom.update(r => r ? ({ ...r, status: 'playing', wave: data.wave }) : r);
      this.waveStart$.next(data);
    });

    this.socket.on('game:spawn', (obj: SpawnedObject) => this.objectSpawned$.next(obj));

    this.socket.on('game:objectCaught', (data: { objectId: string; catcherSocketId: string }) => {
      this.objectCaught$.next(data);
    });

    this.socket.on('player:moved', (data: { socketId: string; x: number; z: number; yaw: number }) => {
      this.currentRoom.update(r => r ? ({
        ...r,
        players: r.players.map(p => p.socketId === data.socketId ? { ...p, ...data } : p)
      }) : r);
      this.playerMoved$.next(data);
    });

    this.socket.on('player:score', (data: { socketId: string; iq: number }) => {
      this.scores.update(m => { const n = new Map(m); n.set(data.socketId, data.iq); return n; });
      this.scoreUpdate$.next(data);
    });

    this.socket.on('game:waveEnd', (data: { wave: number; scores: WaveScore[] }) => {
      this.waveScores.set(data.scores);
      this.currentRoom.update(r => r ? ({ ...r, status: 'upgrade' }) : r);
      this.waveEnd$.next(data.scores);
    });

    this.socket.on('game:ended', (data: { scores: WaveScore[] }) => {
      this.currentRoom.update(r => r ? ({ ...r, status: 'ended' }) : r);
      this.gameEnded$.next(data.scores);
    });

    this.socket.on('error', (msg: string) => console.warn('[mp] error:', msg));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
    this.currentRoom.set(null);
  }

  // ── Room actions ───────────────────────────────────────────────────────

  listRooms():           void { this.socket?.emit('room:list'); }
  createRoom(name: string): void { this.socket?.emit('room:create', { name }); }
  joinRoom(roomId: string): void { this.socket?.emit('room:join', { roomId }); }
  leaveRoom():           void { this.socket?.emit('room:leave'); this.currentRoom.set(null); }
  startGame():           void { this.socket?.emit('game:start'); }

  // ── In-game actions ────────────────────────────────────────────────────

  sendMove(x: number, z: number, yaw: number): void {
    this.socket?.volatile.emit('player:move', { x, z, yaw });
  }

  reportCatch(objectId: string, type: 'apple' | 'anvil', newIq: number): void {
    this.socket?.emit('player:catch', { objectId, type, newIq });
  }

  sendReady(upgrades: object): void {
    this.socket?.emit('player:upgrade', { upgrades });
    this.socket?.emit('player:ready');
  }

  // ── Auth via socket (for anonymous users) ──────────────────────────────

  authenticateAnonymous(name: string, token: string): void {
    if (token) {
      this.socket?.emit('auth:token', { token });
    } else {
      this.socket?.emit('auth:anonymous', { name });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private syncScores(players: RemotePlayerInfo[]): void {
    const m = new Map<string, number>();
    players.forEach(p => m.set(p.socketId, p.iq));
    this.scores.set(m);
  }

  getPlayerName(socketId: string): string {
    return this.currentRoom()?.players.find(p => p.socketId === socketId)?.username ?? '?';
  }
}
