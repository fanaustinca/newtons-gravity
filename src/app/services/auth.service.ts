import { Injectable, signal } from '@angular/core';
import {
  signInWithPopup, signInWithRedirect, getRedirectResult,
  GoogleAuthProvider, signInAnonymously,
  signOut, onAuthStateChanged, User as FirebaseUser
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

export interface AuthUser {
  id: string;
  username: string;
  isAnonymous: boolean;
  token: string;
}

const SERVER = (): string =>
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:3000' : window.location.origin;

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<AuthUser | null>(null);

  constructor() {
    // Handle redirect result (mobile Google Sign-In)
    getRedirectResult(firebaseAuth).then(async (result) => {
      if (result?.user) {
        await this.syncUser(result.user);
      }
    }).catch(() => { });

    // Restore session if Firebase still has a logged-in user
    onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser && !this.user()) {
        await this.syncUser(fbUser);
      }
    });
  }

  private isMobile(): boolean {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /** Sign in with Google popup (desktop) or redirect (mobile) */
  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    if (this.isMobile()) {
      await signInWithRedirect(firebaseAuth, provider);
      // Page will redirect; result handled in constructor via getRedirectResult
    } else {
      const result = await signInWithPopup(firebaseAuth, provider);
      await this.syncUser(result.user);
    }
  }

  /** Play as guest (Firebase anonymous auth) */
  async loginAsGuest(name: string): Promise<void> {
    const result = await signInAnonymously(firebaseAuth);
    const safeName = (name.trim() || 'Newton').slice(0, 20);
    this.user.set({
      id: result.user.uid,
      username: safeName,
      isAnonymous: true,
      token: await result.user.getIdToken(),
    });
  }

  /** Get a fresh ID token (auto-refreshed by Firebase) */
  async getToken(): Promise<string> {
    const fbUser = firebaseAuth.currentUser;
    if (!fbUser) return '';
    return fbUser.getIdToken();
  }

  async logout(): Promise<void> {
    await signOut(firebaseAuth);
    this.user.set(null);
  }

  /** Report IQ earned in a solo game (registered users only) */
  async reportSoloScore(iq: number): Promise<void> {
    if (this.user()?.isAnonymous) return;
    const token = await this.getToken();
    if (!token) return;
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

  private async syncUser(fbUser: FirebaseUser): Promise<void> {
    const token = await fbUser.getIdToken();
    // Notify server to create/update user record
    await fetch(`${SERVER()}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    });
    this.user.set({
      id: fbUser.uid,
      username: fbUser.displayName || fbUser.email?.split('@')[0] || 'Player',
      isAnonymous: false,
      token,
    });
  }
}
