import { Component, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

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
          <p class="tagline">"What goes up, must come down." <em>— Isaac Newton</em></p>
        </div>

        <button class="google-btn" [disabled]="loading()" (click)="doGoogle()">
          <svg class="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {{ loading() ? 'Signing in…' : 'Sign in with Google' }}
        </button>

        @if (error()) { <div class="error">{{ error() }}</div> }

        <div class="divider"><span>or</span></div>

        <div class="guest-area">
          <p class="hint">Play as guest — progress won't be saved.</p>
          <input class="field" [(ngModel)]="guestName" placeholder="Your name (optional)" maxlength="20" />
          <button class="guest-btn" [disabled]="loading()" (click)="doGuest()">
            {{ loading() ? 'Loading…' : 'Play as Guest' }}
          </button>
        </div>
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
      line-height: 1.1; margin-bottom: 8px;
    }
    .sub { color: #c9a227; font-style: italic; }
    .tagline { color: rgba(200,185,140,.65); font-size: .78rem; font-style: italic; margin-bottom: 28px; }
    .google-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; padding: 13px; border-radius: 50px;
      background: #fff; border: none; cursor: pointer;
      font-size: .95rem; font-weight: 600; color: #3c3c3c;
      box-shadow: 0 2px 12px rgba(0,0,0,.3); transition: all .2s;
    }
    .google-btn:hover:not(:disabled) { box-shadow: 0 4px 20px rgba(0,0,0,.45); transform: translateY(-1px); }
    .google-btn:disabled { opacity: .6; cursor: not-allowed; }
    .google-icon { width: 20px; height: 20px; flex-shrink: 0; }
    .error { color: #ef5350; font-size: .78rem; background: rgba(239,83,80,.1); border-radius: 6px; padding: 8px 12px; margin-top: 10px; }
    .divider {
      display: flex; align-items: center; gap: 12px;
      margin: 20px 0; color: rgba(200,185,140,.35); font-size: .75rem;
    }
    .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: rgba(200,160,40,.15); }
    .guest-area { display: flex; flex-direction: column; gap: 10px; }
    .hint { color: rgba(200,185,140,.6); font-size: .75rem; font-style: italic; }
    .field {
      background: rgba(0,0,0,.4); border: 1px solid rgba(200,160,40,.25); border-radius: 8px;
      padding: 11px 14px; color: #f0e0c0; font-size: .9rem; font-family: 'Georgia',serif;
      outline: none; transition: border-color .18s;
    }
    .field:focus { border-color: rgba(200,160,40,.6); }
    .field::placeholder { color: rgba(200,180,130,.4); }
    .guest-btn {
      background: transparent; border: 1px solid rgba(200,160,40,.35);
      border-radius: 50px; padding: 11px; font-size: .9rem;
      font-family: 'Georgia',serif; color: rgba(200,185,140,.75);
      cursor: pointer; transition: all .18s;
    }
    .guest-btn:hover:not(:disabled) { border-color: rgba(200,160,40,.7); color: #f5e8c0; }
    .guest-btn:disabled { opacity: .55; cursor: not-allowed; }
  `]
})
export class LoginComponent {
  @Output() done = new EventEmitter<void>();

  private auth = inject(AuthService);

  guestName = '';
  loading   = signal(false);
  error     = signal('');

  async doGoogle(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.loginWithGoogle();
      this.done.emit();
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      this.loading.set(false);
    }
  }

  async doGuest(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.auth.loginAsGuest(this.guestName);
      this.done.emit();
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Failed to start guest session.');
    } finally {
      this.loading.set(false);
    }
  }
}
