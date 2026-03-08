import { Component, Output, EventEmitter, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../game/game-state.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-game-over',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="over-overlay">
      <div class="over-card">
        <div class="anvil-icon">⚒️</div>
        <h2 class="over-title">Newton Has Fallen</h2>
        <p class="over-quote">"For every action there is an equal and opposite reaction."</p>

        <div class="stats">
          <div class="stat-row">
            <span class="stat-label">Final IQ</span>
            <span class="stat-value iq">{{ gs.iq() }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Wave Reached</span>
            <span class="stat-value wave">{{ gs.wave() }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Total IQ Earned</span>
            <span class="stat-value">{{ gs.totalIqEarned() }}</span>
          </div>
        </div>

        <div class="upgrade-recap">
          <span class="recap-title">Upgrades Achieved</span>
          <div class="recap-grid">
            <div class="recap-item" [class.achieved]="gs.upgrades().iqMultiplierLevel > 0">
              🧠 Cognitive Lv.{{ gs.upgrades().iqMultiplierLevel }}
            </div>
            <div class="recap-item" [class.achieved]="gs.upgrades().healthLevel > 0">
              ❤️ Fortitude Lv.{{ gs.upgrades().healthLevel }}
            </div>
            <div class="recap-item" [class.achieved]="gs.upgrades().speedLevel > 0">
              👟 Agility Lv.{{ gs.upgrades().speedLevel }}
            </div>
            <div class="recap-item" [class.achieved]="gs.upgrades().magnetLevel > 0">
              🧲 Gravity Lv.{{ gs.upgrades().magnetLevel }}
            </div>
          </div>
        </div>

        <div class="action-row">
          <button class="restart-btn" (click)="onRestart()">Try Again</button>
          <button class="menu-btn" (click)="exitToMenu.emit()">Main Menu ({{ countdown() }})</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .over-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(10, 0, 0, 0.82);
      backdrop-filter: blur(5px);
    }
    .over-card {
      background: linear-gradient(160deg, #2a0808 0%, #1a0404 100%);
      border: 1px solid rgba(180, 40, 40, 0.4);
      border-radius: 16px;
      padding: 36px 44px;
      max-width: 460px;
      width: calc(100% - 32px);
      text-align: center;
      box-shadow: 0 8px 48px rgba(0,0,0,0.8), 0 0 60px rgba(140,0,0,0.2);
    }
    .anvil-icon {
      font-size: 3.5rem;
      margin-bottom: 12px;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.7));
    }
    .over-title {
      font-size: 2rem;
      font-family: 'Georgia', serif;
      color: #f0c0c0;
      margin-bottom: 8px;
      text-shadow: 0 2px 12px rgba(200,0,0,0.4);
    }
    .over-quote {
      color: rgba(200, 160, 160, 0.6);
      font-style: italic;
      font-size: 0.78rem;
      margin-bottom: 24px;
    }
    .stats {
      background: rgba(0,0,0,0.35);
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 18px;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label {
      color: rgba(200,170,170,0.7);
      font-size: 0.82rem;
    }
    .stat-value {
      font-size: 1.2rem;
      font-family: 'Georgia', serif;
      color: #e8d0d0;
      font-weight: bold;
    }
    .stat-value.iq { color: #f5c842; }
    .stat-value.wave { color: #90caf9; }
    .upgrade-recap {
      margin-bottom: 24px;
    }
    .recap-title {
      display: block;
      font-size: 0.68rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: rgba(200,160,160,0.5);
      margin-bottom: 10px;
    }
    .recap-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .recap-item {
      background: rgba(0,0,0,0.3);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 0.72rem;
      color: rgba(200,160,160,0.4);
    }
    .recap-item.achieved {
      color: rgba(220,200,180,0.85);
      border-color: rgba(200,160,40,0.25);
    }
    .action-row {
      display: flex; gap: 10px;
    }
    .restart-btn {
      flex: 1;
      background: linear-gradient(135deg, #8b2020 0%, #c04040 50%, #8b2020 100%);
      border: none;
      border-radius: 50px;
      padding: 14px 24px;
      font-size: 1.05rem;
      font-family: 'Georgia', serif;
      color: #f5e0e0;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 4px 20px rgba(160,0,0,0.5);
      transition: all 0.2s ease;
    }
    .restart-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(160,0,0,0.7);
    }
    .menu-btn {
      flex: 1;
      background: transparent;
      border: 1px solid rgba(200,160,40,.35);
      border-radius: 50px;
      padding: 14px 24px;
      font-size: 1rem;
      font-family: 'Georgia', serif;
      color: rgba(200,185,140,.75);
      cursor: pointer;
      transition: all .18s;
    }
    .menu-btn:hover { border-color: rgba(200,160,40,.7); color: #f5e8c0; }
  `]
})
export class GameOverComponent implements OnInit, OnDestroy {
  @Output() restart     = new EventEmitter<void>();
  @Output() exitToMenu  = new EventEmitter<void>();
  readonly gs = inject(GameStateService);

  readonly countdown = signal(5);
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.timer = setInterval(() => {
      const next = this.countdown() - 1;
      this.countdown.set(next);
      if (next <= 0) this.exitToMenu.emit();
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  onRestart(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.restart.emit();
  }
}
