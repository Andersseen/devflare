import { Component, output, signal } from '@angular/core';

@Component({
  selector: 'app-uploader',
  standalone: true,
  template: `
    <div 
      class="border-2 border-dashed border-border rounded-xl p-12 text-center 
             transition-all duration-200 ease-in-out cursor-pointer"
      [class.border-primary]="isDragging()"
      [class.bg-primary/5]="isDragging()"
      [class.hover:border-primary/50]="!isDragging()"
      [class.hover:bg-background]="!isDragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      (click)="fileInput.click()"
    >
      <input 
        #fileInput 
        type="file" 
        class="hidden" 
        accept="image/png, image/jpeg, image/webp"
        (change)="onFileSelected($event)"
      />
      <div class="flex flex-col items-center gap-4 pointer-events-none">
        <div class="p-4 bg-primary/10 rounded-full text-primary ring-4 ring-primary/5">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
        </div>
        <div>
          <h3 class="text-lg font-semibold text-text">Click to upload or drag and drop</h3>
          <p class="text-sm text-text-muted mt-1">PNG, JPG or WEBP</p>
        </div>
      </div>
    </div>
  `
})
export class UploaderComponent {
  fileDropped = output<File>();
  isDragging = signal(false);

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File) {
    if (file.type.startsWith('image/')) {
      this.fileDropped.emit(file);
    } else {
      // In a real app, use a toast
      alert('Please upload an image file');
    }
  }
}
