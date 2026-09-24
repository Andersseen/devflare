import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import { ConnectedGateComponent } from '../components/connected-gate.component';
import { CopyButtonComponent } from '../components/copy-button.component';
import { ConnectedAccess } from '../connected/connected-access.service';
import { ApiError } from '../connected/api';
import { ShortLinks, type ShortLink } from '../tools/short-links.service';

const INPUT =
  'h-10 w-full rounded-md border border-border bg-background px-3 text-sm';

@Component({
  selector: 'app-short-links-page',
  imports: [
    FormsModule,
    RouterLink,
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    ConnectedGateComponent,
    CopyButtonComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Short Links</h1>
        <p class="mt-1 text-muted-foreground">
          Personal short links on your own domain. Redirects are public;
          managing them needs sign-in and access.
        </p>
      </div>

      <app-connected-gate toolName="Short Links">
        <div class="space-y-6">
          <volt-card>
            <volt-card-header
              ><volt-card-title>Create link</volt-card-title></volt-card-header
            >
            <volt-card-content>
              <form
                class="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end"
                (ngSubmit)="create()"
              >
                <div class="space-y-1">
                  <label for="slug" class="text-sm font-medium">Slug</label>
                  <div class="flex items-center gap-1">
                    <span
                      class="hidden truncate text-xs text-muted-foreground lg:inline"
                      [title]="baseUrl() ?? ''"
                      >{{ baseUrl() ?? '' }}/</span
                    >
                    <input
                      id="slug"
                      name="slug"
                      [class]="input"
                      placeholder="cv"
                      autocomplete="off"
                      [ngModel]="slug()"
                      (ngModelChange)="slug.set($event)"
                    />
                  </div>
                </div>
                <div class="space-y-1">
                  <label for="destination" class="text-sm font-medium"
                    >Destination</label
                  >
                  <input
                    id="destination"
                    name="destination"
                    type="url"
                    [class]="input"
                    placeholder="https://example.com/very/long/path"
                    autocomplete="off"
                    [ngModel]="destination()"
                    (ngModelChange)="destination.set($event)"
                  />
                </div>
                <volt-button
                  type="submit"
                  variant="solid"
                  [disabled]="busy() || !canCreate()"
                >
                  <lucide-icon name="plus" class="mr-1 h-4 w-4" /> Create link
                </volt-button>
              </form>
              @if (slug() && !slugLooksValid()) {
                <p class="mt-2 text-xs text-muted-foreground">
                  1–64 lowercase letters, digits or hyphens; not starting or
                  ending with a hyphen.
                </p>
              }
              @if (error()) {
                <p class="mt-3 text-sm text-red-600" role="alert">
                  {{ error() }}
                </p>
              }
            </volt-card-content>
          </volt-card>

          @if (!baseUrl() && loaded()) {
            <p class="text-sm text-amber-700" role="status">
              SHORT_LINK_BASE_URL is not configured on this deployment, so links
              have no public address yet.
            </p>
          }

          <volt-card>
            <volt-card-header
              ><volt-card-title>Your links</volt-card-title></volt-card-header
            >
            <volt-card-content class="p-0">
              @if (!loaded()) {
                <p class="p-4 text-sm text-muted-foreground" role="status">
                  Loading…
                </p>
              } @else if (links().length === 0) {
                <p class="p-4 text-sm text-muted-foreground">No links yet.</p>
              } @else {
                <ul class="divide-y divide-border" aria-label="Short links">
                  @for (link of links(); track link.id) {
                    <li class="space-y-2 p-4" [attr.data-slug]="link.slug">
                      @if (editing() === link.id) {
                        <form
                          class="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto_auto]"
                          (ngSubmit)="saveEdit(link)"
                        >
                          <label class="sr-only" [for]="'edit-slug-' + link.id"
                            >Slug</label
                          >
                          <input
                            [id]="'edit-slug-' + link.id"
                            name="editSlug"
                            [class]="input"
                            [ngModel]="editSlug()"
                            (ngModelChange)="editSlug.set($event)"
                          />
                          <label class="sr-only" [for]="'edit-dest-' + link.id"
                            >Destination</label
                          >
                          <input
                            [id]="'edit-dest-' + link.id"
                            name="editDestination"
                            type="url"
                            [class]="input"
                            [ngModel]="editDestination()"
                            (ngModelChange)="editDestination.set($event)"
                          />
                          <volt-button
                            type="submit"
                            size="sm"
                            variant="solid"
                            [disabled]="busy()"
                            >Save</volt-button
                          >
                          <volt-button
                            type="button"
                            size="sm"
                            variant="ghost"
                            (click)="editing.set(null)"
                            >Cancel</volt-button
                          >
                        </form>
                      } @else {
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-mono text-sm font-semibold"
                            >/{{ link.slug }}</span
                          >
                          <span
                            class="rounded-full px-2 py-0.5 text-xs"
                            [class]="
                              link.active
                                ? 'bg-green-600/10 text-green-700 dark:text-green-400'
                                : 'bg-muted text-muted-foreground'
                            "
                          >
                            {{ link.active ? 'Active' : 'Disabled' }}
                          </span>
                        </div>
                        <p class="break-all text-sm text-muted-foreground">
                          → {{ link.destination }}
                        </p>
                        @if (link.shortUrl) {
                          <p class="break-all font-mono text-xs text-primary">
                            {{ link.shortUrl }}
                          </p>
                        }
                        <div class="flex flex-wrap gap-2">
                          @if (link.shortUrl) {
                            <app-copy-button [value]="link.shortUrl" />
                            <a
                              [routerLink]="['/qr-generator']"
                              [queryParams]="{ text: link.shortUrl }"
                              class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <lucide-icon name="qr-code" class="h-3.5 w-3.5" />
                              Open in QR Studio
                            </a>
                          }
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                            (click)="startEdit(link)"
                          >
                            <lucide-icon name="pencil" class="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                            [disabled]="busy()"
                            (click)="toggle(link)"
                          >
                            <lucide-icon name="power" class="h-3.5 w-3.5" />
                            {{ link.active ? 'Disable' : 'Enable' }}
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10"
                            [disabled]="busy()"
                            (click)="remove(link)"
                          >
                            <lucide-icon name="trash-2" class="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      }
                    </li>
                  }
                </ul>
              }
            </volt-card-content>
          </volt-card>
          <p class="text-xs text-muted-foreground">
            Redirects answer 302 (not permanent) so edits take effect for
            everyone; disabled links answer 410. No clicks are counted.
          </p>
        </div>
      </app-connected-gate>
    </div>
  `,
})
export default class ShortLinksPage {
  readonly #shortLinks = inject(ShortLinks);
  readonly #access = inject(ConnectedAccess);

  protected readonly input = INPUT;
  protected readonly links = signal<ShortLink[]>([]);
  protected readonly baseUrl = signal<string | null>(null);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly slug = signal('');
  protected readonly destination = signal('');
  protected readonly editing = signal<string | null>(null);
  protected readonly editSlug = signal('');
  protected readonly editDestination = signal('');

  protected readonly slugLooksValid = computed(() =>
    this.#shortLinks.looksLikeSlug(this.slug()),
  );
  protected readonly canCreate = computed(
    () => this.slugLooksValid() && this.destination().trim() !== '',
  );

  constructor() {
    effect(() => {
      if (this.#access.state() === 'allowed' && !this.loaded())
        void this.load();
    });
  }

  async load(): Promise<void> {
    await this.#run(async () => {
      const { links, baseUrl } = await this.#shortLinks.list();
      this.links.set(links);
      this.baseUrl.set(baseUrl);
      this.loaded.set(true);
    });
  }

  async create(): Promise<void> {
    if (!this.canCreate()) return;
    await this.#run(async () => {
      const link = await this.#shortLinks.create(
        this.slug(),
        this.destination(),
      );
      this.links.update((links) => [link, ...links]);
      this.slug.set('');
      this.destination.set('');
    });
  }

  startEdit(link: ShortLink): void {
    this.editing.set(link.id);
    this.editSlug.set(link.slug);
    this.editDestination.set(link.destination);
    this.error.set(null);
  }

  async saveEdit(link: ShortLink): Promise<void> {
    await this.#run(async () => {
      this.#replace(
        await this.#shortLinks.update(link.id, {
          slug: this.editSlug(),
          destination: this.editDestination(),
        }),
      );
      this.editing.set(null);
    });
  }

  async toggle(link: ShortLink): Promise<void> {
    await this.#run(async () =>
      this.#replace(
        await this.#shortLinks.update(link.id, { active: !link.active }),
      ),
    );
  }

  async remove(link: ShortLink): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Delete /${link.slug}? Its URL will stop working.`)
    )
      return;
    await this.#run(async () => {
      await this.#shortLinks.remove(link.id);
      this.links.update((links) => links.filter((l) => l.id !== link.id));
    });
  }

  #replace(updated: ShortLink): void {
    this.links.update((links) =>
      links.map((l) => (l.id === updated.id ? updated : l)),
    );
  }

  async #run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (error) {
      if (!this.#access.handleAccessError(error)) {
        this.error.set(
          error instanceof ApiError ? error.message : 'Something went wrong.',
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
