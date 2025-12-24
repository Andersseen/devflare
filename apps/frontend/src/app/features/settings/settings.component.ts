import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CardComponent } from '@ui-components/card.component';
import { ButtonComponent } from '@ui-components/button.component';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, CardComponent, ButtonComponent, RouterLink, LucideAngularModule],
  template: `
    <div class="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <header>
        <h2 class="text-2xl font-bold text-text">Account Settings</h2>
        <p class="text-sm text-text-muted">Manage your profile and preferences.</p>
      </header>

      <div class="grid gap-6">
        <!-- User Profile Section -->
        <ui-card>
          <div class="flex items-center justify-between mb-6">
            <h3 class="font-semibold text-text text-lg">Profile</h3>
          </div>

          <form class="space-y-4">
            <div class="flex items-center gap-6 mb-6">
              <div class="relative group cursor-pointer">
                <div
                  class="w-20 h-20 rounded-full bg-secondary flex items-center justify-center text-2xl font-bold text-text-muted overflow-hidden"
                >
                  @if (user.avatar) {
                  <img [src]="user.avatar" class="w-full h-full object-cover" />
                  } @else {
                  <span>{{ user.name.charAt(0) }}</span>
                  }
                </div>
                <div
                  class="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                >
                  <lucide-icon name="upload" class="text-white w-5 h-5"></lucide-icon>
                </div>
              </div>
              <div>
                <h4 class="font-medium text-text">Profile Picture</h4>
                <p class="text-sm text-text-muted">JPG, GIF or PNG. Max size of 800K</p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="text-sm font-medium text-text">Full Name</label>
                <input
                  type="text"
                  [(ngModel)]="user.name"
                  name="name"
                  class="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:border-primary outline-none transition-colors"
                />
              </div>
              <div class="space-y-1">
                <label class="text-sm font-medium text-text">Email Address</label>
                <input
                  type="email"
                  [(ngModel)]="user.email"
                  name="email"
                  class="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:border-primary outline-none transition-colors"
                />
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-sm font-medium text-text">Bio</label>
              <textarea
                [(ngModel)]="user.bio"
                name="bio"
                class="w-full px-3 py-2 bg-background border border-border rounded-lg text-text focus:border-primary outline-none transition-colors min-h-[100px]"
              ></textarea>
            </div>

            <div class="pt-2 flex justify-end">
              <ui-button (click)="saveProfile()">
                @if (saved()) { Saved! } @else { Save Changes }
              </ui-button>
            </div>
          </form>
        </ui-card>

        <!-- Integrations Section -->
        <ui-card>
          <h3 class="font-semibold text-text text-lg mb-4">Integrations & Cloud</h3>

          <div class="space-y-4">
            <!-- Cloudflare R2 -->
            <div
              class="flex items-center justify-between p-4 bg-secondary/10 rounded-lg border border-border"
            >
              <div class="flex items-center gap-4">
                <div
                  class="w-10 h-10 rounded-md bg-[#F38020]/10 flex items-center justify-center text-[#F38020]"
                >
                  <lucide-icon name="database" [size]="24"></lucide-icon>
                </div>
                <div>
                  <h4 class="font-medium text-text">Cloudflare R2</h4>
                  <p class="text-sm text-text-muted">Configure bucket and access credentials</p>
                </div>
              </div>
              <ui-button variant="outline" routerLink="/settings/cloud"> Configure </ui-button>
            </div>

            <!-- GitHub (Placeholder) -->
            <div
              class="flex items-center justify-between p-4 bg-secondary/10 rounded-lg border border-border opacity-60"
            >
              <div class="flex items-center gap-4">
                <div
                  class="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center text-text"
                >
                  <lucide-icon name="github" [size]="24"></lucide-icon>
                </div>
                <div>
                  <h4 class="font-medium text-text">GitHub Entrprise</h4>
                  <p class="text-sm text-text-muted">Connect your repositories</p>
                </div>
              </div>
              <ui-button variant="ghost" [disabled]="true"> Coming Soon </ui-button>
            </div>
          </div>
        </ui-card>
      </div>
    </div>
  `,
})
export class SettingsComponent {
  saved = signal(false);

  user = {
    name: 'Andrii Pap',
    email: 'andrii@andersseen.com',
    bio: 'Frontend Architect & UI Designer. Building the future of web development tools.',
    avatar: '',
  };

  saveProfile() {
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 2000);
  }
}
