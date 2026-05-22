import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ScreenRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  isRecording = signal(false);
  streamActive = signal(false);

  async startRecording(includeMic: boolean): Promise<MediaStream> {
    this.isRecording.set(false);
    this.recordedChunks = [];

    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { mediaSource: 'screen' } as any,
      audio: false,
    });

    let tracks = [...displayStream.getTracks()];

    if (includeMic) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tracks = [...tracks, ...audioStream.getAudioTracks()];
      } catch {
        // Silently ignore mic failure
      }
    }

    this.stream = new MediaStream(tracks);
    this.streamActive.set(true);

    // Auto-stop when user stops sharing
    displayStream.getVideoTracks()[0].onended = () => {
      if (this.isRecording()) {
        this.stopRecording();
      }
    };

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'video/webm' });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start();
    this.isRecording.set(true);

    return this.stream;
  }

  stopRecording(): Blob | null {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
    }

    this.stopStream();
    this.streamActive.set(false);

    if (this.recordedChunks.length === 0) return null;
    return new Blob(this.recordedChunks, { type: 'video/webm' });
  }

  downloadVideo(blob: Blob, filename?: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename || `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  private stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
