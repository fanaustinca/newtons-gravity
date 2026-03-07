import { Component, Output, EventEmitter, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-main-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="menu-overlay">
      <div class="menu-card">
        <div class="title-area">
          <div class="apple-icon">🍎</div>
          <h1 class="game-title">Newton's<br><span class="sub">Gravity</span></h1>
          <p class="tagline">"What goes up, must come down." <em>— Isaac Newton</em></p>
        </div>

        <div class="user-bar">
          <span class="greeting">Playing as <strong>{{ auth.user()?.username }}</strong></span>
          @if (auth.user()?.isAnonymous) {
            <span class="anon-tag">Guest</span>
          }
        </div>

        <div class="mode-buttons">
          <button class="mode-btn solo" (click)="playSolo.emit()">
            <span class="mode-icon">🌳</span>
            <span class="mode-label">Solo</span>
            <span class="mode-desc">Catch apples, dodge anvils, upgrade Newton</span>
          </button>
          <button class="mode-btn multi" (click)="playMulti.emit()">
            <span class="mode-icon">⚔️</span>
            <span class="mode-label">Multiplayer</span>
            <span class="mode-desc">Compete with others for highest IQ</span>
          </button>
        </div>

        <div class="controls-hint">
          <span>🖱️ Click to lock camera &nbsp;·&nbsp; WASD / ↑↓←→ to move</span>
        </div>

        <div class="leaderboard">
          <div class="lb-title">🏆 Leaderboard</div>
          @if (leaderboard().length === 0) {
            <div class="lb-empty">No scores yet. Be the first!</div>
          }
          @for (entry of leaderboard(); track entry.username; let i = $index) {
            <div class="lb-row">
              <span class="lb-rank">#{{ i + 1 }}</span>
              <span class="lb-name">{{ entry.username }}</span>
              <span class="lb-iq">{{ entry.totalIq }} IQ</span>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .menu-overlay {
      position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
      background: rgba(10,5,0,.75); backdrop-filter: blur(5px);
    }
    .menu-card {
      background: linear-gradient(160deg,#2a1a08,#1a0d04);
      border: 1px solid rgba(200,160,40,.4); border-radius: 18px;
      padding: 40px 48px; max-width: 460px; width: calc(100% - 32px);
      box-shadow: 0 8px 48px rgba(0,0,0,.7); text-align: center;
    }
    .apple-icon { font-size: 3rem; margin-bottom: 8px; }
    .game-title { font-size: 2.4rem; font-family: 'Georgia',serif; color: #f5e8c0; line-height: 1.1; margin-bottom: 8px; }
    .sub { color: #c9a227; font-style: italic; }
    .tagline { color: rgba(200,185,140,.65); font-size: .78rem; font-style: italic; margin-bottom: 22px; }
    .user-bar { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px; }
    .greeting { color: rgba(200,185,140,.8); font-size: .82rem; }
    .anon-tag { font-size: .65rem; color: rgba(200,185,140,.55); background: rgba(255,255,255,.07); border-radius: 10px; padding: 2px 8px; }
    .mode-buttons { display: flex; flex-direction: column; gap: 12px; margin-bottom: 22px; }
    .mode-btn {
      display: flex; align-items: center; gap: 14px; text-align: left;
      background: rgba(0,0,0,.35); border: 1px solid rgba(200,160,40,.2); border-radius: 12px;
      padding: 16px 20px; cursor: pointer; transition: all .18s; color: inherit;
    }
    .mode-btn:hover { background: rgba(200,160,0,.1); border-color: rgba(200,160,40,.5); transform: translateX(3px); }
    .mode-btn.multi:hover { border-color: rgba(180,30,30,.5); background: rgba(180,30,30,.08); }
    .mode-icon { font-size: 1.8rem; flex-shrink: 0; }
    .mode-label { display: block; font-size: 1rem; font-weight: bold; color: #f0e0c0; margin-bottom: 2px; }
    .mode-desc { display: block; font-size: .72rem; color: rgba(200,185,140,.6); font-style: italic; }
    .controls-hint { font-size: .68rem; color: rgba(200,185,140,.4); margin-bottom: 18px; }
    .leaderboard { border-top: 1px solid rgba(200,160,40,.15); padding-top: 14px; }
    .lb-title { font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: #c9a227; margin-bottom: 8px; }
    .lb-empty { font-size: .75rem; color: rgba(200,185,140,.4); font-style: italic; }
    .lb-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
    .lb-row:last-child { border-bottom: none; }
    .lb-rank { width: 24px; font-size: .72rem; color: rgba(200,185,140,.5); text-align: right; flex-shrink: 0; }
    .lb-name { flex: 1; font-size: .82rem; color: #f0e0c0; text-align: left; }
    .lb-iq { font-size: .82rem; color: #f5c842; font-family: 'Georgia',serif; }
  `]
})
export class MainMenuComponent implements OnInit {
  @Output() playSolo  = new EventEmitter<void>();
  @Output() playMulti = new EventEmitter<void>();

  readonly auth = inject(AuthService);
  readonly leaderboard = signal<{ username: string; totalIq: number }[]>([]);

  ngOnInit(): void {
    this.auth.fetchLeaderboard().then(data => this.leaderboard.set(data));
  }
}
