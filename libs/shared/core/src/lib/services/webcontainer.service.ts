import { Injectable, signal } from '@angular/core';
import { WebContainer as WebContainerApi } from '@webcontainer/api';

@Injectable({
  providedIn: 'root',
})
export class WebContainer {
  #instance: WebContainerApi | null = null;

  isInitialized = signal<boolean>(false);
  isBooting = signal<boolean>(false);
  bootError = signal<string | null>(null);

  async boot(): Promise<void> {
    if (this.#instance) return;

    this.isBooting.set(true);
    this.bootError.set(null);

    try {
      this.#instance = await WebContainerApi.boot();
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

  async mount(files: unknown): Promise<void> {
    if (!this.#instance) {
      throw new Error('WebContainer not initialized');
    }
    await this.#instance.mount(files as Parameters<WebContainerApi['mount']>[0]);
  }

  async run(
    command: string,
    args: string[],
    onOutput?: (data: string) => void
  ): Promise<number> {
    if (!this.#instance) {
      throw new Error('WebContainer not initialized');
    }

    const process = await this.#instance.spawn(command, args);

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
    if (!this.#instance) {
      throw new Error('WebContainer not initialized');
    }
    return this.#instance.fs.readFile(filePath);
  }

  async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    if (!this.#instance) {
      throw new Error('WebContainer not initialized');
    }
    await this.#instance.fs.writeFile(filePath, content);
  }

  getMockFiles(): unknown {
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
