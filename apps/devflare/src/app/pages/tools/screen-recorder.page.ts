import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScreenRecorder } from '@org/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltSwitch,
  VoltBadge,
} from '@voltui/components';

@Component({
  selector: 'app-screen-recorder-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltSwitch,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Screen Recorder</h1>
        <p class="text-muted-foreground mt-1">
          Record your screen directly from the browser
        </p>
      </div>

      <!-- Controls -->
      <volt-card>
        <volt-card-content>
          <div
            class="flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <volt-switch
                  id="includeMic"
                  [(checked)]="includeMic"
                  [disabled]="isRecording()"
                />
                <label for="includeMic" class="text-sm font-medium select-none"
                  >Include Microphone</label
                >
              </div>
              @if (isRecording()) {
                <volt-badge variant="destructive" class="animate-pulse">
                  <span class="w-2 h-2 rounded-full bg-white mr-1"></span>
                  Recording
                </volt-badge>
              }
            </div>

            <div class="flex items-center gap-3">
              @if (!isRecording() && !downloadUrl()) {
                <volt-button variant="destructive" (click)="startRecording()">
                  <lucide-icon name="circle" class="w-4 h-4 mr-1" />
                  Start Recording
                </volt-button>
              } @else if (isRecording()) {
                <volt-button variant="solid" (click)="stopRecording()">
                  <lucide-icon name="square" class="w-4 h-4 mr-1" />
                  Stop Recording
                </volt-button>
              }

              @if (downloadUrl()) {
                <div class="flex gap-2">
                  <volt-button variant="solid" (click)="downloadVideo()">
                    <lucide-icon name="download" class="w-4 h-4 mr-1" />
                    Download WebM
                  </volt-button>
                  <volt-button variant="outline" (click)="reset()"
                    >New Recording</volt-button
                  >
                </div>
              }
            </div>
          </div>
        </volt-card-content>
      </volt-card>

      <!-- Preview -->
      <div
        class="aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative flex items-center justify-center border border-border"
      >
        @if (!streamActive() && !downloadUrl()) {
          <div class="text-center text-muted-foreground">
            <lucide-icon
              name="monitor"
              class="w-16 h-16 mx-auto mb-4 opacity-50"
            />
            <p>Preview will appear here when you start recording</p>
          </div>
        }
        <video
          #previewVideo
          [hidden]="!streamActive() && !downloadUrl()"
          class="w-full h-full object-contain"
          autoplay
          playsinline
          [muted]="isRecording() || !downloadUrl()"
          controls
        ></video>
      </div>

      @if (errorMsg()) {
        <div
          class="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm"
        >
          {{ errorMsg() }}
        </div>
      }
    </div>
  `,
})
export default class ScreenRecorderPage {
  @ViewChild('previewVideo') videoElement!: ElementRef<HTMLVideoElement>;

  isRecording = signal(false);
  streamActive = signal(false);
  includeMic = signal(false);
  downloadUrl = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  #recordedBlob: Blob | null = null;

  #screenRecorderService = inject(ScreenRecorder);

  async startRecording() {
    this.errorMsg.set(null);
    this.downloadUrl.set(null);
    this.#recordedBlob = null;

    try {
      const stream = await this.#screenRecorderService.startRecording(
        this.includeMic(),
      );

      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = stream;
        this.streamActive.set(true);
      }

      this.isRecording.set(true);

      stream.getVideoTracks()[0].onended = () => {
        if (this.isRecording()) {
          this.stopRecording();
        }
      };

      if (this.includeMic() && !stream.getAudioTracks().length) {
        this.errorMsg.set('Could not access microphone. Recording video only.');
      }
    } catch (err: unknown) {
      console.error('Error starting recording:', err);
      this.errorMsg.set(
        'Failed to start recording: ' +
          (err instanceof Error ? err.message : 'Unknown error'),
      );
    }
  }

  stopRecording() {
    this.#recordedBlob = this.#screenRecorderService.stopRecording();
    this.isRecording.set(false);

    if (this.#recordedBlob) {
      const url = URL.createObjectURL(this.#recordedBlob);
      this.downloadUrl.set(url);
      this.streamActive.set(false);

      if (this.videoElement?.nativeElement) {
        this.videoElement.nativeElement.srcObject = null;
        this.videoElement.nativeElement.src = url;
        this.videoElement.nativeElement.play();
      }
    }
  }

  downloadVideo() {
    if (this.#recordedBlob) {
      this.#screenRecorderService.downloadVideo(this.#recordedBlob);
    }
  }

  reset() {
    this.downloadUrl.set(null);
    this.streamActive.set(false);
    this.#recordedBlob = null;
    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.src = '';
    }
  }
}
