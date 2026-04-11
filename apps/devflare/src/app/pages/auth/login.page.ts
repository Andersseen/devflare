import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CardComponent, ButtonComponent, InputComponent } from '@org/ui';
import { AuthService } from '@org/core';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, CardComponent, ButtonComponent, InputComponent],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div class="w-full max-w-md">
        <!-- Logo -->
        <div class="flex items-center justify-center gap-2 mb-8">
          <div class="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <span class="text-primary-foreground font-bold text-xl">D</span>
          </div>
          <span class="text-2xl font-bold">DevFlare</span>
        </div>

        <ui-card title="Welcome back" description="Sign in to your account">
          <form class="space-y-4 mt-4" (submit)="onSubmit($event)">
            <ui-input
              label="Email"
              type="email"
              placeholder="you@example.com"
              [(value)]="email"
            />
            
            <ui-input
              label="Password"
              type="password"
              placeholder="••••••••"
              [(value)]="password"
            />

            @if (error()) {
              <div class="p-3 text-sm text-red-500 bg-red-50 rounded-lg">
                {{ error() }}
              </div>
            }

            <ui-button 
              type="submit" 
              [fullWidth]="true"
              [disabled]="isLoading()"
            >
              @if (isLoading()) {
                <span class="flex items-center justify-center gap-2">
                  <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              } @else {
                Sign In
              }
            </ui-button>
          </form>

          <div class="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account? 
            <a routerLink="/register" class="text-primary hover:underline">Sign up</a>
          </div>
        </ui-card>
      </div>
    </div>
  `,
})
export default class LoginPageComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  password = signal('');
  isLoading = signal(false);
  error = signal('');

  async onSubmit(event: Event) {
    event.preventDefault();
    this.isLoading.set(true);
    this.error.set('');

    try {
      await this.auth.login(this.email(), this.password());
      this.router.navigate(['/']);
    } catch (err) {
      this.error.set('Invalid email or password');
    } finally {
      this.isLoading.set(false);
    }
  }
}
