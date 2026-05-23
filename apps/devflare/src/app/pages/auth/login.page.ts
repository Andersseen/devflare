import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardDescription,
  VoltCardContent,
  VoltInput,
  VoltButton,
  VoltFormField,
  VoltLabel,
  VoltError,
} from '@voltui/components';
import { Auth } from '@org/auth';

@Component({
  selector: 'app-login-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardDescription,
    VoltCardContent,
    VoltInput,
    VoltButton,
    VoltFormField,
    VoltLabel,
    VoltError,
  ],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="flex items-center justify-center gap-2 mb-8">
          <div
            class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center"
          >
            <span class="text-primary-foreground font-bold text-xl">D</span>
          </div>
          <span class="text-2xl font-bold">DevFlare</span>
        </div>

        <volt-card>
          <volt-card-header>
            <volt-card-title>Welcome back</volt-card-title>
            <volt-card-description
              >Sign in to your account</volt-card-description
            >
          </volt-card-header>
          <volt-card-content>
            <form class="space-y-4" (submit)="onSubmit($event)">
              <volt-form-field>
                <volt-label>Email</volt-label>
                <volt-input
                  type="email"
                  placeholder="you@example.com"
                  [(value)]="email"
                  autocomplete="email"
                />
              </volt-form-field>

              <volt-form-field>
                <volt-label>Password</volt-label>
                <volt-input
                  type="password"
                  placeholder="••••••••"
                  [(value)]="password"
                  autocomplete="current-password"
                />
              </volt-form-field>

              @if (error()) {
                <volt-error>{{ error() }}</volt-error>
              }

              <volt-button
                type="submit"
                variant="solid"
                [disabled]="isLoading()"
                class="w-full"
              >
                @if (isLoading()) {
                  <span class="flex items-center justify-center gap-2">
                    <lucide-icon name="loader" class="animate-spin w-4 h-4" />
                    Signing in...
                  </span>
                } @else {
                  Sign In
                }
              </volt-button>
            </form>

            <div class="mt-4 text-center text-sm text-muted-foreground">
              Don't have an account?
              <a routerLink="/sign-up" class="text-primary hover:underline"
                >Sign up</a
              >
            </div>
          </volt-card-content>
        </volt-card>
      </div>
    </div>
  `,
})
export default class LoginPage {
  #auth = inject(Auth);
  #router = inject(Router);

  email = signal('');
  password = signal('');
  isLoading = signal(false);
  error = signal('');

  async onSubmit(event: Event) {
    event.preventDefault();
    this.isLoading.set(true);
    this.error.set('');

    try {
      await this.#auth.login(this.email(), this.password());
      this.#router.navigate(['/']);
    } catch {
      this.error.set('Invalid email or password');
    } finally {
      this.isLoading.set(false);
    }
  }
}
