import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-screen-recorder',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-y-auto">
      <header class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Screen Recorder</h1>
        <p class="text-slate-500 dark:text-slate-400">Capture your screen and download as WebM.</p>
      </header>

      <div class="flex-1 flex flex-col p-6 gap-6 items-center">
        
        <!-- Controls -->
        <div class="w-full max-w-4xl bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center justify-between gap-4">
           <div class="flex items-center gap-4">
             <div class="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  id="micToggle"
                  [ngModel]="includeMic()" 
                  (ngModelChange)="includeMic.set($event)"
                  [disabled]="isRecording()"
                  class="rounded border-slate-300 text-red-600 focus:ring-red-500 w-5 h-5">
                <label for="micToggle" class="text-sm font-medium text-slate-700 dark:text-slate-300 select-none">Include Microphone</label>
             </div>
             @if (isRecording()) {
                <span class="flex items-center gap-2 text-red-500 font-bold animate-pulse">
                    <span class="w-3 h-3 rounded-full bg-red-500"></span>
                    Recording...
                </span>
             }
           </div>

           <div class="flex items-center gap-3">
             @if (!isRecording() && !downloadUrl()) {
                <button 
                  (click)="startRecording()"
                  class="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:shadow active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  Start Recording
                </button>
             } @else if (isRecording()) {
                <button 
                  (click)="stopRecording()"
                  class="px-6 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 dark:hover:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:shadow active:scale-95">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  Stop Recording
                </button>
             }

             @if (downloadUrl()) {
               <div class="flex gap-2">
                  <button 
                    (click)="downloadVideo()"
                    class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-sm hover:shadow active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                    Download WebM
                  </button>
                  <button 
                    (click)="reset()"
                    class="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 font-medium rounded-lg transition-colors">
                    New Recording
                  </button>
               </div>
             }
           </div>
        </div>

        <!-- Preview Area -->
        <div class="w-full max-w-4xl flex-1 bg-black rounded-xl overflow-hidden shadow-lg relative aspect-video flex items-center justify-center border border-slate-800">
           @if (!streamActive() && !downloadUrl()) {
             <div class="text-center text-slate-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-4 opacity-50"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <p>Preview will appear here when you start recording</p>
             </div>
           }
           
           <video #previewVideo [hidden]="!streamActive() && !downloadUrl()" class="w-full h-full object-contain" autoplay playsinline [muted]="isRecording() || !downloadUrl()" controls></video>
        </div>
        
        @if (errorMsg()) {
          <div class="w-full max-w-4xl p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {{ errorMsg() }}
          </div>
        }

      </div>
    </div>
  `,
    styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class ScreenRecorderComponent {
    @ViewChild('previewVideo') videoElement!: ElementRef<HTMLVideoElement>;

    isRecording = signal(false);
    streamActive = signal(false);
    includeMic = signal(false);
    downloadUrl = signal<string | null>(null);
    errorMsg = signal<string | null>(null);

    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private stream: MediaStream | null = null;

    async startRecording() {
        this.errorMsg.set(null);
        this.downloadUrl.set(null); // Clear previous recording

        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { mediaSource: 'screen' } as any,
                audio: false // System audio is handled differently or not supported well across browsers with displayMedia
            });

            let tracks = [...displayStream.getTracks()];

            if (this.includeMic()) {
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    tracks = [...tracks, ...audioStream.getAudioTracks()];
                } catch (err) {
                    console.warn('Microphone access denied or failed', err);
                    this.errorMsg.set('Could not access microphone. Recording video only.');
                }
            }

            this.stream = new MediaStream(tracks);

            // Show preview
            if (this.videoElement?.nativeElement) {
                this.videoElement.nativeElement.srcObject = this.stream;
                this.streamActive.set(true);
            }

            // Handle stream stop (user clicks "Stop sharing" in browser UI)
            displayStream.getVideoTracks()[0].onended = () => {
                if (this.isRecording()) {
                    this.stopRecording();
                }
            };

            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'video/webm'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                this.downloadUrl.set(url);
                this.streamActive.set(false);

                // Show recorded video in preview
                if (this.videoElement?.nativeElement) {
                    this.videoElement.nativeElement.srcObject = null;
                    this.videoElement.nativeElement.src = url;
                    this.videoElement.nativeElement.play(); // Auto-play result
                }

                this.stopStream();
            };

            this.recordedChunks = [];
            this.mediaRecorder.start();
            this.isRecording.set(true);

        } catch (err: any) {
            console.error('Error starting recording:', err);
            this.errorMsg.set('Failed to start recording: ' + err.message);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            this.isRecording.set(false);
        }
    }

    downloadVideo() {
        const url = this.downloadUrl();
        if (url) {
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                // window.URL.revokeObjectURL(url); // Keep it for re-download until reset
            }, 100);
        }
    }

    reset() {
        this.downloadUrl.set(null);
        this.streamActive.set(false);
        if (this.videoElement?.nativeElement) {
            this.videoElement.nativeElement.src = '';
        }
    }

    private stopStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
}
