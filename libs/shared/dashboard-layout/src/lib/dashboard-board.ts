import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  type TemplateRef,
} from '@angular/core';
import {
  DraggableDirective,
  DropZoneDirective,
  type QzDragOverInfo,
  type QzDropInfo,
} from '@quartz-headless/core';
import { LucideAngularModule } from 'lucide-angular';
import {
  MAX_GROUPS,
  UNGROUPED,
  addGroup,
  deleteGroup,
  hideItem,
  isPinned,
  moveGroup,
  moveItem,
  nudgeItem,
  renameGroup,
  sectionOf,
  showItem,
  togglePin,
  type DashboardLayout,
} from './layout';
import { dropIndexFromPoint } from './drop-index';

export interface BoardItemContext {
  $implicit: string;
  editing: boolean;
}

interface Section {
  id: string;
  name: string;
  ids: string[];
  named: boolean;
}

const DRAG_TYPE = 'dashboard-item';

/**
 * The editing surface shared by DevFlare and DevRadar (spec 022).
 *
 * Normal mode renders the groups and the products' own cards, nothing else.
 * Edit mode adds, per card, a grip (pointer drag via Quartz `qzDraggable` /
 * `qzDropZone`) and buttons that do everything dragging does — Move up/down,
 * Move to group, Hide, Pin — because native HTML drag-and-drop has no keyboard
 * mode and is not guaranteed on touch. Groups can be added, renamed, reordered
 * and deleted; hidden items sit in a tray with Restore.
 *
 * The board owns no state: it emits the next `DashboardLayout` and the page's
 * `LayoutEditor` decides. Cards are supplied by the product as a template; in
 * edit mode the product should render them as non-navigating.
 */
@Component({
  selector: 'dash-board',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    LucideAngularModule,
    DraggableDirective,
    DropZoneDirective,
  ],
  template: `
    <div class="space-y-8" data-testid="dashboard-board">
      @for (section of sections(); track section.id) {
        <section
          [attr.aria-labelledby]="'dash-h-' + section.id"
          [attr.data-testid]="'section-' + section.id"
          class="space-y-3"
        >
          @if (editing() || section.named || hasGroups()) {
            <div class="flex flex-wrap items-center gap-2">
              @if (editing() && section.named) {
                <input
                  class="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
                  [id]="'dash-h-' + section.id"
                  [value]="section.name"
                  maxlength="40"
                  aria-label="Group name"
                  data-testid="group-name"
                  (change)="rename(section.id, $event)"
                  (keydown.enter)="blur($event)"
                />
                <button
                  type="button"
                  class="ctl"
                  aria-label="Move group up"
                  [disabled]="isFirstGroup(section.id)"
                  (click)="emit(moveGroupBy(section.id, -1))"
                >
                  <lucide-icon name="arrow-up" class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="ctl"
                  aria-label="Move group down"
                  [disabled]="isLastGroup(section.id)"
                  (click)="emit(moveGroupBy(section.id, 1))"
                >
                  <lucide-icon name="arrow-down" class="h-4 w-4" />
                </button>
                <button
                  type="button"
                  class="ctl"
                  aria-label="Delete group"
                  title="Delete group (its items move to {{
                    ungroupedLabel()
                  }})"
                  data-testid="delete-group"
                  (click)="emit(deleteGroupById(section.id))"
                >
                  <lucide-icon name="trash-2" class="h-4 w-4" />
                </button>
              } @else {
                <h2 [id]="'dash-h-' + section.id" class="text-lg font-semibold">
                  {{ section.name }}
                </h2>
              }
              <span class="text-sm text-muted-foreground">{{
                section.ids.length
              }}</span>
            </div>
          }

          <div
            class="min-h-16 rounded-lg transition-shadow motion-reduce:transition-none"
            [class]="gridClass()"
            [class.ring-1]="editing()"
            [class.ring-border]="editing()"
            [class.ring-offset-8]="editing()"
            [class.ring-offset-background]="editing()"
            qzDropZone
            [qzDropZoneDisabled]="!editing()"
            [qzDropZoneAccept]="dragTypes"
            (qzDragOver)="onOver(section.id, $event)"
            (qzDragLeave)="onLeave(section.id)"
            (qzDrop)="onDrop(section.id, $event)"
            [attr.data-testid]="'zone-' + section.id"
          >
            @for (
              id of section.ids;
              track id;
              let i = $index;
              let last = $last
            ) {
              <div
                class="dash-item relative rounded-lg"
                data-dnd-item
                [attr.data-item-id]="id"
                [attr.data-testid]="'item-' + id"
                [attr.data-drop]="dropMark(section.id, i, last)"
                qzDraggable
                [qzDraggableData]="{ id }"
                [qzDraggableType]="dragType"
                [qzDraggableDisabled]="!editing()"
                (qzDragStart)="dragging.set(id)"
                (qzDragEnd)="endDrag()"
              >
                <ng-container
                  *ngTemplateOutlet="
                    itemTemplate();
                    context: { $implicit: id, editing: editing() }
                  "
                />
                @if (editing()) {
                  <div
                    class="mt-2 flex flex-wrap items-center gap-1 rounded-md border border-dashed border-border bg-muted/40 p-1"
                    role="group"
                    [attr.aria-label]="'Arrange ' + label(id)"
                  >
                    <span
                      class="inline-flex h-8 w-8 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
                      title="Drag to move"
                      aria-hidden="true"
                      data-testid="drag-handle"
                    >
                      <lucide-icon name="grip-vertical" class="h-4 w-4" />
                    </span>
                    <button
                      type="button"
                      class="ctl"
                      [attr.aria-label]="'Move ' + label(id) + ' up'"
                      data-testid="move-up"
                      (click)="nudge(id, -1)"
                    >
                      <lucide-icon name="arrow-up" class="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      class="ctl"
                      [attr.aria-label]="'Move ' + label(id) + ' down'"
                      data-testid="move-down"
                      (click)="nudge(id, 1)"
                    >
                      <lucide-icon name="arrow-down" class="h-4 w-4" />
                    </button>
                    <select
                      class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      [attr.aria-label]="'Move ' + label(id) + ' to group'"
                      data-testid="move-to"
                      (change)="moveTo(id, $event)"
                    >
                      @for (target of targets(); track target.id) {
                        <option
                          [value]="target.id"
                          [selected]="target.id === section.id"
                        >
                          {{ target.name }}
                        </option>
                      }
                    </select>
                    @if (allowPin()) {
                      <button
                        type="button"
                        class="ctl"
                        [attr.aria-pressed]="pinned(id)"
                        [attr.aria-label]="
                          (pinned(id) ? 'Unpin ' : 'Pin ') + label(id)
                        "
                        data-testid="pin"
                        (click)="emit(togglePinOf(id))"
                      >
                        <lucide-icon
                          [name]="pinned(id) ? 'pin-off' : 'pin'"
                          class="h-4 w-4"
                        />
                      </button>
                    }
                    <button
                      type="button"
                      class="ctl"
                      [attr.aria-label]="hideLabel() + ' ' + label(id)"
                      [title]="hideLabel()"
                      data-testid="hide"
                      (click)="hide(id)"
                    >
                      <lucide-icon name="eye-off" class="h-4 w-4" />
                    </button>
                  </div>
                }
              </div>
            } @empty {
              @if (editing()) {
                <p
                  class="col-span-full flex items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
                  data-testid="empty-group"
                >
                  Drop a card here, or use “Move to group” on a card.
                </p>
              }
            }
          </div>
        </section>
      }

      @if (editing()) {
        <form
          class="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3"
          (submit)="submitGroup($event, nameInput)"
        >
          <input
            #nameInput
            class="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
            placeholder="New group name"
            maxlength="40"
            aria-label="New group name"
            data-testid="new-group-name"
          />
          <button
            type="submit"
            class="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
            [disabled]="layout().groups.length >= maxGroups"
            data-testid="add-group"
          >
            <lucide-icon name="plus" class="h-4 w-4" />
            Add group
          </button>
        </form>

        @if (hiddenItems().length) {
          <section
            class="space-y-2"
            aria-label="Hidden"
            data-testid="hidden-tray"
          >
            <h2 class="text-sm font-semibold text-muted-foreground">
              Hidden ({{ hiddenItems().length }})
            </h2>
            <ul class="divide-y divide-border rounded-lg border border-border">
              @for (item of hiddenItems(); track item.id) {
                <li
                  class="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span class="min-w-0 truncate">{{ item.label }}</span>
                  <button
                    type="button"
                    class="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 text-sm hover:bg-muted"
                    [attr.aria-label]="restoreLabel() + ' ' + item.label"
                    data-testid="restore"
                    (click)="restore(item.id)"
                  >
                    <lucide-icon name="eye" class="h-4 w-4" />
                    {{ restoreLabel() }}
                  </button>
                </li>
              }
            </ul>
          </section>
        }
      }

      <p class="sr-only" role="status" aria-live="polite">
        {{ announcement() }}
      </p>
    </div>
  `,
  styles: `
    .ctl {
      display: inline-flex;
      height: 2rem;
      width: 2rem;
      align-items: center;
      justify-content: center;
      border-radius: 0.375rem;
      color: var(--color-muted-foreground, inherit);
    }
    .ctl:hover:not(:disabled) {
      background: var(--color-muted, rgb(0 0 0 / 0.06));
      color: var(--color-foreground, inherit);
    }
    .ctl:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .ctl:focus-visible {
      outline: 2px solid var(--color-ring, currentColor);
      outline-offset: 1px;
    }
    .dash-item[data-qz-dragging] {
      opacity: 0.4;
    }
    .dash-item[data-drop='before'] {
      box-shadow: -6px 0 0 -2px var(--color-primary, currentColor);
    }
    .dash-item[data-drop='after'] {
      box-shadow: 6px 0 0 -2px var(--color-primary, currentColor);
    }
  `,
})
export class DashboardBoard {
  readonly layout = input.required<DashboardLayout>();
  readonly editing = input(false);
  readonly itemTemplate = input.required<TemplateRef<BoardItemContext>>();
  /** Display name of an item, or null when it is not available right now. */
  readonly labelOf = input.required<(id: string) => string | null>();
  readonly ungroupedLabel = input('Uncategorized');
  readonly hideLabel = input('Hide');
  readonly restoreLabel = input('Restore');
  readonly allowPin = input(false);
  readonly gridClass = input('grid gap-4 md:grid-cols-2 2xl:grid-cols-3');

  readonly layoutChange = output<DashboardLayout>();

  protected readonly maxGroups = MAX_GROUPS;
  protected readonly dragType = DRAG_TYPE;
  protected readonly dragTypes = [DRAG_TYPE];
  protected readonly dragging = signal<string | null>(null);
  readonly #target = signal<{ section: string; index: number } | null>(null);
  protected readonly announcement = signal('');

  protected readonly hasGroups = computed(
    () => this.layout().groups.length > 0,
  );

  protected readonly sections = computed<Section[]>(() => {
    const layout = this.layout();
    const editing = this.editing();
    const present = (ids: string[]) =>
      ids.filter((id) => this.labelOf()(id) !== null);
    const ungrouped: Section = {
      id: UNGROUPED,
      name: this.ungroupedLabel(),
      ids: present(layout.ungroupedIds),
      named: false,
    };
    const groups = layout.groups.map<Section>((g) => ({
      id: g.id,
      name: g.name,
      ids: present(g.itemIds),
      named: true,
    }));
    return [
      ...(editing || ungrouped.ids.length > 0 ? [ungrouped] : []),
      ...groups.filter((g) => editing || g.ids.length > 0),
    ];
  });

  /** "Move to" choices. */
  protected readonly targets = computed(() => [
    { id: UNGROUPED, name: this.ungroupedLabel() },
    ...this.layout().groups.map((g) => ({ id: g.id, name: g.name })),
  ]);

  protected readonly hiddenItems = computed(() =>
    this.layout()
      .hiddenIds.map((id) => ({ id, label: this.labelOf()(id) }))
      .filter(
        (item): item is { id: string; label: string } => item.label !== null,
      ),
  );

  protected label(id: string): string {
    return this.labelOf()(id) ?? id;
  }

  protected pinned(id: string): boolean {
    return isPinned(this.layout(), id);
  }

  protected dropMark(
    section: string,
    index: number,
    last: boolean,
  ): 'before' | 'after' | null {
    const target = this.#target();
    if (!target || target.section !== section) return null;
    if (target.index === index) return 'before';
    if (last && target.index === index + 1) return 'after';
    return null;
  }

  protected isFirstGroup(id: string): boolean {
    return this.layout().groups[0]?.id === id;
  }

  protected isLastGroup(id: string): boolean {
    return this.layout().groups.at(-1)?.id === id;
  }

  protected emit(next: DashboardLayout): void {
    if (next !== this.layout()) this.layoutChange.emit(next);
  }

  protected moveGroupBy(id: string, delta: -1 | 1): DashboardLayout {
    return moveGroup(this.layout(), id, delta);
  }

  protected deleteGroupById(id: string): DashboardLayout {
    this.announce(
      'Group deleted. Its items moved to ' + this.ungroupedLabel() + '.',
    );
    return deleteGroup(this.layout(), id);
  }

  protected togglePinOf(id: string): DashboardLayout {
    return togglePin(this.layout(), id);
  }

  protected nudge(id: string, delta: -1 | 1): void {
    const next = nudgeItem(this.layout(), id, delta);
    this.emit(next);
    if (next !== this.layout())
      this.announce(`Moved ${this.label(id)} ${delta < 0 ? 'up' : 'down'}.`);
  }

  protected moveTo(id: string, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const next = moveItem(this.layout(), id, select.value);
    this.emit(next);
    const name = this.targets().find((t) => t.id === select.value)?.name ?? '';
    this.announce(`Moved ${this.label(id)} to ${name}.`);
  }

  protected hide(id: string): void {
    this.emit(hideItem(this.layout(), id));
    this.announce(`${this.label(id)} hidden.`);
  }

  protected restore(id: string): void {
    this.emit(showItem(this.layout(), id));
    this.announce(`${this.label(id)} restored.`);
  }

  protected rename(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = renameGroup(this.layout(), id, input.value);
    if (next === this.layout()) {
      input.value =
        this.layout().groups.find((g) => g.id === id)?.name ?? input.value;
      return;
    }
    this.emit(next);
  }

  protected blur(event: Event): void {
    (event.target as HTMLElement).blur();
  }

  protected submitGroup(event: Event, input: HTMLInputElement): void {
    event.preventDefault();
    const before = this.layout();
    const id =
      typeof crypto !== 'undefined' ? crypto.randomUUID() : `g${Date.now()}`;
    const next = addGroup(before, id, input.value);
    if (next === before) return;
    input.value = '';
    this.emit(next);
    this.announce('Group added.');
  }

  protected onOver(section: string, info: QzDragOverInfo): void {
    this.#target.set({
      section,
      index: this.indexAt(info.element, info.event),
    });
  }

  protected onLeave(section: string): void {
    if (this.#target()?.section === section) this.#target.set(null);
  }

  protected onDrop(section: string, info: QzDropInfo): void {
    const id = (info.data as { id?: string } | null)?.id;
    const index = this.indexAt(info.target, info.event);
    this.endDrag();
    if (!id) return;
    const before = sectionOf(this.layout(), id);
    const next = moveItem(this.layout(), id, section, index);
    this.emit(next);
    if (next !== this.layout() && before !== null) {
      const name = this.targets().find((t) => t.id === section)?.name ?? '';
      this.announce(`Moved ${this.label(id)} to ${name}.`);
    }
  }

  protected endDrag(): void {
    this.dragging.set(null);
    this.#target.set(null);
  }

  private indexAt(zone: HTMLElement, event: DragEvent): number {
    const rects = Array.from(
      zone.querySelectorAll<HTMLElement>(':scope > [data-dnd-item]'),
    ).map((el) => el.getBoundingClientRect());
    return dropIndexFromPoint(rects, event.clientX, event.clientY);
  }

  private announce(message: string): void {
    this.announcement.set(message);
  }
}
