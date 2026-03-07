import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="menu-overlay">
      <div class="menu-card">
        <div class="title-area">
          <div class="apple-icon">🍎</div>
          <h1 class="game-title">Newton's<br><span class="subtitle">Gravity</span></h1>
          <p class="tagline">
            "What goes up, must come down."<br>
            <em>— Isaac Newton (probably)</em>
          </p>
        </div>

        <div class="instructions">
          <div class="inst-row">
            <span class="inst-icon">🍎</span>
            <span>Walk into falling apples to gain IQ</span>
          </div>
          <div class="inst-row">
            <span class="inst-icon">⚒️</span>
            <span>Dodge anvils — they are lethal</span>
          </div>
          <div class="inst-row">
            <span class="inst-icon">⬆️</span>
            <span>Spend IQ between waves on upgrades</span>
          </div>
          <div class="inst-row">
            <span class="inst-icon">⌨️</span>
            <span>Arrow keys / WASD or touch to move</span>
          </div>
        </div>

        <button class="play-btn" (click)="play.emit()">
          <span>Begin Experiment</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .menu-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(10, 5, 0, 0.72);
      backdrop-filter: blur(4px);
    }
    .menu-card {
      background: linear-gradient(160deg, #2a1a08 0%, #1a0d04 100%);
      border: 1px solid rgba(200, 160, 40, 0.4);
      border-radius: 16px;
      padding: 40px 48px;
      max-width: 480px;
      width: calc(100% - 40px);
      box-shadow: 0 8px 48px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,220,100,0.1);
      text-align: center;
    }
    .title-area { margin-bottom: 28px; }
    .apple-icon {
      font-size: 3.5rem;
      margin-bottom: 10px;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
    }
    .game-title {
      font-size: 2.6rem;
      font-family: 'Georgia', serif;
      color: #f5e8c0;
      line-height: 1.1;
      margin-bottom: 10px;
      text-shadow: 0 2px 16px rgba(200,140,0,0.4);
    }
    .subtitle {
      color: #c9a227;
      font-style: italic;
    }
    .tagline {
      color: rgba(200, 185, 140, 0.75);
      font-size: 0.8rem;
      font-style: italic;
      line-height: 1.5;
    }
    .instructions {
      background: rgba(0,0,0,0.3);
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 28px;
      text-align: left;
    }
    .inst-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      color: rgba(240, 225, 190, 0.85);
      font-size: 0.82rem;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .inst-row:last-child { border-bottom: none; }
    .inst-icon { font-size: 1.1rem; flex-shrink: 0; width: 24px; text-align: center; }
    .play-btn {
      background: linear-gradient(135deg, #b8860b 0%, #c9a227 50%, #b8860b 100%);
      border: none;
      border-radius: 50px;
      padding: 14px 48px;
      font-size: 1.1rem;
      font-family: 'Georgia', serif;
      color: #1a0d04;
      cursor: pointer;
      font-weight: bold;
      letter-spacing: 0.05em;
      box-shadow: 0 4px 20px rgba(200,160,0,0.4);
      transition: all 0.2s ease;
    }
    .play-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 28px rgba(200,160,0,0.6);
    }
    .play-btn:active { transform: translateY(0); }
  `]
})
export class MenuComponent {
  @Output() play = new EventEmitter<void>();
}
