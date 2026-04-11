import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUser = signal<User | null>(null);
  private token = signal<string | null>(null);

  isAuthenticated = computed(() => !!this.currentUser() && !!this.token());
  user = computed(() => this.currentUser());

  constructor(private http: HttpClient) {
    // Load from localStorage on init
    if (typeof localStorage !== 'undefined') {
      const savedToken = localStorage.getItem('devflare_token');
      const savedUser = localStorage.getItem('devflare_user');
      if (savedToken && savedUser) {
        this.token.set(savedToken);
        this.currentUser.set(JSON.parse(savedUser));
      }
    }
  }

  async login(email: string, password: string): Promise<void> {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data: AuthResponse = await response.json();
    this.setSession(data);
  }

  async register(email: string, password: string, name: string): Promise<void> {
    const response = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });

    if (!response.ok) {
      throw new Error('Registration failed');
    }

    const data: AuthResponse = await response.json();
    this.setSession(data);
  }

  logout(): void {
    this.currentUser.set(null);
    this.token.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('devflare_token');
      localStorage.removeItem('devflare_user');
    }
  }

  private setSession(data: AuthResponse): void {
    this.currentUser.set(data.user);
    this.token.set(data.token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('devflare_token', data.token);
      localStorage.setItem('devflare_user', JSON.stringify(data.user));
    }
  }

  getToken(): string | null {
    return this.token();
  }
}
