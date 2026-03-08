import { Injectable, signal, computed } from '@angular/core';

export type GameStatus = 'menu' | 'playing' | 'dead' | 'upgrade';

export interface UpgradeState {
  iqMultiplierLevel: number;  // 0-4: each level gives +50% IQ per apple
  healthLevel: number;        // 0-3: each level gives +1 max health
  speedLevel: number;         // 0-3: each level gives +25% move speed
  magnetLevel: number;        // 0-2: apples attracted toward Newton
  sprintLevel: number;        // 0-3: longer stamina, faster sprint, shorter cooldown
}

export interface UpgradeDef {
  id: keyof UpgradeState;
  name: string;
  description: string;
  maxLevel: number;
  costs: number[];
  icon: string;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'iqMultiplierLevel',
    name: 'Cognitive Enhancement',
    description: '+50% IQ per apple per level',
    maxLevel: 4,
    costs: [50, 100, 200, 400],
    icon: '🧠'
  },
  {
    id: 'healthLevel',
    name: 'Fortitude',
    description: '+1 max health (survives one more anvil)',
    maxLevel: 3,
    costs: [150, 300, 600],
    icon: '❤️'
  },
  {
    id: 'speedLevel',
    name: 'Agility',
    description: '+25% movement speed per level',
    maxLevel: 3,
    costs: [75, 150, 300],
    icon: '👟'
  },
  {
    id: 'magnetLevel',
    name: 'Gravity Affinity',
    description: 'Apples are attracted toward Newton',
    maxLevel: 2,
    costs: [200, 500],
    icon: '🧲'
  },
  {
    id: 'sprintLevel',
    name: 'Explosive Sprint',
    description: 'Longer stamina · faster speed · shorter cooldown',
    maxLevel: 3,
    costs: [100, 250, 500],
    icon: '💨'
  }
];

@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly _status = signal<GameStatus>('menu');
  private readonly _iq = signal(0);
  private readonly _health = signal(3);
  private readonly _maxHealth = signal(3);
  private readonly _wave = signal(1);
  private readonly _totalIqEarned = signal(0);
  private readonly _waveIqEarned = signal(0);
  private readonly _upgrades = signal<UpgradeState>({
    iqMultiplierLevel: 0,
    healthLevel: 0,
    speedLevel: 0,
    magnetLevel: 0,
    sprintLevel: 0,
  });
  private readonly _sprintStamina = signal(1.0);
  private readonly _sprintOnCooldown = signal(false);

  readonly status = this._status.asReadonly();
  readonly iq = this._iq.asReadonly();
  readonly health = this._health.asReadonly();
  readonly maxHealth = this._maxHealth.asReadonly();
  readonly wave = this._wave.asReadonly();
  readonly totalIqEarned = this._totalIqEarned.asReadonly();
  readonly waveIqEarned = this._waveIqEarned.asReadonly();
  readonly upgrades = this._upgrades.asReadonly();
  readonly sprintStamina = this._sprintStamina.asReadonly();
  readonly sprintOnCooldown = this._sprintOnCooldown.asReadonly();

  readonly healthPercent = computed(() => this._health() / this._maxHealth());
  readonly iqPerApple      = computed(() => 10 * (1 + this._upgrades().iqMultiplierLevel * 0.5));
  readonly iqPerSuperApple = computed(() => 50 * (1 + this._upgrades().iqMultiplierLevel * 0.5));
  readonly moveSpeedMultiplier = computed(() => 1 + this._upgrades().speedLevel * 0.25);
  readonly magnetRadius = computed(() => {
    const level = this._upgrades().magnetLevel;
    return level === 0 ? 0 : level === 1 ? 1.8 : 3.2;
  });
  readonly sprintDuration = computed(() => [2, 3, 4.5, 6][this._upgrades().sprintLevel]);
  readonly sprintSpeedMultiplier = computed(() => [1.7, 1.9, 2.1, 2.4][this._upgrades().sprintLevel]);
  readonly sprintCooldownDuration = computed(() => [5, 4, 3, 2][this._upgrades().sprintLevel]);

  setSprintState(stamina: number, onCooldown: boolean): void {
    this._sprintStamina.set(stamina);
    this._sprintOnCooldown.set(onCooldown);
  }

  startGame(): void {
    this._status.set('playing');
    this._iq.set(0);
    this._health.set(3);
    this._maxHealth.set(3);
    this._wave.set(1);
    this._totalIqEarned.set(0);
    this._waveIqEarned.set(0);
    this._upgrades.set({
      iqMultiplierLevel: 0,
      healthLevel: 0,
      speedLevel: 0,
      magnetLevel: 0,
      sprintLevel: 0,
    });
    this._sprintStamina.set(1.0);
    this._sprintOnCooldown.set(false);
  }

  collectApple(): void {
    const gained = this.iqPerApple();
    this._iq.update(v => v + gained);
    this._totalIqEarned.update(v => v + gained);
    this._waveIqEarned.update(v => v + gained);
  }

  collectSuperApple(): void {
    const gained = this.iqPerSuperApple();
    this._iq.update(v => v + gained);
    this._totalIqEarned.update(v => v + gained);
    this._waveIqEarned.update(v => v + gained);
  }

  doubleIq(): void {
    const gained = this._iq(); // amount gained = current value (it doubles)
    this._iq.update(v => v * 2);
    this._totalIqEarned.update(v => v + gained);
    this._waveIqEarned.update(v => v + gained);
  }

  hitByAnvil(): void {
    const newHealth = this._health() - 1;
    this._health.set(newHealth);
    if (newHealth <= 0) {
      this._status.set('dead');
    }
  }

  endWave(): void {
    this._status.set('upgrade');
  }

  startNextWave(): void {
    this._wave.update(v => v + 1);
    this._waveIqEarned.set(0);
    this._status.set('playing');
  }

  applyUpgrade(id: keyof UpgradeState): boolean {
    const upgrades = this._upgrades();
    const def = UPGRADES.find(u => u.id === id);
    if (!def) return false;

    const currentLevel = upgrades[id];
    if (currentLevel >= def.maxLevel) return false;

    const cost = def.costs[currentLevel];
    if (this._iq() < cost) return false;

    this._iq.update(v => v - cost);
    this._upgrades.update(u => ({ ...u, [id]: u[id] + 1 }));

    // Apply health upgrade immediately
    if (id === 'healthLevel') {
      this._maxHealth.update(v => v + 1);
      this._health.update(v => v + 1);
    }

    return true;
  }

  restoreHealth(): void {
    this._health.set(this._maxHealth());
  }

  /** Multiplayer anvil: deduct IQ instead of health */
  hitByAnvilMultiplayer(): void {
    this._iq.update(v => Math.max(0, v - 25));
  }

  /** Set IQ directly (used for server score reconciliation in multiplayer) */
  setIq(iq: number): void {
    this._iq.set(Math.max(0, iq));
  }
}
