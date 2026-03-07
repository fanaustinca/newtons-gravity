import { Component, Output, EventEmitter, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService, UPGRADES, UpgradeDef, UpgradeState } from '../../game/game-state.service';
import { AppStateService } from '../../services/app-state.service';

@Component({
  selector: 'app-upgrade',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upgrade-overlay">
      <div class="upgrade-card">
        <div class="wave-complete">
          <span class="wave-badge">Wave {{ gs.wave() }} Complete!</span>
        </div>

        <h2 class="upgrade-title">Invest Your IQ</h2>

        <div class="iq-display">
          <span class="iq-label">Available IQ:</span>
          <span class="iq-amount">{{ gs.iq() }}</span>
        </div>

        <div class="upgrade-grid">
          @for (upg of upgrades; track upg.id) {
            <div
              class="upgrade-card-item"
              [class.maxed]="isMaxed(upg)"
              [class.affordable]="canAfford(upg)"
              (click)="buy(upg)">
              <div class="upg-icon">{{ upg.icon }}</div>
              <div class="upg-info">
                <div class="upg-name">{{ upg.name }}</div>
                <div class="upg-desc">{{ upg.description }}</div>
                <div class="upg-level">
                  @for (_ of levelArray(upg.maxLevel); track $index) {
                    <span class="dot" [class.filled]="$index < currentLevel(upg)"></span>
                  }
                </div>
              </div>
              <div class="upg-cost">
                @if (isMaxed(upg)) {
                  <span class="maxed-label">MAX</span>
                } @else {
                  <span class="cost-amount">{{ nextCost(upg) }}</span>
                  <span class="cost-label">IQ</span>
                }
              </div>
            </div>
          }
        </div>

        @if (appState.gameMode() === 'multi') {
          <div class="countdown-bar">
            <div class="countdown-fill" [style.width.%]="(countdown / 15) * 100"></div>
          </div>
          <div class="countdown-label">Next wave in {{ countdown }}s…</div>
        } @else {
          <button class="next-wave-btn" (click)="nextWave.emit()">
            Begin Wave {{ gs.wave() + 1 }} →
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .upgrade-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(10, 5, 0, 0.8);
      backdrop-filter: blur(5px);
    }
    .upgrade-card {
      background: linear-gradient(160deg, #2a1a08 0%, #1a0d04 100%);
      border: 1px solid rgba(200, 160, 40, 0.4);
      border-radius: 16px;
      padding: 30px 36px;
      max-width: 520px;
      width: calc(100% - 32px);
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 8px 48px rgba(0,0,0,0.7);
    }
    .wave-complete { text-align: center; margin-bottom: 6px; }
    .wave-badge {
      display: inline-block;
      background: linear-gradient(135deg, #c9a227, #f5e0a0);
      color: #1a0d04;
      padding: 4px 16px;
      border-radius: 20px;
      font-size: 0.78rem;
      font-weight: bold;
      letter-spacing: 0.1em;
    }
    .upgrade-title {
      text-align: center;
      font-size: 1.8rem;
      font-family: 'Georgia', serif;
      color: #f5e8c0;
      margin-bottom: 12px;
    }
    .iq-display {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      margin-bottom: 22px;
    }
    .iq-label {
      color: rgba(200,185,140,0.8);
      font-size: 0.9rem;
    }
    .iq-amount {
      font-size: 2rem;
      color: #f5c842;
      font-family: 'Georgia', serif;
      font-weight: bold;
    }
    .upgrade-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 24px;
    }
    .upgrade-card-item {
      display: flex;
      align-items: center;
      gap: 14px;
      background: rgba(0,0,0,0.35);
      border: 1px solid rgba(200,160,40,0.15);
      border-radius: 10px;
      padding: 12px 16px;
      cursor: pointer;
      transition: all 0.18s ease;
      opacity: 0.55;
    }
    .upgrade-card-item.affordable {
      opacity: 1;
      border-color: rgba(200,160,40,0.35);
    }
    .upgrade-card-item.affordable:hover {
      background: rgba(200,160,0,0.12);
      transform: translateX(3px);
      border-color: rgba(200,160,40,0.65);
    }
    .upgrade-card-item.maxed {
      opacity: 0.8;
      border-color: rgba(100,200,100,0.3);
      cursor: default;
    }
    .upg-icon { font-size: 1.8rem; flex-shrink: 0; }
    .upg-info { flex: 1; min-width: 0; }
    .upg-name {
      font-size: 0.92rem;
      font-weight: bold;
      color: #f0e0c0;
      margin-bottom: 2px;
    }
    .upg-desc {
      font-size: 0.72rem;
      color: rgba(200,185,140,0.7);
      font-style: italic;
    }
    .upg-level {
      display: flex;
      gap: 4px;
      margin-top: 6px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: rgba(200,160,40,0.2);
      border: 1px solid rgba(200,160,40,0.4);
    }
    .dot.filled {
      background: #c9a227;
      border-color: #f5e0a0;
    }
    .upg-cost {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
    }
    .cost-amount {
      font-size: 1.25rem;
      font-weight: bold;
      color: #f5c842;
      line-height: 1;
    }
    .cost-label {
      font-size: 0.62rem;
      color: rgba(200,185,140,0.6);
      letter-spacing: 0.1em;
    }
    .maxed-label {
      font-size: 0.72rem;
      color: #4caf50;
      font-weight: bold;
      letter-spacing: 0.08em;
    }
    .next-wave-btn {
      width: 100%;
      background: linear-gradient(135deg, #b8860b 0%, #c9a227 50%, #b8860b 100%);
      border: none;
      border-radius: 50px;
      padding: 14px;
      font-size: 1.05rem;
      font-family: 'Georgia', serif;
      color: #1a0d04;
      cursor: pointer;
      font-weight: bold;
      box-shadow: 0 4px 20px rgba(200,160,0,0.4);
      transition: all 0.2s ease;
    }
    .next-wave-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(200,160,0,0.6);
    }
    .countdown-bar {
      width: 100%; height: 6px; background: rgba(255,255,255,0.1);
      border-radius: 3px; overflow: hidden; margin-bottom: 8px;
    }
    .countdown-fill {
      height: 100%; background: #c9a227;
      border-radius: 3px; transition: width 1s linear;
    }
    .countdown-label {
      text-align: center; color: rgba(200,185,140,0.8);
      font-size: 0.85rem; font-style: italic;
    }
  `]
})
export class UpgradeComponent implements OnInit, OnDestroy {
  @Output() nextWave = new EventEmitter<void>();

  readonly gs = inject(GameStateService);
  readonly appState = inject(AppStateService);
  readonly upgrades = UPGRADES;

  countdown = 15;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (this.appState.gameMode() === 'multi') {
      this.countdown = 15;
      this.countdownTimer = setInterval(() => {
        this.countdown--;
        if (this.countdown <= 0) {
          this.clearTimer();
          this.nextWave.emit();
        }
      }, 1000);
    }
  }

  ngOnDestroy(): void { this.clearTimer(); }

  private clearTimer(): void {
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
  }

  currentLevel(upg: UpgradeDef): number {
    return this.gs.upgrades()[upg.id as keyof UpgradeState] as number;
  }

  isMaxed(upg: UpgradeDef): boolean {
    return this.currentLevel(upg) >= upg.maxLevel;
  }

  nextCost(upg: UpgradeDef): number {
    const level = this.currentLevel(upg);
    return upg.costs[level] ?? 0;
  }

  canAfford(upg: UpgradeDef): boolean {
    return !this.isMaxed(upg) && this.gs.iq() >= this.nextCost(upg);
  }

  buy(upg: UpgradeDef): void {
    if (!this.canAfford(upg)) return;
    this.gs.applyUpgrade(upg.id as keyof UpgradeState);
  }

  levelArray(max: number): number[] {
    return Array(max);
  }
}
