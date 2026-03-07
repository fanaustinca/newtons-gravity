import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MultiplayerService } from '../../services/multiplayer.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-scoreboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="scoreboard">
      <div class="sb-title">IQ Race · Wave {{ mp.currentRoom()?.wave }}</div>
      @for (entry of sortedScores(); track entry.socketId) {
        <div class="sb-row" [class.me]="entry.socketId === mp.mySocketId()">
          <span class="sb-rank">{{ $index + 1 }}</span>
          <span class="sb-name">{{ mp.getPlayerName(entry.socketId) }}</span>
          <span class="sb-iq">{{ entry.iq }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .scoreboard {
      position: absolute;
      top: 70px; right: 14px;
      background: rgba(10,5,0,.72);
      border: 1px solid rgba(200,160,40,.3);
      border-radius: 10px;
      padding: 10px 14px;
      min-width: 170px;
      pointer-events: none;
    }
    .sb-title {
      font-size: .62rem; letter-spacing: .15em; text-transform: uppercase;
      color: rgba(200,180,130,.6); margin-bottom: 8px;
    }
    .sb-row {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.05);
      font-size: .8rem; color: rgba(200,185,140,.8);
    }
    .sb-row:last-child { border-bottom: none; }
    .sb-row.me { color: #f5c842; }
    .sb-rank { width: 16px; flex-shrink: 0; font-size: .7rem; color: rgba(200,160,40,.5); }
    .sb-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sb-iq { font-family: 'Georgia',serif; font-weight: bold; font-size: .88rem; }
  `]
})
export class ScoreboardComponent {
  readonly mp   = inject(MultiplayerService);
  readonly auth = inject(AuthService);

  sortedScores(): Array<{ socketId: string; iq: number }> {
    return [...this.mp.scores().entries()]
      .map(([socketId, iq]) => ({ socketId, iq }))
      .sort((a, b) => b.iq - a.iq);
  }
}
