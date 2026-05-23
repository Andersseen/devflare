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
  selector: 'app-sign-up-page',
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
            <volt-card-title>Create an account</volt-card-title>
            <volt-card-description
              >Get started with DevFlare</volt-card-description
            >
          </volt-card-header>
          <volt-card-content>
            <form class="space-y-4" (submit)="onSubmit($event)">
              <volt-form-field>
                <volt-label>Name</volt-label>
                <volt-input
                  type="text"
                  placeholder="John Doe"
                  [(value)]="name"
                  autocomplete="name"
                />
              </volt-form-field>

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
                  autocomplete="new-password"
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
                    Creating account...
                  </span>
                } @else {
                  Sign Up
                }
              </volt-button>
            </form>

            <div class="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?
              <a routerLink="/login" class="text-primary hover:underline"
                >Sign in</a
              >
            </div>
          </volt-card-content>
        </volt-card>
      </div>
    </div>
  `,
})
export default class SignUpPage {
  #auth = inject(Auth);
  #router = inject(Router);

  name = signal('');
  email = signal('');
  password = signal('');
  isLoading = signal(false);
  error = signal('');

  async onSubmit(event: Event) {
    event.preventDefault();
    this.isLoading.set(true);
    this.error.set('');

    try {
      await this.#auth.register(this.email(), this.password(), this.name());
      this.#router.navigate(['/']);
    } catch (err: unknown) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to create account',
      );
    } finally {
      this.isLoading.set(false);
    }
  }
}
