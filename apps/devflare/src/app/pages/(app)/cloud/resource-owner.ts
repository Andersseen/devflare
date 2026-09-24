import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { VoltButton } from '@voltui/components';
import {
  Projects,
  RESOURCE_TYPE_META,
  resourceKey,
  type ProjectResourceType,
} from '@org/core';

let nextId = 0;

/**
 * Which project owns a raw Cloudflare resource, shown where the Cloud section
 * lists it (spec 019) — and, when none does, a way to link it to one.
 *
 * Linking goes through `Projects.linkResource`, the same verified API as the
 * project page's "Link resource": one relationship model, several entry points.
 *
 * `compact` is for list rows; the full form is for a resource's own page.
 */
@Component({
  selector: 'app-resource-owner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule, VoltButton],
  template: `
    <div
      class="flex flex-wrap items-center gap-2 text-sm"
      [class.text-xs]="compact()"
      data-testid="resource-owner"
    >
      @if (owner(); as owned) {
        <span class="text-muted-foreground">Project:</span>
        <a
          [routerLink]="['/projects', owned.project.id]"
          class="font-medium text-primary hover:underline"
          >{{ owned.project.name }}</a
        >
      } @else if (projects.loaded()) {
        <span class="text-muted-foreground">Not linked to a project</span>
        @if (!choosing()) {
          @if (projects.list()?.length) {
            <volt-button size="sm" variant="ghost" (click)="choosing.set(true)">
              <lucide-icon name="link" class="mr-1 h-3.5 w-3.5" />
              Link<span class="sr-only">&#32;{{ name() }}</span> to project
            </volt-button>
          } @else {
            <a routerLink="/" class="text-primary hover:underline"
              >Create a project</a
            >
          }
        } @else {
          <label [for]="selectId" class="sr-only"
            >Project for {{ name() }}</label
          >
          <select
            [id]="selectId"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm"
            [value]="target()"
            (change)="onTarget($event)"
          >
            <option value="">Choose a project…</option>
            @for (project of projects.list() ?? []; track project.id) {
              <option [value]="project.id">{{ project.name }}</option>
            }
          </select>
          <volt-button
            size="sm"
            [disabled]="!target() || busy()"
            (click)="link()"
          >
            Link
          </volt-button>
          <volt-button
            size="sm"
            variant="ghost"
            [disabled]="busy()"
            (click)="cancel()"
          >
            Cancel
          </volt-button>
        }
      }
      @if (error()) {
        <p role="alert" class="basis-full text-red-600 dark:text-red-400">
          {{ error() }}
        </p>
      }
    </div>
  `,
})
export class ResourceOwner {
  readonly type = input.required<ProjectResourceType>();
  /** The stable id: script/Pages/bucket name, D1 uuid, KV namespace id. */
  readonly resourceId = input.required<string>();
  /** Shown in labels; defaults to the id. */
  readonly label = input<string | null>(null);
  readonly compact = input(false);

  protected readonly projects = inject(Projects);

  protected readonly selectId = `resource-owner-${nextId++}`;
  protected readonly choosing = signal(false);
  protected readonly target = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly name = computed(() => this.label() ?? this.resourceId());

  protected readonly owner = computed(
    () =>
      this.projects
        .ownership()
        .get(resourceKey(this.type(), this.resourceId())) ?? null,
  );

  constructor() {
    afterNextRender(() => {
      // Quietly nothing when the list cannot be read: ownership is extra
      // information here, not what the Cloud page is for.
      this.projects.ensureLoaded().catch(() => undefined);
    });
  }

  protected onTarget(event: Event): void {
    this.target.set((event.target as HTMLSelectElement).value);
  }

  protected cancel(): void {
    this.choosing.set(false);
    this.target.set('');
    this.error.set('');
  }

  protected async link(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.projects.linkResource(this.target(), {
        type: this.type(),
        resourceId: this.resourceId(),
      });
      this.cancel();
    } catch (error: unknown) {
      this.error.set(
        error instanceof Error
          ? error.message
          : `Could not link this ${RESOURCE_TYPE_META[this.type()].noun}`,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
