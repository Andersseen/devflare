import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core-services/auth.service';
import { ButtonComponent } from '@ui-components/button.component';

@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonComponent],
  template: `
    <div class="space-y-6">
       <div>
         <h3 class="text-xl font-semibold text-text">Create an account</h3>
         <p class="mt-1 text-sm text-text-muted">
             Already have an account? <a routerLink="/auth/sign-in" class="font-medium text-primary hover:text-primary/90">Sign in</a>
         </p>
       </div>

       <form (ngSubmit)="onSubmit()" class="space-y-6">
           <div>
             <label for="name" class="block text-sm font-medium text-text">Display Name</label>
             <div class="mt-1">
               <input 
                 id="name" 
                 name="name" 
                 type="text" 
                 required 
                 [(ngModel)]="name"
                 class="block w-full appearance-none rounded-md border border-border px-3 py-2 placeholder-text-muted shadow-sm focus:border-primary focus:outline-none focus:ring-primary bg-background text-text sm:text-sm"
               >
             </div>
           </div>

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
                    Creating account...
                } @else {
                    Sign up
                }
             </ui-button>
           </div>
       </form>
    </div>
  `
})
export class SignUpComponent {
  authService = inject(AuthService);
  router = inject(Router);

  name = '';
  email = '';
  password = '';
  isLoading = signal(false);

  onSubmit() {
    if (!this.email || !this.password || !this.name) return;

    this.isLoading.set(true);
    this.authService.signup(this.name, this.email, this.password).subscribe(() => {
      this.isLoading.set(false);
      this.router.navigate(['/']);
    });
  }
}
