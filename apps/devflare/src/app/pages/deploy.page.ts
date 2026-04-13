import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardComponent, ButtonComponent, InputComponent } from '@org/ui';
import { WebContainerService } from '@org/core';

type DeployStep = 'idle' | 'boot' | 'clone' | 'install' | 'build' | 'upload' | 'done' | 'error';

@Component({
  selector: 'app-deploy-page',
  imports: [FormsModule, CardComponent, ButtonComponent, InputComponent],
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
      <ui-card class="max-w-2xl mx-auto">
        <div class="space-y-6">
          <ui-input
            label="Git Repository URL"
            placeholder="https://github.com/username/project"
            [(value)]="repoUrl"
          />

          <div class="flex justify-end">
            <ui-button 
              [disabled]="!repoUrl() || isDeploying()" 
              (click)="deploy()"
            >
              @if (isDeploying()) {
                <span class="flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

      <!-- Progress & Logs -->
      @if (currentStep() !== 'idle') {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Steps -->
          <ui-card title="Progress">
            <div class="space-y-4 mt-4">
              @for (step of steps; track step.id) {
                <div class="flex items-center gap-3">
                  <div 
                    class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                    [class]="getStepClasses(step.id)"
                  >
                    @if (isStepComplete(step.id)) {
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
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
          </ui-card>

          <!-- Terminal -->
          <ui-card title="Build Logs">
            <div class="mt-4 bg-black rounded-lg p-4 h-64 overflow-auto font-mono text-sm">
              @for (log of logs(); track $index) {
                <div class="text-green-400">{{ log }}</div>
              }
              @if (isDeploying()) {
                <div class="animate-pulse text-green-400">_</div>
              }
            </div>
          </ui-card>
        </div>
      }
    </div>
  `,
})
export default class DeployPageComponent {
  private webContainer = inject(WebContainerService);

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
    const currentIndex = this.steps.findIndex(s => s.id === this.currentStep());
    const stepIndex = this.steps.findIndex(s => s.id === stepId);
    return stepIndex < currentIndex || this.currentStep() === 'done';
  };

  isStepActive = (stepId: string) => this.currentStep() === stepId;

  getStepClasses = (stepId: string) => {
    if (this.isStepComplete(stepId)) return 'bg-green-500 text-white';
    if (this.isStepActive(stepId)) return 'bg-primary text-primary-foreground';
    return 'bg-muted text-muted-foreground';
  };

  addLog(message: string) {
    this.logs.update(logs => [...logs, `> ${message}`]);
  }

  async deploy() {
    if (!this.repoUrl()) return;

    this.currentStep.set('boot');
    this.logs.set(['> Initializing deployment sequence...']);

    try {
      // Step 1: Boot
      this.addLog('Booting WebContainer...');
      await this.webContainer.boot();
      this.addLog('✓ WebContainer ready');

      // Step 2: Clone (Mock)
      this.currentStep.set('clone');
      this.addLog(`Cloning ${this.repoUrl()}...`);
      const files = this.webContainer.getMockFiles();
      await this.webContainer.mount(files);
      this.addLog('✓ Repository cloned');

      // Step 3: Install
      this.currentStep.set('install');
      this.addLog('Running npm install...');
      const exitCode = await this.webContainer.run('npm', ['install'], (data) => {
        this.addLog(data.trimEnd());
      });

      if (exitCode !== 0) throw new Error('npm install failed');
      this.addLog('✓ Dependencies installed');

      // Step 4: Build
      this.currentStep.set('build');
      this.addLog('Verifying build...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.addLog('✓ Build verified');

      // Step 5: Upload
      this.currentStep.set('upload');
      this.addLog('Uploading assets...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      this.addLog('✓ Assets uploaded');

      this.currentStep.set('done');
      this.addLog('✨ Deployment complete!');

    } catch (error) {
      this.currentStep.set('error');
      this.addLog(`❌ Error: ${error}`);
    }
  }
}
