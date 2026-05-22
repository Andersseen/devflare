import { Injectable, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient } from '../client/auth-client';
import type { AuthUser } from '../types/auth.types';

@Injectable({
  providedIn: 'root',
})
export class Auth {
  #platformId = inject(PLATFORM_ID);
  #client = createClient();

  #_user = signal<AuthUser | null>(null);
  #_loading = signal(true);

  readonly user = this.#_user.asReadonly();
  readonly loading = this.#_loading.asReadonly();
  readonly isAuthenticated = computed(() => !!this.#_user());

  constructor() {
    if (isPlatformBrowser(this.#platformId)) {
      this.#loadSession();
    } else {
      this.#_loading.set(false);
    }
  }

  async #loadSession(): Promise<void> {
    try {
      const { data } = await this.#client.getSession();
      this.#_user.set((data?.user as AuthUser) ?? null);
    } catch {
      this.#_user.set(null);
    } finally {
      this.#_loading.set(false);
    }
  }

  async login(email: string, password: string): Promise<void> {
    const { data, error } = await this.#client.signIn.email({ email, password });
    if (error) throw new Error(error.message);
    this.#_user.set((data?.user as AuthUser) ?? null);
  }

  async register(email: string, password: string, name: string): Promise<void> {
    const { data, error } = await this.#client.signUp.email({ email, password, name });
    if (error) throw new Error(error.message);
    this.#_user.set((data?.user as AuthUser) ?? null);
  }

  async updateName(name: string): Promise<void> {
    const { error } = await this.#client.updateUser({ name });
    if (error) throw new Error(error.message);
    const { data: sessionData } = await this.#client.getSession();
    this.#_user.set((sessionData?.user as AuthUser) ?? null);
  }

  async logout(): Promise<void> {
    await this.#client.signOut();
    this.#_user.set(null);
  }
}
