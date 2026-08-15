import {
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltError,
} from '@voltui/components';
import { CloudflareAccount, Projects, type Project } from '@org/core';
import {
  createHttpTransport,
  runDeploy,
  toDeployFiles,
  type AssetPlan,
  type DeployFile,
  type DeployProgress,
  type DeploymentResult,
} from '@org/deploy';
import { CloudGate } from './cloud/cloud-gate';

/**
 * Deploy a built folder to one of the account's Pages projects.
 *
 * This page used to mount `getMockFiles()` into a WebContainer and fake both
 * the build and the upload with `setTimeout`. It was doubly dead: no COOP/COEP
 * headers exist anywhere in this repo, so `crossOriginIsolated` is false in
 * production and WebContainers could never have booted at all.
 *
 * What replaced it does less and means it. DevFlare does not build anything —
 * you bring a folder that is already built — and every Pages project on this
 * account is a direct upload, so uploading is precisely the thing Cloudflare
 * cannot do for itself.
 */
@Component({
  selector: 'app-deploy-page',
  imports: [
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltError,
    CloudGate,
  ],
  template: `
    <div class="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Deploy</h1>
        <p class="text-muted-foreground mt-1">
          Upload a built folder straight to one of your Cloudflare Pages
          projects.
        </p>
      </div>

      <app-cloud-gate [status]="cloud.status()">
        @if (error()) {
          <volt-error class="mb-4">{{ error() }}</volt-error>
        }

        <volt-card>
          <volt-card-content class="space-y-6 pt-6">
            <!-- Target -->
            <div class="space-y-2">
              <label for="project" class="text-sm font-medium">
                Pages project
              </label>
              <select
                id="project"
                class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                [value]="target()"
                (change)="onTargetChange($event)"
                [disabled]="busy()"
              >
                <option value="">Choose a project…</option>
                @for (project of cloud.projects(); track project.name) {
                  <option [value]="project.name">{{ project.name }}</option>
                }
              </select>
              @if (!cloud.projects().length && !cloud.loading()) {
                <p class="text-sm text-muted-foreground">
                  This account has no Pages projects yet.
                </p>
              }
            </div>

            <!-- Attribution -->
            <div class="space-y-2">
              <label for="devflare-project" class="text-sm font-medium">
                Record against a DevFlare project
                <span class="text-muted-foreground font-normal">
                  (optional)</span
                >
              </label>
              <select
                id="devflare-project"
                class="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                [value]="projectId()"
                (change)="onProjectChange($event)"
                [disabled]="busy()"
              >
                <option value="">Don't record it</option>
                @for (project of projects(); track project.id) {
                  <option [value]="project.id">{{ project.name }}</option>
                }
              </select>
              <p class="text-sm text-muted-foreground">
                Cloudflare keeps the deployment either way. This adds it to the
                project's own history in DevFlare.
              </p>
            </div>

            <!-- Folder -->
            <div class="space-y-2">
              <span class="text-sm font-medium">Build output folder</span>
              <label
                class="flex flex-col items-center justify-center gap-2 py-8 px-4 border-2 border-dashed border-input rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
              >
                <lucide-icon
                  name="folder-up"
                  class="w-8 h-8 text-muted-foreground"
                />
                @if (picked().length) {
                  <span class="font-medium">
                    {{ picked().length }} files selected
                  </span>
                  <span class="text-sm text-muted-foreground">
                    {{ pickedRoot() }} — click to choose another
                  </span>
                } @else {
                  <span class="font-medium">Choose a folder</span>
                  <span class="text-sm text-muted-foreground">
                    The already-built output, e.g. <code>dist/browser</code>
                  </span>
                }
                <input
                  type="file"
                  class="hidden"
                  webkitdirectory
                  multiple
                  (change)="onFilesPicked($event)"
                  [disabled]="busy()"
                />
              </label>
            </div>

            @if (skipped().length) {
              <div class="text-sm text-muted-foreground space-y-1">
                <p class="font-medium text-foreground">
                  {{ skipped().length }} files will not be deployed
                </p>
                @for (item of skipped().slice(0, 5); track item.path) {
                  <p>
                    <code>{{ item.path }}</code>
                    @if (item.reason === 'functions') {
                      — Pages Functions are not supported here yet
                    } @else {
                      — build noise
                    }
                  </p>
                }
              </div>
            }

            <div class="flex justify-end">
              <volt-button
                variant="solid"
                [disabled]="!canDeploy()"
                (click)="deploy()"
              >
                @if (busy()) {
                  <lucide-icon
                    name="loader"
                    class="animate-spin w-4 h-4 mr-2"
                  />
                  Deploying…
                } @else {
                  Deploy
                }
              </volt-button>
            </div>
          </volt-card-content>
        </volt-card>

        <!-- Progress -->
        @if (progress(); as state) {
          <volt-card class="mt-6">
            <volt-card-header>
              <volt-card-title>Progress</volt-card-title>
            </volt-card-header>
            <volt-card-content class="space-y-4">
              <div class="space-y-3">
                @for (step of steps; track step.id) {
                  <div class="flex items-center gap-3">
                    <div
                      class="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                      [class]="stepClasses(step.id)"
                    >
                      @if (isComplete(step.id)) {
                        <lucide-icon name="check" class="w-4 h-4" />
                      } @else if (isActive(step.id)) {
                        <lucide-icon
                          name="loader"
                          class="w-4 h-4 animate-spin"
                        />
                      } @else {
                        <span class="text-xs">{{ $index + 1 }}</span>
                      }
                    </div>
                    <span
                      [class.text-muted-foreground]="
                        !isActive(step.id) && !isComplete(step.id)
                      "
                    >
                      {{ step.label }}
                    </span>
                  </div>
                }
              </div>

              <p class="text-sm text-muted-foreground">{{ state.message }}</p>

              @if (state.phase === 'uploading' && state.missing > 0) {
                <div class="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full bg-primary transition-all"
                    [style.width.%]="(state.uploaded / state.missing) * 100"
                  ></div>
                </div>
              }
            </volt-card-content>
          </volt-card>
        }

        <!-- Result -->
        @if (result(); as deployment) {
          <volt-card class="mt-6">
            <volt-card-content class="pt-6 space-y-3">
              <div class="flex items-center gap-2">
                <lucide-icon name="check-circle" class="w-5 h-5 text-primary" />
                <span class="font-medium">Deployment live</span>
              </div>
              <a
                [href]="deployment.url"
                target="_blank"
                rel="noreferrer"
                class="text-primary hover:underline break-all"
              >
                {{ deployment.url }}
              </a>
              @if (!deployment['recorded']) {
                <p class="text-sm text-muted-foreground">
                  Not recorded in DevFlare — no project was chosen.
                </p>
              }
            </volt-card-content>
          </volt-card>
        }
      </app-cloud-gate>
    </div>
  `,
})
export default class DeployPage {
  protected readonly cloud = inject(CloudflareAccount);
  readonly #projects = inject(Projects);
  readonly #transport = createHttpTransport();

  protected readonly projects = signal<Project[]>([]);
  protected readonly picked = signal<DeployFile[]>([]);
  protected readonly target = signal('');
  protected readonly projectId = signal('');
  protected readonly progress = signal<DeployProgress | null>(null);
  protected readonly result = signal<DeploymentResult | null>(null);
  protected readonly error = signal('');
  protected readonly skipped = signal<AssetPlan<DeployFile>['skipped']>([]);

  protected readonly steps = [
    { id: 'reading', label: 'Read and hash the folder' },
    { id: 'comparing', label: 'Ask Cloudflare what is new' },
    { id: 'uploading', label: 'Upload the new assets' },
    { id: 'publishing', label: 'Publish the deployment' },
  ] as const;

  protected readonly busy = computed(() => {
    const phase = this.progress()?.phase;
    return phase !== undefined && phase !== 'done' && phase !== 'error';
  });

  protected readonly canDeploy = computed(
    () => Boolean(this.target()) && this.picked().length > 0 && !this.busy(),
  );

  /** The chosen folder's own name, which every picked path is prefixed with. */
  protected readonly pickedRoot = computed(
    () => this.picked()[0]?.path.split('/')[0] ?? '',
  );

  constructor() {
    // Same reason projects.page.ts does this: there is no session during SSR,
    // so fetching on the server only produces a failed request.
    afterNextRender(() => void this.load());
  }

  async load(): Promise<void> {
    const status = await this.cloud.loadStatus();
    if (!status.admin || !status.configured) return;

    await this.cloud.loadOverview();

    try {
      this.projects.set(await this.#projects.getProjects());
    } catch {
      // Attribution is optional; failing to list projects must not stop a
      // deploy that does not need one.
      this.projects.set([]);
    }
  }

  protected onTargetChange(event: Event): void {
    this.target.set((event.target as HTMLSelectElement).value);
  }

  protected onProjectChange(event: Event): void {
    this.projectId.set((event.target as HTMLSelectElement).value);
  }

  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.picked.set(toDeployFiles(input.files ?? []));
    this.skipped.set([]);
    this.result.set(null);
    this.progress.set(null);
    this.error.set('');
  }

  protected async deploy(): Promise<void> {
    if (!this.canDeploy()) return;

    this.error.set('');
    this.result.set(null);

    const project = this.cloud
      .projects()
      .find((candidate) => candidate.name === this.target());

    try {
      const deployment = await runDeploy({
        project: this.target(),
        files: this.picked(),
        transport: this.#transport,
        branch: project?.productionBranch,
        commitMessage: 'Uploaded from DevFlare',
        projectId: this.projectId() || undefined,
        onProgress: (progress) => this.progress.set(progress),
        onPlanned: (plan) => this.skipped.set(plan.skipped),
      });

      this.result.set(deployment);
    } catch (error) {
      this.progress.update((current) =>
        current ? { ...current, phase: 'error' } : current,
      );
      this.error.set(
        error instanceof Error ? error.message : 'The deployment failed',
      );
    }
  }

  protected isComplete(step: string): boolean {
    const phase = this.progress()?.phase;
    if (!phase) return false;
    if (phase === 'done') return true;
    if (phase === 'error') return false;

    const order = this.steps.map((s) => s.id) as readonly string[];
    return order.indexOf(step) < order.indexOf(phase);
  }

  protected isActive(step: string): boolean {
    return this.progress()?.phase === step;
  }

  protected stepClasses(step: string): string {
    if (this.isComplete(step)) return 'bg-primary text-primary-foreground';
    if (this.isActive(step)) return 'bg-primary/20 text-primary';
    return 'bg-muted text-muted-foreground';
  }
}
