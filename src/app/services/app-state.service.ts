import { Injectable, signal } from '@angular/core';

export type AppScreen = 'login' | 'main-menu' | 'lobby' | 'game';
export type GameMode  = 'solo' | 'multi';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  readonly screen   = signal<AppScreen>('login');
  readonly gameMode = signal<GameMode>('solo');

  goToLogin():     void { this.screen.set('login'); }
  goToMainMenu():  void { this.screen.set('main-menu'); }
  goToLobby():     void { this.screen.set('lobby'); }
  startSolo():     void { this.gameMode.set('solo');  this.screen.set('game'); }
  startMulti():    void { this.gameMode.set('multi'); this.screen.set('lobby'); }
}
