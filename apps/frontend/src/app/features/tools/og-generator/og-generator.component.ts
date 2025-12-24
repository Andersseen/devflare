import { CommonModule } from '@angular/common';
import { Component, ElementRef, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toPng } from 'html-to-image';
import { ButtonComponent } from '@ui-components/button.component';
import { CardComponent } from '@ui-components/card.component';

@Component({
    selector: 'app-og-generator',
    standalone: true,
    imports: [CommonModule, FormsModule, CardComponent, ButtonComponent],
    template: `
    <div class="h-full flex flex-col md:flex-row gap-6 p-4 md:p-8 overflow-hidden">
      
      <!-- Controls (Left) -->
      <div class="w-full md:w-96 flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2">
         
         <div class="space-y-1">
             <h2 class="text-2xl font-bold text-text">Social Card</h2>
             <p class="text-sm text-text-muted">Design your Open Graph image.</p>
         </div>

         <ui-card class="space-y-6">
            <!-- Content -->
            <div class="space-y-4">
                <h3 class="text-sm font-semibold text-text uppercase tracking-wider">Content</h3>
                
                <div class="space-y-2">
                    <label class="block text-sm font-medium text-text-muted">Title</label>
                    <input type="text" [(ngModel)]="title" class="w-full rounded-md border-border bg-background text-text px-3 py-2 text-sm focus:ring-primary focus:border-primary">
                </div>
                
                <div class="space-y-2">
                    <label class="block text-sm font-medium text-text-muted">Description</label>
                    <textarea rows="3" [(ngModel)]="description" class="w-full rounded-md border-border bg-background text-text px-3 py-2 text-sm focus:ring-primary focus:border-primary"></textarea>
                </div>

                <div class="space-y-2">
                    <label class="block text-sm font-medium text-text-muted">Category</label>
                    <input type="text" [(ngModel)]="category" class="w-full rounded-md border-border bg-background text-text px-3 py-2 text-sm focus:ring-primary focus:border-primary">
                </div>

                <div class="space-y-2">
                    <label class="block text-sm font-medium text-text-muted">Author Name</label>
                    <input type="text" [(ngModel)]="authorName" class="w-full rounded-md border-border bg-background text-text px-3 py-2 text-sm focus:ring-primary focus:border-primary">
                </div>
                 
                 <div class="space-y-2">
                     <label class="block text-sm font-medium text-text-muted">Author Avatar</label>
                     <div class="flex items-center gap-4">
                         @if (authorAvatar()) {
                             <div class="relative w-12 h-12 rounded-full overflow-hidden border border-border group cursor-pointer" (click)="removeAvatar()">
                                 <img [src]="authorAvatar()" class="w-full h-full object-cover">
                                 <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-white">
                                       <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                     </svg>
                                 </div>
                             </div>
                         }
                         <button 
                            class="flex-1 h-12 border border-dashed border-border rounded-lg flex items-center justify-center text-sm text-text-muted hover:border-primary hover:text-primary transition-colors focus:outline-none"
                            (click)="avatarInput.click()"
                         >
                            Upload Photo
                         </button>
                         <input #avatarInput type="file" class="hidden" accept="image/*" (change)="onAvatarUpload($event)">
                     </div>
                 </div>
            </div>

            <div class="h-px bg-border"></div>

            <!-- Appearance -->
            <div class="space-y-4">
                 <h3 class="text-sm font-semibold text-text uppercase tracking-wider">Appearance</h3>
                 
                 <div class="grid grid-cols-2 gap-4">
                     <div class="space-y-2">
                         <label class="block text-sm font-medium text-text-muted">Background</label>
                         <div class="flex items-center gap-2">
                             <input type="color" [(ngModel)]="backgroundColor" class="h-10 w-full rounded cursor-pointer">
                         </div>
                     </div>
                     
                     <div class="space-y-2">
                         <label class="block text-sm font-medium text-text-muted">Theme Color</label>
                         <div class="flex items-center gap-2">
                             <input type="color" [(ngModel)]="themeColor" class="h-10 w-full rounded cursor-pointer">
                         </div>
                     </div>
                 </div>

                 <div class="flex items-center gap-2">
                     <input type="checkbox" [(ngModel)]="showLogo" id="showLogo" class="rounded border-border text-primary focus:ring-primary bg-background">
                     <label for="showLogo" class="text-sm text-text font-medium select-none">Show Brand Logo</label>
                 </div>
                 
                 <div class="flex items-center gap-2">
                     <input type="checkbox" [(ngModel)]="darkText" id="darkText" class="rounded border-border text-primary focus:ring-primary bg-background">
                     <label for="darkText" class="text-sm text-text font-medium select-none">Dark Text Mode</label>
                 </div>
            </div>

             <div class="pt-4">
                 <ui-button variant="primary" [block]="true" (click)="downloadImage()" [disabled]="isGenerating()">
                     @if (isGenerating()) {
                         Generating...
                     } @else {
                         <div class="flex items-center justify-center gap-2">
                             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                               <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                             </svg>
                             Download PNG
                         </div>
                     }
                 </ui-button>
             </div>
         </ui-card>
      </div>

      <!-- Preview (Right) -->
      <div class="flex-1 min-w-0 bg-secondary/30 rounded-xl border border-border flex items-center justify-center p-8 overflow-hidden relative">
          
          <div class="absolute inset-0 pattern-grid opacity-5 pointer-events-none"></div>

          <!-- Scale Wrapper to fit screen -->
          <div class="origin-center transform scale-[0.4] sm:scale-[0.5] md:scale-[0.45] lg:scale-[0.6] xl:scale-[0.7] transition-transform duration-300 shadow-2xl">
              
              <!-- The Actual Card (1200x630) -->
              <div 
                #cardRef
                class="w-[1200px] h-[630px] relative flex flex-col p-16 justify-between overflow-hidden font-sans"
                [style.background]="backgroundColor()"
                [class.text-slate-900]="darkText()"
                [class.text-white]="!darkText()"
              >
                  <!-- Decorative Elements -->
                  <div class="absolute top-0 right-0 w-[600px] h-[600px] opacity-20 blur-3xl rounded-full translate-x-1/3 -translate-y-1/3 pointer-events-none"
                       [style.background]="themeColor()"></div>
                  <div class="absolute bottom-0 left-0 w-[500px] h-[500px] opacity-20 blur-3xl rounded-full -translate-x-1/3 translate-y-1/3 pointer-events-none"
                       [style.background]="themeColor()"></div>
                  
                  <!-- Top Bar -->
                  <div class="flex items-start justify-between relative z-10">
                      @if (showLogo()) {
                          <div class="flex items-center gap-4">
                              <div class="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg" 
                                  [style.background]="themeColor()"
                                  [class.text-white]="true">
                                  <span class="text-3xl font-bold">DF</span>
                              </div>
                              <span class="text-2xl font-bold tracking-tight opacity-90">DevFlare</span>
                          </div>
                      } @else {
                          <div></div>
                      }
                      
                      <div class="px-6 py-2 rounded-full border opacity-60 text-lg font-medium tracking-wide"
                           [class.border-slate-900]="darkText()"
                           [class.border-white]="!darkText()">
                          {{ category() }}
                      </div>
                  </div>

                  <!-- Main Content -->
                  <div class="space-y-6 max-w-4xl relative z-10">
                      <h1 class="text-7xl font-extrabold leading-[1.1] tracking-tight">
                          {{ title() }}
                      </h1>
                      <p class="text-3xl opacity-80 leading-relaxed max-w-3xl">
                          {{ description() }}
                      </p>
                  </div>

                  <!-- Footer / Author -->
                  <div class="flex items-center gap-6 relative z-10">
                      @if (authorAvatar()) {
                          <img [src]="authorAvatar()" class="w-24 h-24 rounded-full border-4 object-cover shadow-sm"
                               [class.border-slate-900]="darkText()"
                               [class.border-white]="!darkText()">
                      }
                      <div>
                          <p class="text-2xl font-bold">{{ authorName() }}</p>
                          <p class="text-xl opacity-70">@devflare_io</p>
                      </div>
                      
                      <!-- Brand Line -->
                      <div class="ml-auto h-2 w-32 rounded-full" [style.background]="themeColor()"></div>
                  </div>

              </div>

          </div>

      </div>
    </div>

    <!-- Styles for background pattern -->
    <style>
        .pattern-grid {
            background-image: radial-gradient(#64748b 1px, transparent 1px);
            background-size: 24px 24px;
        }
    </style>
  `
})
export class OgGeneratorComponent {
    title = signal('Designing Beautiful Social Cards');
    description = signal('Learn how to create engaging Open Graph images for your blog posts using Angular and Tailwind CSS.');
    category = signal('Blog Post');
    authorName = signal('Andrii Pap');
    authorAvatar = signal<string | null>(null);

    backgroundColor = signal('#0f172a'); // Slate 900
    themeColor = signal('#4f46e5'); // Indigo 600
    showLogo = signal(true);
    darkText = signal(false);

    isGenerating = signal(false);

    @ViewChild('cardRef') cardRef!: ElementRef<HTMLElement>;

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
            const dataUrl = await toPng(this.cardRef.nativeElement, {
                pixelRatio: 1, // 1:1 since we are drawing at 1200x630 logical pixels
                cacheBust: true,
            });

            const link = document.createElement('a');
            link.download = 'og-image.png';
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to generate image', err);
            alert('Failed to generate image. Please try again.');
        } finally {
            this.isGenerating.set(false);
        }
    }
}
