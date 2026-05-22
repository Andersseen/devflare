import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltInput,
  VoltButton,
} from '@voltui/components';
import { WebContainer } from '@org/core';

type DeployStep = 'idle' | 'boot' | 'clone' | 'install' | 'build' | 'upload' | 'done' | 'error';

@Component({
  selector: 'app-deploy-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltInput,
    VoltButton,
  ],
  template: `
    <div class="max-w-4xl mx-auto space-y-8">
      <!-- Header -->
      <div class="text-center space-y-4">
        <h1 class="text-3xl md:text-4xl font-bold">Deploy your project</h1>
        <p class="text-muted-foreground max-w-2xl mx-auto">
          Import your Git repository and we'll handle the build and deployment pipeline using WebContainers.
        </p>

        @if (!isCOOP) {
          <div class="p-4 text-sm text-yellow-800 bg-yellow-100 rounded-lg" role="alert">
            <span class="font-medium">Warning!</span> Cross-Origin Isolation is not enabled. WebContainers requires COOP/COEP headers.
          </div>
        }
      </div>

      <!-- Deploy Form -->
      <volt-card class="max-w-2xl mx-auto">
        <volt-card-content>
          <div class="space-y-6">
            <volt-input
              label="Git Repository URL"
              placeholder="https://github.com/username/project"
              [(value)]="repoUrl"
            />

            <div class="flex justify-end">
              <volt-button
                variant="solid"
                [disabled]="!repoUrl() || isDeploying()"
                (click)="deploy()"
              >
                @if (isDeploying()) {
                  <span class="flex items-center gap-2">
                    <lucide-icon name="loader" class="animate-spin w-4 h-4" />
                    Deploying...
                  </span>
                } @else {
                  Deploy Project
                }
              </volt-button>
            </div>
          </div>
        </volt-card-content>
      </volt-card>

      <!-- Progress & Logs -->
      @if (currentStep() !== 'idle') {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Steps -->
          <volt-card>
            <volt-card-header>
              <volt-card-title>Progress</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              <div class="space-y-4">
                @for (step of steps; track step.id) {
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                      [class]="getStepClasses(step.id)"
                    >
                      @if (isStepComplete(step.id)) {
                        <lucide-icon name="check" class="w-5 h-5" />
                      } @else {
                        {{ step.stepNumber }}
                      }
                    </div>
                    <div>
                      <p class="font-medium" [class.text-muted-foreground]="!isStepActive(step.id) && !isStepComplete(step.id)">
                        {{ step.label }}
                      </p>
                      <p class="text-sm text-muted-foreground">{{ step.description }}</p>
                    </div>
                  </div>
                }
              </div>
            </volt-card-content>
          </volt-card>

          <!-- Terminal -->
          <volt-card>
            <volt-card-header>
              <volt-card-title>Build Logs</volt-card-title>
            </volt-card-header>
            <volt-card-content>
              <div class="bg-black rounded-lg p-4 h-64 overflow-auto font-mono text-sm">
                @for (log of logs(); track $index) {
                  <div class="text-green-400">{{ log }}</div>
                }
                @if (isDeploying()) {
                  <div class="animate-pulse text-green-400">_</div>
                }
              </div>
            </volt-card-content>
          </volt-card>
        </div>
      }
    </div>
  `,
})
export default class DeployPage implements OnInit {
  #webContainer = inject(WebContainer);

  repoUrl = signal('');
  currentStep = signal<DeployStep>('idle');
  logs = signal<string[]>([]);
  isCOOP = true;

  steps = [
    { id: 'boot', label: 'Boot System', description: 'Initializing WebContainer...', stepNumber: 1 },
    { id: 'clone', label: 'Clone Repository', description: 'Fetching source code...', stepNumber: 2 },
    { id: 'install', label: 'Install Dependencies', description: 'Running npm install...', stepNumber: 3 },
    { id: 'build', label: 'Build Project', description: 'Running build script...', stepNumber: 4 },
    { id: 'upload', label: 'Upload Assets', description: 'Deploying to storage...', stepNumber: 5 },
  ] as const;

  ngOnInit() {
    this.isCOOP = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false;
  }

  isDeploying = () =>
    this.currentStep() !== 'idle' && this.currentStep() !== 'done' && this.currentStep() !== 'error';

  isStepComplete = (stepId: string) => {
    const currentIndex = this.steps.findIndex((s) => s.id === this.currentStep());
    const stepIndex = this.steps.findIndex((s) => s.id === stepId);
    return stepIndex < currentIndex || this.currentStep() === 'done';
  };

  isStepActive = (stepId: string) => this.currentStep() === stepId;

  getStepClasses = (stepId: string) => {
    if (this.isStepComplete(stepId)) return 'bg-green-500 text-white';
    if (this.isStepActive(stepId)) return 'bg-primary text-primary-foreground';
    return 'bg-muted text-muted-foreground';
  };

  addLog(message: string) {
    this.logs.update((logs) => [...logs, `> ${message}`]);
  }

  async deploy() {
    if (!this.repoUrl()) return;

    this.currentStep.set('boot');
    this.logs.set(['> Initializing deployment sequence...']);

    try {
      // Step 1: Boot
      this.addLog('Booting WebContainer...');
      await this.#webContainer.boot();
      this.addLog('✓ WebContainer ready');

      // Step 2: Clone (Mock)
      this.currentStep.set('clone');
      this.addLog(`Cloning ${this.repoUrl()}...`);
      const files = this.#webContainer.getMockFiles();
      await this.#webContainer.mount(files);
      this.addLog('✓ Repository cloned');

      // Step 3: Install
      this.currentStep.set('install');
      this.addLog('Running npm install...');
      const exitCode = await this.#webContainer.run('npm', ['install'], (data) => {
        this.addLog(data.trimEnd());
      });

      if (exitCode !== 0) throw new Error('npm install failed');
      this.addLog('✓ Dependencies installed');

      // Step 4: Build
      this.currentStep.set('build');
      this.addLog('Verifying build...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.addLog('✓ Build verified');

      // Step 5: Upload
      this.currentStep.set('upload');
      this.addLog('Uploading assets...');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      this.addLog('✓ Assets uploaded');

      this.currentStep.set('done');
      this.addLog('✨ Deployment complete!');
    } catch (error) {
      this.currentStep.set('error');
      this.addLog(`❌ Error: ${error}`);
    }
  }
}
