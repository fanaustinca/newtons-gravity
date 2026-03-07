import { Component, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

type LoginTab = 'guest' | 'login' | 'register';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-overlay">
      <div class="login-card">
        <div class="title-area">
          <div class="apple-icon">🍎</div>
          <h1 class="game-title">Newton's<br><span class="sub">Gravity</span></h1>
        </div>

        <div class="tabs">
          <button class="tab" [class.active]="tab() === 'guest'"    (click)="tab.set('guest')">Play as Guest</button>
          <button class="tab" [class.active]="tab() === 'login'"    (click)="tab.set('login')">Login</button>
          <button class="tab" [class.active]="tab() === 'register'" (click)="tab.set('register')">Register</button>
        </div>

        @if (tab() === 'guest') {
          <div class="form-area">
            <p class="hint">Play anonymously — your account disappears when you close the tab.</p>
            <input class="field" [(ngModel)]="guestName" placeholder="Your name (optional)" maxlength="20" />
            <button class="primary-btn" (click)="playAsGuest()">Start Playing</button>
          </div>
        }

        @if (tab() === 'login') {
          <div class="form-area">
            <input class="field" [(ngModel)]="username" placeholder="Username" autocomplete="username" />
            <input class="field" [(ngModel)]="password" type="password" placeholder="Password" autocomplete="current-password" />
            @if (error()) { <div class="error">{{ error() }}</div> }
            <button class="primary-btn" [disabled]="loading()" (click)="doLogin()">
              {{ loading() ? 'Logging in…' : 'Login' }}
            </button>
          </div>
        }

        @if (tab() === 'register') {
          <div class="form-area">
            <p class="hint">Create a permanent account to keep scores across sessions.</p>
            <input class="field" [(ngModel)]="username" placeholder="Username (min 2 chars)" autocomplete="username" />
            <input class="field" [(ngModel)]="password" type="password" placeholder="Password (min 4 chars)" autocomplete="new-password" />
            @if (error()) { <div class="error">{{ error() }}</div> }
            <button class="primary-btn" [disabled]="loading()" (click)="doRegister()">
              {{ loading() ? 'Creating account…' : 'Create Account' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .login-overlay {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(160deg, #1a0800 0%, #0a0400 100%);
    }
    .login-card {
      background: linear-gradient(160deg, #2a1a08, #1a0d04);
      border: 1px solid rgba(200,160,40,.4);
      border-radius: 18px;
      padding: 40px 48px;
      max-width: 420px; width: calc(100% - 32px);
      box-shadow: 0 8px 48px rgba(0,0,0,.7);
      text-align: center;
    }
    .apple-icon { font-size: 3rem; margin-bottom: 8px; }
    .game-title {
      font-size: 2.4rem; font-family: 'Georgia',serif; color: #f5e8c0;
      line-height: 1.1; margin-bottom: 28px;
    }
    .sub { color: #c9a227; font-style: italic; }
    .tabs { display: flex; gap: 4px; margin-bottom: 24px; background: rgba(0,0,0,.3); border-radius: 10px; padding: 4px; }
    .tab {
      flex: 1; padding: 8px 4px; border: none; border-radius: 8px; cursor: pointer;
      background: transparent; color: rgba(200,185,140,.65); font-size: .78rem; font-family: 'Georgia',serif;
      transition: all .18s;
    }
    .tab.active { background: rgba(200,160,40,.2); color: #f5c842; }
    .form-area { display: flex; flex-direction: column; gap: 12px; }
    .hint { color: rgba(200,185,140,.7); font-size: .78rem; font-style: italic; margin-bottom: 4px; }
    .field {
      background: rgba(0,0,0,.4); border: 1px solid rgba(200,160,40,.25); border-radius: 8px;
      padding: 11px 14px; color: #f0e0c0; font-size: .9rem; font-family: 'Georgia',serif;
      outline: none; transition: border-color .18s;
    }
    .field:focus { border-color: rgba(200,160,40,.6); }
    .field::placeholder { color: rgba(200,180,130,.4); }
    .error { color: #ef5350; font-size: .78rem; background: rgba(239,83,80,.1); border-radius: 6px; padding: 8px 12px; }
    .primary-btn {
      background: linear-gradient(135deg,#b8860b,#c9a227,#b8860b);
      border: none; border-radius: 50px; padding: 13px; font-size: 1rem;
      font-family: 'Georgia',serif; color: #1a0d04; cursor: pointer; font-weight: bold;
      box-shadow: 0 4px 20px rgba(200,160,0,.4); transition: all .2s;
      margin-top: 4px;
    }
    .primary-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(200,160,0,.6); }
    .primary-btn:disabled { opacity: .55; cursor: not-allowed; }
  `]
})
export class LoginComponent {
  @Output() done = new EventEmitter<void>();

  private auth = inject(AuthService);

  tab      = signal<LoginTab>('guest');
  guestName = '';
  username  = '';
  password  = '';
  loading  = signal(false);
  error    = signal('');

  playAsGuest(): void {
    this.auth.setGuestUser(this.guestName || 'Newton');
    this.done.emit();
  }

  async doLogin(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.login(this.username.trim(), this.password);
      this.done.emit();
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Login failed.');
    } finally {
      this.loading.set(false);
    }
  }

  async doRegister(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.register(this.username.trim(), this.password);
      this.done.emit();
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      this.loading.set(false);
    }
  }
}
