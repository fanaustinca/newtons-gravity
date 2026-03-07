import { Injectable, signal } from '@angular/core';

export interface AuthUser {
  id: string;
  username: string;
  isAnonymous: boolean;
  token: string;
}

const SERVER = (): string =>
  window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);

  /** Create a temporary anonymous account (deleted when tab closes) */
  async loginAnonymous(name: string): Promise<void> {
    const response = await fetch(`${SERVER()}/api/auth/login-anon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    // Anonymous users are created via socket auth:anonymous event — handled in MultiplayerService.
    // For solo play we just create a local-only user object without a server round-trip.
    const safeName = name.trim().slice(0, 20) || 'Newton';
    this.user.set({
      id: `local-${Date.now()}`,
      username: safeName,
      isAnonymous: true,
      token: '',
    });
    // Suppress unused variable warning
    void response;
  }

  /** Login / Register helpers that hit the real REST API */
  async register(username: string, password: string): Promise<void> {
    const res = await fetch(`${SERVER()}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'Registration failed.');
    }
    const body = await res.json();
    this.user.set({ ...body.user, token: body.token });
    sessionStorage.setItem('newton_token', body.token);
  }

  async login(username: string, password: string): Promise<void> {
    const res = await fetch(`${SERVER()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.error || 'Login failed.');
    }
    const body = await res.json();
    this.user.set({ ...body.user, token: body.token });
    sessionStorage.setItem('newton_token', body.token);
  }

  /** Try to restore session from sessionStorage (persists within the tab only) */
  tryRestoreSession(): boolean {
    const token = sessionStorage.getItem('newton_token');
    if (!token) return false;
    try {
      // Decode JWT payload (no verification here — server will verify on socket connect)
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) {
        sessionStorage.removeItem('newton_token');
        return false;
      }
      this.user.set({ id: payload.userId, username: payload.username ?? 'Player', isAnonymous: false, token });
      return true;
    } catch {
      return false;
    }
  }

  logout(): void {
    this.user.set(null);
    sessionStorage.removeItem('newton_token');
  }

  /** Set a guest user without server auth (for solo play) */
  setGuestUser(name: string): void {
    this.user.set({ id: `guest-${Date.now()}`, username: name || 'Newton', isAnonymous: true, token: '' });
  }

  /** Report IQ earned in a solo game (registered users only) */
  async reportSoloScore(iq: number): Promise<void> {
    const token = this.user()?.token;
    if (!token || this.user()?.isAnonymous) return;
    await fetch(`${SERVER()}/api/score/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ iq }),
    });
  }

  /** Fetch top 10 leaderboard entries */
  async fetchLeaderboard(): Promise<{ username: string; totalIq: number }[]> {
    const res = await fetch(`${SERVER()}/api/leaderboard`);
    if (!res.ok) return [];
    return res.json();
  }
}
