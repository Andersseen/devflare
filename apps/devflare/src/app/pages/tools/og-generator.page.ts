import {
  Component,
  ElementRef,
  signal,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OgGenerator } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltInput,
  VoltTextarea,
  VoltButton,
  VoltSwitch,
} from '@voltui/components';

@Component({
  selector: 'app-og-generator-page',
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
    VoltSwitch,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Social Card Designer</h1>
        <p class="text-muted-foreground mt-1">
          Create beautiful Open Graph images for your social media posts
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <!-- Controls -->
        <div class="space-y-4">
          <volt-card>
            <volt-card-header>
              <volt-card-title>Content</volt-card-title>
            </volt-card-header>
            <volt-card-content class="space-y-4">
              <volt-input label="Title" [(value)]="title" />
              <volt-textarea
                label="Description"
                [(value)]="description"
                [rows]="3"
              />
              <volt-input label="Category" [(value)]="category" />
              <volt-input label="Author Name" [(value)]="authorName" />

              <div>
                <label for="avatarInput" class="text-sm font-medium block mb-1"
                  >Author Avatar</label
                >
                <div class="flex items-center gap-4">
                  @if (authorAvatar()) {
                    <div
                      class="relative w-12 h-12 rounded-full overflow-hidden border border-border group cursor-pointer"
                      tabindex="0"
                      role="button"
                      (click)="removeAvatar()"
                      (keydown.enter)="removeAvatar()"
                      (keydown.space)="removeAvatar()"
                    >
                      <img
                        [src]="authorAvatar()"
                        class="w-full h-full object-cover"
                        alt="Author avatar"
                      />
                      <div
                        class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <lucide-icon name="x" class="w-5 h-5 text-white" />
                      </div>
                    </div>
                  }
                  <button
                    class="flex-1 h-10 border border-dashed border-border rounded-lg flex items-center justify-center text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    (click)="avatarInput.click()"
                  >
                    Upload Photo
                  </button>
                  <input
                    #avatarInput
                    type="file"
                    class="hidden"
                    accept="image/*"
                    (change)="onAvatarUpload($event)"
                  />
                </div>
              </div>
            </volt-card-content>
          </volt-card>

          <volt-card>
            <volt-card-header>
              <volt-card-title>Appearance</volt-card-title>
            </volt-card-header>
            <volt-card-content class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label
                    for="backgroundColor"
                    class="text-sm font-medium block mb-1"
                    >Background</label
                  >
                  <input
                    id="backgroundColor"
                    type="color"
                    [ngModel]="backgroundColor()"
                    (ngModelChange)="backgroundColor.set($event)"
                    class="w-full h-10 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <label for="themeColor" class="text-sm font-medium block mb-1"
                    >Theme Color</label
                  >
                  <input
                    id="themeColor"
                    type="color"
                    [ngModel]="themeColor()"
                    (ngModelChange)="themeColor.set($event)"
                    class="w-full h-10 rounded cursor-pointer"
                  />
                </div>
              </div>
              <div class="flex items-center gap-4">
                <volt-switch id="showLogo" [(checked)]="showLogo" />
                <label for="showLogo" class="text-sm font-medium select-none"
                  >Show Brand Logo</label
                >
              </div>
              <div class="flex items-center gap-4">
                <volt-switch id="darkText" [(checked)]="darkText" />
                <label for="darkText" class="text-sm font-medium select-none"
                  >Dark Text Mode</label
                >
              </div>
              <volt-button
                variant="solid"
                class="w-full"
                (click)="downloadImage()"
                [disabled]="isGenerating()"
              >
                @if (isGenerating()) {
                  Generating...
                } @else {
                  <span class="flex items-center justify-center gap-2">
                    <lucide-icon name="download" class="w-4 h-4" />
                    Download PNG
                  </span>
                }
              </volt-button>
            </volt-card-content>
          </volt-card>
        </div>

        <!-- Preview -->
        <div
          class="flex items-center justify-center p-4 bg-muted/30 rounded-xl border border-border overflow-hidden relative"
        >
          <div
            class="absolute inset-0 opacity-5 pointer-events-none"
            style="background-image: radial-gradient(#64748b 1px, transparent 1px); background-size: 24px 24px;"
          ></div>

          <div
            class="origin-center transform scale-[0.35] sm:scale-[0.45] md:scale-[0.5] lg:scale-[0.55] transition-transform duration-300 shadow-2xl"
          >
            <div
              #cardRef
              class="w-[1200px] h-[630px] relative flex flex-col p-16 justify-between overflow-hidden font-sans"
              [style.background-color]="backgroundColor()"
              [class.text-slate-900]="darkText()"
              [class.text-white]="!darkText()"
            >
              <!-- Decorative Elements -->
              <div
                class="absolute top-0 right-0 w-[600px] h-[600px] opacity-20 blur-3xl rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none"
                [style.background-color]="themeColor()"
              ></div>
              <div
                class="absolute bottom-0 left-0 w-[500px] h-[500px] opacity-20 blur-3xl rounded-full -translate-x-1/3 translate-y-1/3 pointer-events-none"
                [style.background-color]="themeColor()"
              ></div>

              <!-- Top Bar -->
              <div class="flex items-start justify-between relative z-10">
                @if (showLogo()) {
                  <div class="flex items-center gap-4">
                    <div
                      class="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                      [style.background-color]="themeColor()"
                    >
                      <span class="text-3xl font-bold text-white">D</span>
                    </div>
                    <span class="text-2xl font-bold tracking-tight opacity-90"
                      >DevFlare</span
                    >
                  </div>
                } @else {
                  <div></div>
                }
                <div
                  class="px-6 py-2 rounded-full border opacity-60 text-lg font-medium tracking-wide"
                  [class.border-slate-900]="darkText()"
                  [class.border-white]="!darkText()"
                >
                  {{ category() }}
                </div>
              </div>

              <!-- Main Content -->
              <div class="space-y-6 max-w-4xl relative z-10">
                <h1
                  class="text-7xl font-extrabold leading-[1.1] tracking-tight"
                >
                  {{ title() }}
                </h1>
                <p class="text-3xl opacity-80 leading-relaxed max-w-3xl">
                  {{ description() }}
                </p>
              </div>

              <!-- Footer -->
              <div class="flex items-center gap-6 relative z-10">
                @if (authorAvatar()) {
                  <img
                    [src]="authorAvatar()"
                    class="w-24 h-24 rounded-full border-4 object-cover shadow-sm"
                    [class.border-slate-900]="darkText()"
                    [class.border-white]="!darkText()"
                    alt="Author avatar"
                  />
                }
                <div>
                  <p class="text-2xl font-bold">{{ authorName() }}</p>
                  <p class="text-xl opacity-70">&#64;devflare_io</p>
                </div>
                <div
                  class="ml-auto h-2 w-32 rounded-full"
                  [style.background-color]="themeColor()"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export default class OgGeneratorPage {
  title = signal('Designing Beautiful Social Cards');
  description = signal(
    'Learn how to create engaging Open Graph images for your blog posts using Angular and Tailwind CSS.',
  );
  category = signal('Blog Post');
  authorName = signal('Andrii Pap');
  authorAvatar = signal<string | null>(null);
  backgroundColor = signal('#0f172a');
  themeColor = signal('#4f46e5');
  showLogo = signal(true);
  darkText = signal(false);
  isGenerating = signal(false);

  @ViewChild('cardRef') cardRef!: ElementRef<HTMLElement>;

  #ogGeneratorService = inject(OgGenerator);

  onAvatarUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        this.authorAvatar.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  removeAvatar() {
    this.authorAvatar.set(null);
  }

  async downloadImage() {
    if (!this.cardRef) return;
    this.isGenerating.set(true);
    try {
      const dataUrl = await this.#ogGeneratorService.generatePng(
        this.cardRef.nativeElement,
      );
      this.#ogGeneratorService.downloadImage(dataUrl);
    } catch (err) {
      console.error('Failed to generate image', err);
    } finally {
      this.isGenerating.set(false);
    }
  }
}
