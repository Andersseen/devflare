import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SeoSimulator } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltInput,
  VoltTextarea,
  VoltButton,
  VoltTabs,
  VoltTabsList,
  VoltTabsTrigger,
  VoltTabsContent,
} from '@voltui/components';

@Component({
  selector: 'app-seo-simulator-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltInput,
    VoltTextarea,
    VoltButton,
    VoltTabs,
    VoltTabsList,
    VoltTabsTrigger,
    VoltTabsContent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">SEO Simulator</h1>
        <p class="text-muted-foreground mt-1">
          Preview how your pages appear on Google, Twitter, and Facebook
        </p>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <!-- Input Panel -->
        <div class="space-y-4">
          <volt-card>
            <volt-card-content class="space-y-4">
              <div>
                <div class="flex justify-between mb-1">
                  <label for="metaTitle" class="text-sm font-medium"
                    >Meta Title</label
                  >
                  <span class="text-xs font-mono" [class]="titleColor()"
                    >{{ title().length }} / 60</span
                  >
                </div>
                <volt-input
                  id="metaTitle"
                  type="text"
                  placeholder="Enter page title..."
                  [(value)]="title"
                />
                @if (title().length > 70) {
                  <p class="text-xs text-red-500 mt-1">
                    Google will likely truncate this title.
                  </p>
                }
              </div>

              <div>
                <div class="flex justify-between mb-1">
                  <label for="metaDesc" class="text-sm font-medium"
                    >Meta Description</label
                  >
                  <span class="text-xs font-mono" [class]="descColor()"
                    >{{ description().length }} / 160</span
                  >
                </div>
                <volt-textarea
                  id="metaDesc"
                  [(value)]="description"
                  placeholder="Enter page description..."
                  [rows]="3"
                  resize="vertical"
                />
              </div>

              <div>
                <label for="canonicalUrl" class="text-sm font-medium block mb-1"
                  >Canonical URL</label
                >
                <volt-input
                  id="canonicalUrl"
                  type="url"
                  placeholder="https://example.com/page"
                  [(value)]="url"
                />
              </div>

              <div>
                <label for="seoFileInput" class="text-sm font-medium block mb-1"
                  >Social Image</label
                >
                @if (imageSrc()) {
                  <div
                    class="relative group rounded-lg overflow-hidden border border-border mb-2"
                  >
                    <img
                      [src]="imageSrc()"
                      class="w-full h-40 object-cover bg-muted"
                      alt="Social preview image"
                    />
                    <button
                      (click)="removeImage()"
                      class="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <lucide-icon name="x" class="w-4 h-4" />
                    </button>
                  </div>
                }
                <div
                  class="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer"
                  tabindex="0"
                  role="button"
                  (dragover)="$event.preventDefault()"
                  (drop)="onDrop($event)"
                  (click)="fileInput.click()"
                  (keydown.enter)="fileInput.click()"
                  (keydown.space)="fileInput.click()"
                >
                  <lucide-icon name="upload" class="w-6 h-6 mb-2" />
                  <span class="text-sm">Click to upload or drag & drop</span>
                  <input
                    #fileInput
                    id="seoFileInput"
                    type="file"
                    class="hidden"
                    accept="image/*"
                    (change)="onFileSelected($event)"
                  />
                </div>
              </div>

              <volt-button
                variant="outline"
                class="w-full"
                (click)="copyHtml()"
              >
                Copy Meta Tags
              </volt-button>
            </volt-card-content>
          </volt-card>
        </div>

        <!-- Previews -->
        <div class="space-y-6">
          <volt-tabs [(value)]="activePreview">
            <volt-tabs-list>
              <volt-tabs-trigger value="google">Google</volt-tabs-trigger>
              <volt-tabs-trigger value="twitter">Twitter/X</volt-tabs-trigger>
              <volt-tabs-trigger value="facebook">Facebook</volt-tabs-trigger>
              <volt-tabs-trigger value="slack">Slack</volt-tabs-trigger>
            </volt-tabs-list>

            <volt-tabs-content value="google">
              <div
                class="bg-white dark:bg-card p-4 rounded-lg border border-border font-sans"
              >
                <div class="flex items-center gap-3 mb-1">
                  <div
                    class="w-7 h-7 bg-muted rounded-full flex items-center justify-center overflow-hidden"
                  >
                    @if (imageSrc()) {
                      <img
                        [src]="imageSrc()"
                        class="w-full h-full object-cover"
                        alt="Site avatar"
                      />
                    } @else {
                      <div class="w-3 h-3 bg-primary rounded-full"></div>
                    }
                  </div>
                  <div class="text-sm">
                    <div
                      class="text-foreground font-medium truncate max-w-[200px]"
                    >
                      {{ getDomain() }}
                    </div>
                    <div
                      class="text-muted-foreground text-xs truncate max-w-[250px]"
                    >
                      {{ url() }}
                    </div>
                  </div>
                </div>
                <a
                  href="#"
                  class="block text-[#1a0dab] dark:text-[#8ab4f8] text-xl font-medium hover:underline truncate mb-1 leading-snug"
                >
                  {{ title() || 'Page Title' }}
                </a>
                <div
                  class="text-sm text-[#4d5156] dark:text-muted-foreground leading-relaxed line-clamp-2"
                >
                  {{
                    description() ||
                      'Page description will appear here in search results.'
                  }}
                </div>
              </div>
            </volt-tabs-content>

            <volt-tabs-content value="twitter">
              <div
                class="bg-white dark:bg-card rounded-xl border border-border overflow-hidden font-sans cursor-pointer hover:bg-accent/30 transition-colors"
              >
                <div
                  class="aspect-[2/1] bg-muted flex items-center justify-center overflow-hidden border-b border-border"
                >
                  @if (imageSrc()) {
                    <img
                      [src]="imageSrc()"
                      class="w-full h-full object-cover"
                      alt="Twitter card image"
                    />
                  } @else {
                    <span class="text-muted-foreground text-sm"
                      >Large Image Preview</span
                    >
                  }
                </div>
                <div class="p-4">
                  <div
                    class="text-muted-foreground text-xs uppercase mb-0.5 truncate"
                  >
                    {{ getDomain().toUpperCase() }}
                  </div>
                  <div
                    class="text-foreground font-bold mb-1 truncate leading-tight"
                  >
                    {{ title() || 'Page Title' }}
                  </div>
                  <div
                    class="text-muted-foreground text-sm line-clamp-2 leading-snug"
                  >
                    {{ description() || 'Description goes here.' }}
                  </div>
                </div>
              </div>
            </volt-tabs-content>

            <volt-tabs-content value="facebook">
              <div class="bg-[#F0F2F5] dark:bg-muted/30 p-3 rounded-lg">
                <div
                  class="bg-white dark:bg-card border border-border overflow-hidden"
                >
                  <div
                    class="aspect-[1.91/1] bg-muted flex items-center justify-center overflow-hidden"
                  >
                    @if (imageSrc()) {
                      <img
                        [src]="imageSrc()"
                        class="w-full h-full object-cover"
                        alt="Facebook card image"
                      />
                    } @else {
                      <span class="text-muted-foreground text-sm"
                        >1200 x 630</span
                      >
                    }
                  </div>
                  <div
                    class="p-3 bg-[#F2F3F5] dark:bg-muted/50 border-t border-border"
                  >
                    <div
                      class="text-muted-foreground text-xs uppercase truncate mb-0.5"
                    >
                      {{ getDomain().toUpperCase() }}
                    </div>
                    <div
                      class="text-foreground font-bold text-base truncate mb-0.5 leading-tight"
                    >
                      {{ title() }}
                    </div>
                    <div
                      class="text-muted-foreground text-sm line-clamp-1 leading-snug"
                    >
                      {{ description() }}
                    </div>
                  </div>
                </div>
              </div>
            </volt-tabs-content>

            <volt-tabs-content value="slack">
              <div class="flex gap-3">
                <div class="w-1 rounded-full bg-border"></div>
                <div class="flex-1">
                  <div class="flex gap-2 mb-1">
                    <span class="text-xs font-bold text-foreground"
                      >DevFlare</span
                    >
                    <span class="text-xs text-muted-foreground">APP</span>
                  </div>
                  <div
                    class="text-blue-600 font-bold mb-1 hover:underline cursor-pointer"
                  >
                    {{ title() }}
                  </div>
                  <div class="text-foreground text-sm mb-2">
                    {{ description() }}
                  </div>
                  @if (imageSrc()) {
                    <img
                      [src]="imageSrc()"
                      class="w-[300px] h-auto rounded-lg border border-border block"
                      alt="Slack link preview"
                    />
                  }
                </div>
              </div>
            </volt-tabs-content>
          </volt-tabs>
        </div>
      </div>
    </div>
  `,
})
export default class SeoSimulatorPage {
  title = signal('');
  description = signal('');
  url = signal('https://example.com/blog/my-post');
  imageSrc = signal<string | null>(null);
  activePreview = signal('google');

  titleColor = computed(() => {
    const len = this.title().length;
    if (len === 0) return 'text-muted-foreground';
    if (len < 60) return 'text-green-500 font-medium';
    if (len <= 70) return 'text-amber-500 font-medium';
    return 'text-red-500 font-bold';
  });

  descColor = computed(() => {
    const len = this.description().length;
    if (len === 0) return 'text-muted-foreground';
    if (len < 160) return 'text-green-500 font-medium';
    return 'text-red-500 font-bold';
  });

  #seoSimulatorService = inject(SeoSimulator);

  getDomain() {
    return this.#seoSimulatorService.getDomain(this.url());
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.handleFile(input.files[0]);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files.length) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.imageSrc.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  removeImage() {
    this.imageSrc.set(null);
  }

  copyHtml() {
    const tags = this.#seoSimulatorService.generateMetaTags(
      this.title(),
      this.description(),
      this.url(),
      this.imageSrc(),
    );

    navigator.clipboard.writeText(tags);
  }
}
