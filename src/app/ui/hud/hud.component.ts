import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameStateService } from '../../game/game-state.service';
import { AppStateService } from '../../services/app-state.service';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hud">
      <!-- IQ Counter -->
      <div class="hud-block iq-block">
        <span class="hud-label">IQ</span>
        <span class="hud-value iq-value">{{ gs.iq() }}</span>
        <span class="hud-sub">+{{ gs.iqPerApple() | number:'1.0-0' }} / apple</span>
      </div>

      <!-- Wave -->
      <div class="hud-block wave-block">
        <span class="hud-label">WAVE</span>
        <span class="hud-value wave-value">{{ gs.wave() }}</span>
      </div>

      <!-- Health (solo only) -->
      @if (appState.gameMode() !== 'multi') {
        <div class="hud-block health-block">
          <span class="hud-label">VITALITY</span>
          <div class="hearts">
            @for (_ of heartArray(); track $index) {
              <span class="heart full">♥</span>
            }
            @for (_ of emptyHeartArray(); track $index) {
              <span class="heart empty">♡</span>
            }
          </div>
        </div>
      }

      <!-- Sprint -->
      <div class="hud-block sprint-block">
        <span class="hud-label">{{ gs.sprintOnCooldown() ? 'COOLDOWN' : 'SPRINT' }}</span>
        <div class="stamina-bar">
          <div class="stamina-fill"
               [class.cooldown]="gs.sprintOnCooldown()"
               [style.width.%]="gs.sprintStamina() * 100">
          </div>
        </div>
        <span class="hud-sub">SHIFT to sprint</span>
      </div>
    </div>
  `,
  styles: [`
    .hud {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 14px 20px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%);
      pointer-events: none;
    }
    .hud-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .hud-label {
      font-size: 0.6rem;
      letter-spacing: 0.2em;
      color: rgba(255,240,180,0.7);
      font-family: 'Georgia', serif;
      text-transform: uppercase;
    }
    .hud-value {
      font-size: 1.8rem;
      font-weight: bold;
      font-family: 'Georgia', serif;
      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
      line-height: 1;
    }
    .hud-sub {
      font-size: 0.58rem;
      color: rgba(255,240,180,0.55);
      font-style: italic;
    }
    .iq-value { color: #f5c842; }
    .wave-value { color: #e0d0a0; }
    .hearts {
      display: flex;
      gap: 3px;
      margin-top: 2px;
    }
    .heart {
      font-size: 1.3rem;
      text-shadow: 0 1px 4px rgba(0,0,0,0.6);
      line-height: 1;
    }
    .heart.full { color: #e83030; }
    .heart.empty { color: rgba(200,60,60,0.3); }
    .sprint-block { min-width: 80px; margin-top: 38px; }
    .stamina-bar {
      width: 80px; height: 8px;
      background: rgba(255,255,255,0.15);
      border-radius: 4px; overflow: hidden;
      margin-top: 4px;
    }
    .stamina-fill {
      height: 100%; border-radius: 4px;
      background: #4fc3f7;
      transition: width 0.1s linear, background 0.2s;
    }
    .stamina-fill.cooldown { background: #ef5350; }
  `]
})
export class HudComponent {
  readonly gs = inject(GameStateService);
  readonly appState = inject(AppStateService);

  heartArray(): number[] {
    return Array(this.gs.health());
  }

  emptyHeartArray(): number[] {
    return Array(Math.max(0, this.gs.maxHealth() - this.gs.health()));
  }
}
