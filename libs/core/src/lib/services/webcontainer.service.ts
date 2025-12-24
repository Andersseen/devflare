import { Injectable, signal } from '@angular/core';
import { WebContainer } from '@webcontainer/api';

@Injectable({
    providedIn: 'root'
})
export class WebContainerService {
    private webcontainerInstance: WebContainer | null = null;

    // Signals for state
    public isInitialized = signal<boolean>(false);
    public isBooting = signal<boolean>(false);

    constructor() { }

    async boot(): Promise<void> {
        if (this.webcontainerInstance) return;

        this.isBooting.set(true);
        try {
            this.webcontainerInstance = await WebContainer.boot();
            this.isInitialized.set(true);
            console.log('WebContainer booted successfully');
        } catch (error) {
            console.error('Failed to boot WebContainer:', error);
            throw error;
        } finally {
            this.isBooting.set(false);
        }
    }

    async mount(files: Record<string, any>): Promise<void> {
        if (!this.webcontainerInstance) throw new Error('WebContainer not initialized');
        await this.webcontainerInstance.mount(files);
    }

    async run(command: string, args: string[], onOutput?: (data: string) => void): Promise<number> {
        if (!this.webcontainerInstance) throw new Error('WebContainer not initialized');

        const process = await this.webcontainerInstance.spawn(command, args);

        if (onOutput) {
            process.output.pipeTo(new WritableStream({
                write(data) {
                    onOutput(data);
                }
            }));
        }

        return process.exit;
    }

    async readFile(filePath: string): Promise<Uint8Array> {
        if (!this.webcontainerInstance) throw new Error('WebContainer not initialized');
        return this.webcontainerInstance.fs.readFile(filePath);
    }

    // Helper to create a simple file structure for testing/demo
    getMockFiles() {
        return {
            'package.json': {
                file: {
                    contents: JSON.stringify({
                        name: 'example-app',
                        type: 'module',
                        dependencies: {
                            'express': 'latest',
                            'nodemon': 'latest'
                        },
                        scripts: {
                            'start': 'nodemon index.js'
                        }
                    }, null, 2)
                }
            },
            'index.js': {
                file: {
                    contents: `
            import express from 'express';
            const app = express();
            const port = 3000;
            
            app.get('/', (req, res) => {
              res.send('Welcome to a WebContainers app!');
            });
            
            app.listen(port, () => {
              console.log(\`App is live at http://localhost:\${port}\`);
            });
          `
                }
            }
        };
    }
}
