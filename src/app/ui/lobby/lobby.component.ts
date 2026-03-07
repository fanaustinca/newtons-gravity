import { Component, Output, EventEmitter, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MultiplayerService, RoomState } from '../../services/multiplayer.service';
import { AuthService } from '../../services/auth.service';

type LobbyTab = 'browse' | 'create' | 'room';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="lobby-overlay">
      <div class="lobby-card">

        <div class="header">
          <button class="back-btn" (click)="back.emit()">← Back</button>
          <h2 class="lobby-title">Multiplayer Lobby</h2>
          <span class="user-pill">{{ auth.user()?.username }}</span>
        </div>

        @if (!mp.currentRoom()) {
          <!-- Browse / Create tabs -->
          <div class="tabs">
            <button class="tab" [class.active]="tab() === 'browse'" (click)="switchTab('browse')">Browse Rooms</button>
            <button class="tab" [class.active]="tab() === 'create'" (click)="tab.set('create')">Create Room</button>
          </div>

          @if (tab() === 'browse') {
            <div class="room-list">
              @if (mp.availableRooms().length === 0) {
                <div class="empty">No open rooms. Create one!</div>
              }
              @for (room of mp.availableRooms(); track room.id) {
                <div class="room-row">
                  <div class="room-info">
                    <span class="room-name">{{ room.name }}</span>
                    <span class="room-meta">Host: {{ room.hostName }} · {{ room.playerCount }}/8 players</span>
                  </div>
                  <button class="join-btn" (click)="join(room.id)">Join</button>
                </div>
              }
            </div>
            <button class="secondary-btn" (click)="refresh()">↻ Refresh</button>
          }

          @if (tab() === 'create') {
            <div class="form-area">
              <input class="field" [(ngModel)]="newRoomName" placeholder="Room name" maxlength="30" />
              <button class="primary-btn" (click)="create()">Create & Enter Room</button>
            </div>
          }
        }

        @if (mp.currentRoom(); as room) {
          <!-- Inside room -->
          <div class="room-header">
            <span class="room-badge">Room: {{ room.id }}</span>
            <span class="room-status" [class.waiting]="room.status === 'waiting'">{{ room.status }}</span>
          </div>

          <div class="player-list">
            @for (p of room.players; track p.socketId) {
              <div class="player-row" [class.me]="p.socketId === mp.mySocketId()">
                <span class="player-color" [style.background]="playerColor(p.colorIdx)"></span>
                <span class="player-name">{{ p.username }}</span>
                @if (p.socketId === room.hostSocketId) {
                  <span class="host-badge">HOST</span>
                }
                @if (p.socketId === mp.mySocketId()) {
                  <span class="me-badge">YOU</span>
                }
                <span class="player-iq">IQ: {{ mp.scores().get(p.socketId) ?? 0 }}</span>
              </div>
            }
          </div>

          @if (error()) { <div class="error">{{ error() }}</div> }

          <div class="room-actions">
            @if (room.players.length >= 8) {
              <p class="waiting-hint auto-start">Starting automatically…</p>
            } @else if (mp.isHost()) {
              <button class="primary-btn" (click)="startGame()">
                Start Game ({{ room.players.length }}/8)
              </button>
              <p class="waiting-hint">Game auto-starts at 8 players</p>
            } @else {
              <p class="waiting-hint">Waiting for host to start… ({{ room.players.length }}/8)</p>
            }
            <button class="secondary-btn" (click)="leaveRoom()">Leave Room</button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .lobby-overlay {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(10,5,0,.85); backdrop-filter: blur(6px);
    }
    .lobby-card {
      background: linear-gradient(160deg,#2a1a08,#1a0d04);
      border: 1px solid rgba(200,160,40,.4);
      border-radius: 18px; padding: 32px 40px;
      max-width: 540px; width: calc(100% - 32px);
      max-height: 88vh; overflow-y: auto;
      box-shadow: 0 8px 48px rgba(0,0,0,.7);
    }
    .header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
    .back-btn {
      background: none; border: 1px solid rgba(200,160,40,.3); border-radius: 8px;
      padding: 5px 12px; color: rgba(200,185,140,.75); cursor: pointer; font-size: .8rem;
    }
    .back-btn:hover { border-color: rgba(200,160,40,.7); color: #f5e8c0; }
    .lobby-title { flex: 1; font-family: 'Georgia',serif; color: #f5e8c0; font-size: 1.4rem; margin: 0; }
    .user-pill { font-size: .72rem; color: #f5c842; background: rgba(200,160,0,.15); border-radius: 20px; padding: 3px 10px; }
    .tabs { display: flex; gap: 4px; margin-bottom: 18px; background: rgba(0,0,0,.3); border-radius: 10px; padding: 4px; }
    .tab {
      flex: 1; padding: 8px; border: none; border-radius: 8px; cursor: pointer;
      background: transparent; color: rgba(200,185,140,.65); font-size: .8rem; font-family: 'Georgia',serif;
    }
    .tab.active { background: rgba(200,160,40,.2); color: #f5c842; }
    .room-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; min-height: 80px; }
    .empty { color: rgba(200,185,140,.55); font-style: italic; font-size: .82rem; text-align: center; padding: 24px 0; }
    .room-row {
      display: flex; align-items: center; gap: 12px;
      background: rgba(0,0,0,.3); border: 1px solid rgba(200,160,40,.15); border-radius: 10px; padding: 12px 16px;
    }
    .room-info { flex: 1; }
    .room-name { display: block; font-size: .92rem; color: #f0e0c0; }
    .room-meta { display: block; font-size: .7rem; color: rgba(200,185,140,.55); margin-top: 2px; }
    .join-btn {
      background: linear-gradient(135deg,#b8860b,#c9a227); border: none; border-radius: 8px;
      padding: 7px 18px; color: #1a0d04; font-weight: bold; cursor: pointer; font-size: .82rem;
    }
    .form-area { display: flex; flex-direction: column; gap: 12px; }
    .field {
      background: rgba(0,0,0,.4); border: 1px solid rgba(200,160,40,.25); border-radius: 8px;
      padding: 11px 14px; color: #f0e0c0; font-size: .9rem; font-family: 'Georgia',serif; outline: none;
    }
    .field:focus { border-color: rgba(200,160,40,.6); }
    .room-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
    .room-badge { font-size: .72rem; background: rgba(200,160,0,.15); color: #f5c842; border-radius: 6px; padding: 4px 10px; font-weight: bold; letter-spacing: .08em; }
    .room-status { font-size: .7rem; text-transform: uppercase; letter-spacing: .12em; color: rgba(200,185,140,.6); }
    .room-status.waiting { color: #81c784; }
    .player-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
    .player-row {
      display: flex; align-items: center; gap: 10px;
      background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.06); border-radius: 8px; padding: 10px 14px;
    }
    .player-row.me { border-color: rgba(200,160,40,.3); }
    .player-color { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .player-name { flex: 1; font-size: .88rem; color: #f0e0c0; }
    .host-badge { font-size: .62rem; color: #f5c842; background: rgba(200,160,0,.2); border-radius: 4px; padding: 2px 6px; letter-spacing: .08em; }
    .me-badge { font-size: .62rem; color: #81c784; background: rgba(100,200,100,.15); border-radius: 4px; padding: 2px 6px; }
    .player-iq { font-size: .78rem; color: #f5c842; font-family: 'Georgia',serif; }
    .room-actions { display: flex; flex-direction: column; gap: 10px; }
    .waiting-hint { color: rgba(200,185,140,.65); font-style: italic; font-size: .82rem; text-align: center; }
    .auto-start { color: #81c784; font-weight: bold; }
    .primary-btn {
      background: linear-gradient(135deg,#b8860b,#c9a227,#b8860b);
      border: none; border-radius: 50px; padding: 13px; font-size: 1rem;
      font-family: 'Georgia',serif; color: #1a0d04; cursor: pointer; font-weight: bold;
      box-shadow: 0 4px 20px rgba(200,160,0,.4); transition: all .2s;
    }
    .primary-btn:hover:not(:disabled) { transform: translateY(-2px); }
    .primary-btn:disabled { opacity: .5; cursor: not-allowed; }
    .secondary-btn {
      background: transparent; border: 1px solid rgba(200,160,40,.35); border-radius: 50px; padding: 10px;
      color: rgba(200,185,140,.75); cursor: pointer; font-family: 'Georgia',serif; font-size: .88rem;
      transition: all .18s;
    }
    .secondary-btn:hover { border-color: rgba(200,160,40,.7); color: #f5e8c0; }
    .error { color: #ef5350; font-size: .78rem; background: rgba(239,83,80,.1); border-radius: 6px; padding: 8px 12px; }
    .player-colors { display: flex; gap: 6px; margin-bottom: 8px; }
  `]
})
export class LobbyComponent implements OnInit, OnDestroy {
  @Output() back      = new EventEmitter<void>();
  @Output() gameReady = new EventEmitter<void>();

  readonly mp   = inject(MultiplayerService);
  readonly auth = inject(AuthService);

  tab         = signal<LobbyTab>('browse');
  newRoomName = '';
  error       = signal('');

  private subs = new Subscription();
  private autoStartTimer: ReturnType<typeof setInterval> | null = null;

  readonly PLAYER_COLORS = [
    '#1a237e','#b71c1c','#7b1fa2','#1b5e20','#e65100','#006064','#880e4f','#004d40'
  ];

  ngOnInit(): void {
    const user = this.auth.user();
    if (!user) return;

    this.mp.connect(user.token);

    this.subs.add(
      this.mp.waveStart$.subscribe(() => this.gameReady.emit())
    );

    // Auto-start when room reaches 8 players (host triggers it)
    this.autoStartTimer = setInterval(() => {
      const room = this.mp.currentRoom();
      if (room && room.players.length >= 8 && this.mp.isHost()) {
        this.startGame();
      }
    }, 500);

    this.refresh();
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.autoStartTimer) clearInterval(this.autoStartTimer);
  }

  switchTab(t: LobbyTab): void {
    this.tab.set(t);
    if (t === 'browse') this.refresh();
  }

  refresh(): void { this.mp.listRooms(); }

  create(): void {
    const name = this.newRoomName.trim() || `${this.auth.user()?.username}'s Room`;
    this.mp.createRoom(name);
  }

  join(roomId: string): void { this.mp.joinRoom(roomId); }

  startGame(): void {
    if ((this.mp.currentRoom()?.players.length ?? 0) < 1) return;
    this.mp.startGame();
  }

  leaveRoom(): void { this.mp.leaveRoom(); this.tab.set('browse'); this.refresh(); }

  playerColor(idx: number): string {
    return this.PLAYER_COLORS[idx % this.PLAYER_COLORS.length];
  }
}
