import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core-services/auth.service';
import { ButtonComponent } from '@ui-components/button.component';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonComponent],
  template: `
    <div class="space-y-6">
       <div>
         <h3 class="text-xl font-semibold text-text">Sign in to your account</h3>
         <p class="mt-1 text-sm text-text-muted">
             Or <a routerLink="/auth/sign-up" class="font-medium text-primary hover:text-primary/90">start a 14-day free trial</a>
         </p>
       </div>

       <form (ngSubmit)="onSubmit()" class="space-y-6">
           <div>
             <label for="email" class="block text-sm font-medium text-text">Email address</label>
             <div class="mt-1">
               <input 
                 id="email" 
                 name="email" 
                 type="email" 
                 autocomplete="email" 
                 required 
                 [(ngModel)]="email"
                 class="block w-full appearance-none rounded-md border border-border px-3 py-2 placeholder-text-muted shadow-sm focus:border-primary focus:outline-none focus:ring-primary bg-background text-text sm:text-sm"
               >
             </div>
           </div>

           <div>
             <label for="password" class="block text-sm font-medium text-text">Password</label>
             <div class="mt-1">
               <input 
                 id="password" 
                 name="password" 
                 type="password" 
                 autocomplete="current-password" 
                 required 
                 [(ngModel)]="password"
                 class="block w-full appearance-none rounded-md border border-border px-3 py-2 placeholder-text-muted shadow-sm focus:border-primary focus:outline-none focus:ring-primary bg-background text-text sm:text-sm"
               >
             </div>
           </div>

           <div>
             <ui-button 
                type="submit" 
                variant="primary" 
                [block]="true"
                [disabled]="isLoading()"
             >
                @if (isLoading()) {
                    Signing in...
                } @else {
                    Sign in
                }
             </ui-button>
           </div>
       </form>
    </div>
  `
})
export class SignInComponent {
  authService = inject(AuthService);
  router = inject(Router);

  email = '';
  password = '';
  isLoading = signal(false);

  onSubmit() {
    if (!this.email || !this.password) return;

    this.isLoading.set(true);
    this.authService.login(this.email, this.password).subscribe(() => {
      this.isLoading.set(false);
      this.router.navigate(['/']);
    });
  }
}
