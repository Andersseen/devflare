import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '@ui-components/button.component';
import { CardComponent } from '@ui-components/card.component';
import { WebContainerService } from '@core-services/webcontainer.service';
import { DeployStepperComponent } from './components/deploy-stepper.component';
import { DeployTerminalComponent } from './components/deploy-terminal.component';

type DeployStep = 'idle' | 'boot' | 'clone' | 'install' | 'build' | 'upload' | 'done' | 'error';

@Component({
    selector: 'app-deploy',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, CardComponent, ButtonComponent, DeployStepperComponent, DeployTerminalComponent],
    template: `
    <div class="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
       
       <div class="text-center space-y-4 mb-8">
           <h2 class="text-3xl md:text-5xl font-extrabold text-text tracking-tight">Deploy your next big idea.</h2>
           <p class="text-lg text-text-muted max-w-2xl mx-auto">
               Import your Git repository and we'll handle the build and deployment pipeline for you using WebContainers.
           </p>

            @if (!isCOOP) {
                <div class="p-4 mb-4 text-sm text-warning-foreground rounded-lg bg-warning" role="alert">
                    <span class="font-medium">Warning!</span> Cross-Origin Isolation is not enabled. WebContainers requires COOP/COEP headers to function. Local development may fail without them.
                </div>
            }
       </div>

       <ui-card class="max-w-2xl mx-auto overflow-visible relative">
           <!-- Decorative glow -->
           <div class="absolute -top-10 -left-10 w-32 h-32 bg-primary blur-3xl rounded-full opacity-10"></div>
           <div class="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500 blur-3xl rounded-full opacity-10"></div>

           <div class="space-y-6 relative z-10">
               <div>
                   <label for="repo" class="block text-sm font-medium text-text">Git Repository URL</label>
                   <div class="mt-2 flex shadow-sm rounded-md">
                        <span class="inline-flex items-center rounded-l-md border border-r-0 border-border bg-background px-3 text-text-muted sm:text-sm">
                            <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
                            </svg>
                        </span>
                        <input 
                            type="text" 
                            name="repo" 
                            id="repo" 
                            [(ngModel)]="repoUrl"
                            [disabled]="isDeploying()"
                            placeholder="https://github.com/username/project"
                            class="block w-full min-w-0 flex-1 rounded-none rounded-r-md border-border px-3 py-2 text-text placeholder-text-muted focus:border-primary focus:ring-primary bg-surface sm:text-sm"
                        >
                   </div>
                   <p class="mt-2 text-xs text-text-muted">For demo purposes, a Hello World project will be scaffolded.</p>
               </div>

               <div class="flex justify-end">
                   <ui-button [disabled]="!repoUrl() || isDeploying()" (click)="deploy()">
                       @if (isDeploying()) {
                           <span class="flex items-center gap-2">
                               <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                   <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                   <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                               </svg>
                               Deploying...
                           </span>
                       } @else {
                           Deploy Project
                       }
                   </ui-button>
               </div>
           </div>
       </ui-card>

       <!-- Progress & Terminal -->
       @if (currentStep() !== 'idle') {
           <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto">
               <app-deploy-stepper [steps]="steps" [currentStep]="currentStep()" />
               <app-deploy-terminal [logs]="logs()" [isDeploying]="isDeploying()" />
           </div>
       }
    </div>
  `
})
export class DeployComponent implements OnInit {
    repoUrl = signal('');
    currentStep = signal<DeployStep>('idle');
    logs = signal<string[]>([]);
    isCOOP = true;

    private webContainer = inject(WebContainerService);

    steps: { id: DeployStep, label: string, description: string, stepNumber: number }[] = [
        { id: 'boot', label: 'Boot System', description: 'Initializing WebContainer core...', stepNumber: 1 },
        { id: 'clone', label: 'Clone Repository', description: 'Fetching source code...', stepNumber: 2 },
        { id: 'install', label: 'Install Dependencies', description: 'Running npm install...', stepNumber: 3 },
        { id: 'build', label: 'Build Project', description: 'Running build script...', stepNumber: 4 },
        { id: 'upload', label: 'Upload Assets', description: 'Deploying to global edge...', stepNumber: 5 }
    ];

    ngOnInit() {
        this.isCOOP = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false;
        if (!this.isCOOP) {
            this.addLog('WARNING: System is not Cross-Origin Isolated.');
            this.addLog('WebContainers will likely fail to boot.');
        }
    }

    isDeploying() {
        return this.currentStep() !== 'idle' && this.currentStep() !== 'done' && this.currentStep() !== 'error';
    }

    addLog(message: string) {
        this.logs.update(logs => [...logs, message]);
    }

    async deploy() {
        if (!this.repoUrl()) return;

        this.currentStep.set('boot');
        this.logs.set(['> Initializing deployment sequence...']);

        try {
            // Step 1: Boot
            this.addLog('> Booting WebContainer...');
            await this.webContainer.boot();
            this.addLog('✔ WebContainer booted successfully.');

            // Step 2: Clone (Mock)
            this.currentStep.set('clone');
            this.addLog(`> Cloning ${this.repoUrl()}...`);
            // In a real scenario, we would stream fetch the zip and unzip it.
            // For MVP, we use the mock files provided by the service.
            const files = this.webContainer.getMockFiles();
            await this.webContainer.mount(files);
            this.addLog('✔ Repository cloned (simulated).');
            this.addLog('File system mounted.');

            // Step 3: Install
            this.currentStep.set('install');
            this.addLog('> Running npm install...');
            const exitCodeInstall = await this.webContainer.run('npm', ['install'], (data) => {
                this.addLog(data.trimEnd());
            });

            if (exitCodeInstall !== 0) {
                throw new Error('npm install failed');
            }
            this.addLog('✔ Dependencies installed.');

            // Step 4: Build (Skipping actual build for simple node example, checking version instead)
            this.currentStep.set('build');
            this.addLog('> Verifying Node version...');
            const exitCodeBuild = await this.webContainer.run('node', ['-v'], (data) => {
                this.addLog(data.trimEnd());
            });
            if (exitCodeBuild !== 0) {
                throw new Error('Build failed');
            }
            this.addLog('✔ Build verified (Mock Step).');

            // Step 5: Upload
            this.currentStep.set('upload');
            this.addLog('> Compressing assets...');
            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate mock work
            this.addLog('> Uploading to Storage...');
            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate mock work
            this.addLog('✔ Assets uploaded.');

            this.currentStep.set('done');
            this.addLog('✨ Deployment Complete!');

        } catch (error) {
            console.error(error);
            this.currentStep.set('error');
            this.addLog(`❌ Error: ${error}`);
        }
    }
}

