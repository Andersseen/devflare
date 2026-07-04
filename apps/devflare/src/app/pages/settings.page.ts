import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltInput,
  VoltTextarea,
  VoltButton,
  VoltAvatar,
  VoltAvatarFallback,
  VoltTabs,
  VoltTabsList,
  VoltTabsTrigger,
  VoltTabsContent,
  VoltError,
} from '@voltui/components';
import { Auth } from '@org/auth';

const BIO_STORAGE_KEY = 'devflare_user_bio';

@Component({
  selector: 'app-settings-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltInput,
    VoltTextarea,
    VoltButton,
    VoltAvatar,
    VoltAvatarFallback,
    VoltTabs,
    VoltTabsList,
    VoltTabsTrigger,
    VoltTabsContent,
    VoltError,
  ],
  template: `
    <div class="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
        <p class="text-muted-foreground mt-1">
          Manage your profile and preferences
        </p>
      </div>

      <volt-tabs [(value)]="activeTab">
        <volt-tabs-list>
          <volt-tabs-trigger value="profile">Profile</volt-tabs-trigger>
          <volt-tabs-trigger value="integrations"
            >Integrations</volt-tabs-trigger
          >
        </volt-tabs-list>

        <volt-tabs-content value="profile">
          <volt-card>
            <volt-card-header>
              <volt-card-title>Profile</volt-card-title>
            </volt-card-header>
            <volt-card-content class="space-y-6">
              <div class="flex items-center gap-6">
                <div class="relative group cursor-pointer">
                  <volt-avatar class="w-20 h-20 text-2xl">
                    @if (auth.user()?.image) {
                      <img
                        [src]="auth.user()?.image"
                        class="w-full h-full object-cover"
                        alt="Profile picture"
                      />
                    } @else {
                      <volt-avatar-fallback>{{
                        (auth.user()?.name || auth.user()?.email || '?').charAt(
                          0
                        )
                      }}</volt-avatar-fallback>
                    }
                  </volt-avatar>
                  <div
                    class="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <lucide-icon name="upload" class="text-white w-5 h-5" />
                  </div>
                </div>
                <div>
                  <h4 class="font-medium">Profile Picture</h4>
                  <p class="text-sm text-muted-foreground">
                    JPG, GIF or PNG. Max size of 800K
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <volt-input label="Full Name" [(value)]="userName" />
                <volt-input
                  label="Email Address"
                  type="email"
                  [(value)]="userEmail"
                  [disabled]="true"
                />
              </div>

              <volt-textarea label="Bio" [(value)]="userBio" [rows]="4" />

              @if (saveError()) {
                <volt-error>{{ saveError() }}</volt-error>
              }

              <div class="flex justify-end">
                <volt-button
                  variant="solid"
                  (click)="saveProfile()"
                  [disabled]="isSaving()"
                >
                  @if (isSaving()) {
                    <lucide-icon
                      name="loader"
                      class="animate-spin w-4 h-4 mr-1"
                    />
                    Saving...
                  } @else if (saved()) {
                    <lucide-icon name="check" class="w-4 h-4 mr-1" />
                    Saved!
                  } @else {
                    Save Changes
                  }
                </volt-button>
              </div>
            </volt-card-content>
          </volt-card>
        </volt-tabs-content>

        <volt-tabs-content value="integrations">
          <div class="space-y-4">
            <volt-card>
              <volt-card-content class="flex items-center justify-between py-4">
                <div class="flex items-center gap-4">
                  <div
                    class="w-10 h-10 rounded-md bg-orange-500/10 flex items-center justify-center text-orange-500"
                  >
                    <lucide-icon name="database" class="w-5 h-5" />
                  </div>
                  <div>
                    <h4 class="font-medium">Cloudflare R2</h4>
                    <p class="text-sm text-muted-foreground">
                      Configure bucket and access credentials
                    </p>
                  </div>
                </div>
                <volt-button variant="outline" size="sm">Configure</volt-button>
              </volt-card-content>
            </volt-card>

            <volt-card>
              <volt-card-content
                class="flex items-center justify-between py-4 opacity-60"
              >
                <div class="flex items-center gap-4">
                  <div
                    class="w-10 h-10 rounded-md bg-muted flex items-center justify-center"
                  >
                    <lucide-icon name="github" class="w-5 h-5" />
                  </div>
                  <div>
                    <h4 class="font-medium">GitHub Enterprise</h4>
                    <p class="text-sm text-muted-foreground">
                      Connect your repositories
                    </p>
                  </div>
                </div>
                <volt-button variant="ghost" size="sm" [disabled]="true"
                  >Coming Soon</volt-button
                >
              </volt-card-content>
            </volt-card>
          </div>
        </volt-tabs-content>
      </volt-tabs>
    </div>
  `,
})
export default class SettingsPage {
  auth = inject(Auth);
  activeTab = signal('profile');
  saved = signal(false);
  isSaving = signal(false);
  saveError = signal('');

  userName = signal('');
  userEmail = signal('');
  userBio = signal('');

  constructor() {
    const u = this.auth.user();
    if (u) {
      this.userName.set(u.name || '');
      this.userEmail.set(u.email || '');
    }

    // Load bio from localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(BIO_STORAGE_KEY);
      if (stored) this.userBio.set(stored);
    }
  }

  async saveProfile() {
    this.isSaving.set(true);
    this.saveError.set('');
    this.saved.set(false);

    try {
      if (this.userName()) {
        await this.auth.updateName(this.userName());
      }

      // Persist bio locally
      if (typeof window !== 'undefined') {
        localStorage.setItem(BIO_STORAGE_KEY, this.userBio());
      }

      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2000);
    } catch (err: unknown) {
      this.saveError.set(
        err instanceof Error ? err.message : 'Failed to save profile',
      );
    } finally {
      this.isSaving.set(false);
    }
  }
}
