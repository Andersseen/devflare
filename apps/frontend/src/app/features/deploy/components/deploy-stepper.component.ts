import { Component, input } from '@angular/core';

@Component({
    selector: 'app-deploy-stepper',
    standalone: true,
    template: `
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-text">Deployment Progress</h3>
      <div class="space-y-4">
        @for (step of steps(); track step.id) {
          <div class="flex items-center gap-4 p-3 rounded-lg border transition-colors duration-300"
               [class.bg-background]="!isActive(step.id) && !isCompleted(step.id)"
               [class.border-border]="!isActive(step.id)"
               [class.bg-accent]="isActive(step.id)"
               [class.border-indigo-200]="isActive(step.id)"
               [class.dark:border-indigo-500_30]="isActive(step.id)"
               [class.bg-green-50]="isCompleted(step.id)"
               [class.dark:bg-green-900_20]="isCompleted(step.id)"
               [class.border-green-200]="isCompleted(step.id)"
               [class.dark:border-green-500_30]="isCompleted(step.id)"
          >
              <div class="flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-colors duration-300"
                   [class.bg-secondary]="!isActive(step.id) && !isCompleted(step.id)"
                   [class.text-text-muted]="!isActive(step.id) && !isCompleted(step.id)"
                   [class.bg-primary]="isActive(step.id)"
                   [class.text-primary-foreground]="isActive(step.id)"
                   [class.bg-success]="isCompleted(step.id)"
                   [class.text-success-foreground]="isCompleted(step.id)"
              >
                  @if (isCompleted(step.id)) {
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                          <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
                      </svg>
                  } @else if (isActive(step.id)) {
                      <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                  } @else {
                      <span class="text-sm font-medium">{{ step.stepNumber }}</span>
                  }
              </div>
              <div>
                  <p class="text-sm font-medium text-text">{{ step.label }}</p>
                  <p class="text-xs text-text-muted">{{ step.description }}</p>
              </div>
          </div>
        }
      </div>
    </div>
  `
})
export class DeployStepperComponent {
    steps = input.required<{ id: string, label: string, description: string, stepNumber: number }[]>();
    currentStep = input.required<string>();

    isActive(stepId: string): boolean {
        return this.currentStep() === stepId;
    }

    isCompleted(stepId: string): boolean {
        const stepOrder = ['idle', 'boot', 'clone', 'install', 'build', 'upload', 'done'];
        const currentIndex = stepOrder.indexOf(this.currentStep());
        const stepIndex = stepOrder.indexOf(stepId);
        return currentIndex > stepIndex || this.currentStep() === 'done';
    }
}
