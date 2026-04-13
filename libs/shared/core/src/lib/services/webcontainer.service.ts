import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
  providedIn: 'root',
})
export class WebContainerService {
  private webcontainerInstance: WebContainer | null = null;

  isInitialized = signal<boolean>(false);
  isBooting = signal<boolean>(false);
  bootError = signal<string | null>(null);

  async boot(): Promise<void> {
    if (this.webcontainerInstance) return;

    this.isBooting.set(true);
    this.bootError.set(null);

    try {
      this.webcontainerInstance = await WebContainer.boot();
      this.isInitialized.set(true);
      console.log('[WebContainer] Booted successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.bootError.set(errorMsg);
      console.error('[WebContainer] Boot failed:', error);
      throw error;
    } finally {
      this.isBooting.set(false);
    }
  }

  async mount(files: Record<string, any>): Promise<void> {
    if (!this.webcontainerInstance) {
      throw new Error('WebContainer not initialized');
    }
    await this.webcontainerInstance.mount(files);
  }

  async run(
    command: string,
    args: string[],
    onOutput?: (data: string) => void
  ): Promise<number> {
    if (!this.webcontainerInstance) {
      throw new Error('WebContainer not initialized');
    }

    const process = await this.webcontainerInstance.spawn(command, args);

    if (onOutput) {
      process.output.pipeTo(
        new WritableStream({
          write(data) {
            onOutput(data);
          },
        })
      );
    }

    return process.exit;
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    if (!this.webcontainerInstance) {
      throw new Error('WebContainer not initialized');
    }
    return this.webcontainerInstance.fs.readFile(filePath);
  }

  async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    if (!this.webcontainerInstance) {
      throw new Error('WebContainer not initialized');
    }
    await this.webcontainerInstance.fs.writeFile(filePath, content);
  }

  getMockFiles(): Record<string, any> {
    return {
      'package.json': {
        file: {
          contents: JSON.stringify(
            {
              name: 'example-app',
              type: 'module',
              dependencies: {
                express: 'latest',
                nodemon: 'latest',
              },
              scripts: {
                start: 'nodemon index.js',
              },
            },
            null,
            2
          ),
        },
      },
      'index.js': {
        file: {
          contents: `
import express from 'express';
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Hello from WebContainer!');
});

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`);
});
          `,
        },
      },
    };
  }
}
