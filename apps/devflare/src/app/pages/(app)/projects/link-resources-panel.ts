import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { VoltButton } from '@voltui/components';
import {
  RESOURCE_GROUPS,
  RESOURCE_TYPE_META,
  resourceKey,
  type CloudResourceRef,
  type LinkCandidateSection,
} from '@org/core';

/**
 * "Link resource": the account's resources this project does not own yet,
 * grouped Web / Compute / Storage, several at a time (spec 019).
 *
 * Native checkboxes inside one fieldset per group — the platform already gives
 * them labels, focus, Space to toggle and a group name for screen readers.
 *
 * A product the token cannot list says so ("R2 unavailable — Insufficient
 * permissions") instead of reading as an empty list, and a resource another
 * project owns is shown, disabled, with its owner — one resource, one project.
 */
@Component({
  selector: 'app-link-resources-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, VoltButton],
  template: `
    <form
      class="space-y-5 rounded-md border border-border bg-card p-4"
      aria-label="Link Cloudflare resources"
      (submit)="onSubmit($event)"
    >
      @for (group of groups(); track group.id) {
        <fieldset class="space-y-3">
          <legend class="text-sm font-semibold">{{ group.label }}</legend>

          @for (section of group.sections; track section.type) {
            <div class="space-y-1">
              <p
                class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {{ meta[section.type].label }}
              </p>

              @if (section.error) {
                <p
                  class="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
                  data-testid="link-section-unavailable"
                >
                  <lucide-icon name="lock" class="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span class="font-medium text-foreground"
                      >{{ meta[section.type].label }} unavailable</span
                    >
                    — {{ section.error }}
                  </span>
                </p>
              } @else if (!section.items.length) {
                <p class="text-sm text-muted-foreground">
                  No other {{ meta[section.type].plural }} on this account.
                </p>
              } @else {
                <ul class="grid gap-1 sm:grid-cols-2">
                  @for (
                    candidate of section.items;
                    track candidate.ref.resourceId
                  ) {
                    <li>
                      <label
                        class="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent"
                      >
                        <input
                          type="checkbox"
                          class="h-4 w-4 shrink-0 accent-primary"
                          [checked]="isSelected(candidate.ref)"
                          [disabled]="Boolean(candidate.owner) || busy()"
                          (change)="toggle(candidate.ref)"
                        />
                        <span class="truncate">{{ candidate.ref.name }}</span>
                        @if (candidate.owner; as owner) {
                          <span class="shrink-0 text-xs text-muted-foreground">
                            in {{ owner.project.name }}
                          </span>
                        }
                      </label>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        </fieldset>
      }

      <div
        class="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4"
      >
        <volt-button
          type="button"
          variant="ghost"
          size="sm"
          [disabled]="busy()"
          (click)="cancelled.emit()"
        >
          Cancel
        </volt-button>
        <volt-button
          type="submit"
          size="sm"
          [disabled]="busy() || !selected().size"
        >
          @if (busy()) {
            <lucide-icon name="loader" class="mr-1 h-4 w-4 animate-spin" />
          } @else {
            <lucide-icon name="link" class="mr-1 h-4 w-4" />
          }
          {{ submitLabel() }}
        </volt-button>
      </div>
    </form>
  `,
})
export class LinkResourcesPanel {
  readonly sections = input.required<LinkCandidateSection[]>();
  readonly busy = input(false);
  readonly submitted = output<CloudResourceRef[]>();
  readonly cancelled = output<void>();

  protected readonly meta = RESOURCE_TYPE_META;
  protected readonly Boolean = Boolean;
  protected readonly selected = signal(new Map<string, CloudResourceRef>());

  protected readonly groups = computed(() =>
    RESOURCE_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      sections: this.sections().filter((section) =>
        group.types.includes(section.type),
      ),
    })).filter((group) => group.sections.length),
  );

  protected readonly submitLabel = computed(() => {
    const count = this.selected().size;
    return count > 1 ? `Link ${count} resources` : 'Link resource';
  });

  protected isSelected(ref: CloudResourceRef): boolean {
    return this.selected().has(resourceKey(ref.type, ref.resourceId));
  }

  protected toggle(ref: CloudResourceRef): void {
    const key = resourceKey(ref.type, ref.resourceId);
    this.selected.update((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, ref);
      return next;
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    const refs = [...this.selected().values()];
    if (!refs.length) return;
    this.submitted.emit(refs);
  }

  /** Called by the page once a submission has been handled. */
  clear(): void {
    this.selected.set(new Map());
  }
}
