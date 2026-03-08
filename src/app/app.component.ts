import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppStateService } from './services/app-state.service';
import { AuthService } from './services/auth.service';
import { LoginComponent } from './ui/login/login.component';
import { MainMenuComponent } from './ui/main-menu/main-menu.component';
import { LobbyComponent } from './ui/lobby/lobby.component';
import { GameComponent } from './game/game.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, LoginComponent, MainMenuComponent, LobbyComponent, GameComponent],
  template: `
    @if (appState.screen() === 'login') {
      <app-login (done)="onLoginDone()" />
    }
    @if (appState.screen() === 'main-menu') {
      <app-main-menu (playSolo)="appState.startSolo()" (playMulti)="appState.startMulti()" />
    }
    @if (appState.screen() === 'lobby') {
      <app-lobby (back)="appState.goToMainMenu()" (gameReady)="appState.screen.set('game')" />
    }
    @if (appState.screen() === 'game') {
      <app-game (exitToMenu)="appState.goToMainMenu()" />
    }
  `,
  styles: [`:host { display: block; width: 100%; height: 100%; }`]
})
export class AppComponent implements OnInit {
  readonly appState = inject(AppStateService);
  private readonly auth   = inject(AuthService);

  ngOnInit(): void {
    // Firebase onAuthStateChanged in AuthService handles session restore
    // Check if already signed in after a brief tick
    setTimeout(() => {
      if (this.auth.user()) this.appState.goToMainMenu();
    }, 500);
  }

  onLoginDone(): void {
    this.appState.goToMainMenu();
  }
}
