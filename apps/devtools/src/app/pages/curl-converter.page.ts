import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltTabs,
  VoltTabsList,
  VoltTabsTrigger,
} from '@voltui/components';
import { CopyButtonComponent } from '../components/copy-button.component';
import { SecretNoticeComponent } from '../components/secret-notice.component';
import {
  CurlConverter,
  type Conversion,
} from '../tools/curl-converter.service';

type Direction = 'curl-to-fetch' | 'fetch-to-curl';

const PLACEHOLDERS: Record<Direction, string> = {
  'curl-to-fetch': `curl https://api.example.com/items \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Ada"}'`,
  'fetch-to-curl': `await fetch("https://api.example.com/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "Ada" }),
});`,
};

@Component({
  selector: 'app-curl-converter-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltTabs,
    VoltTabsList,
    VoltTabsTrigger,
    CopyButtonComponent,
    SecretNoticeComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">cURL ↔ Fetch</h1>
        <p class="mt-1 text-muted-foreground">
          Turn a curl command into standard
          <code class="font-mono text-sm">fetch()</code>, or a fetch call back
          into curl. Anything that does not translate is listed, not dropped.
        </p>
        <p class="mt-2 text-sm text-muted-foreground">
          Converted in this tab; requests are never sent.
        </p>
      </div>

      <volt-tabs [(value)]="direction">
        <volt-tabs-list>
          <volt-tabs-trigger value="curl-to-fetch"
            >cURL → Fetch</volt-tabs-trigger
          >
          <volt-tabs-trigger value="fetch-to-curl"
            >Fetch → cURL</volt-tabs-trigger
          >
        </volt-tabs-list>
      </volt-tabs>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <volt-card>
          <volt-card-content class="space-y-3">
            <label for="source" class="text-sm font-medium">
              {{
                direction() === 'curl-to-fetch'
                  ? 'curl command'
                  : 'fetch() call'
              }}
            </label>
            <textarea
              id="source"
              rows="14"
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
              class="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
              [placeholder]="placeholder()"
              [ngModel]="source()"
              (ngModelChange)="source.set($event)"
            ></textarea>
            <app-secret-notice [text]="source()" />
          </volt-card-content>
        </volt-card>

        <volt-card>
          <volt-card-content class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">
                {{ direction() === 'curl-to-fetch' ? 'fetch()' : 'curl' }}
              </span>
              <app-copy-button [value]="result()?.conversion?.output ?? ''" />
            </div>
            @if (result(); as r) {
              @if (r.error) {
                <p class="text-sm text-red-600" role="alert">{{ r.error }}</p>
              } @else if (r.conversion; as conversion) {
                <pre
                  data-testid="conversion-output"
                  class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-xs"
                  >{{ conversion.output }}</pre
                >
                @if (conversion.warnings.length > 0) {
                  <ul class="space-y-1 text-sm">
                    @for (warning of conversion.warnings; track $index) {
                      <li class="flex gap-2 text-amber-700 dark:text-amber-400">
                        <lucide-icon
                          name="triangle-alert"
                          class="mt-0.5 h-4 w-4 shrink-0"
                        />
                        {{ warning }}
                      </li>
                    }
                  </ul>
                }
              }
            } @else {
              <p class="text-sm text-muted-foreground">
                Paste something on the left.
              </p>
            }
            @if (direction() === 'curl-to-fetch') {
              <p class="text-xs text-muted-foreground">
                Note: fetch follows redirects by default; curl only does with
                -L.
              </p>
            }
          </volt-card-content>
        </volt-card>
      </div>
    </div>
  `,
})
export default class CurlConverterPage {
  readonly #converter = inject(CurlConverter);

  protected readonly direction = signal<Direction>('curl-to-fetch');
  protected readonly source = signal('');
  protected readonly placeholder = computed(
    () => PLACEHOLDERS[this.direction()],
  );

  protected readonly result = computed<{
    conversion: Conversion | null;
    error: string | null;
  } | null>(() => {
    const text = this.source().trim();
    if (!text) return null;
    try {
      const conversion =
        this.direction() === 'curl-to-fetch'
          ? this.#converter.curlToFetch(text)
          : this.#converter.fetchToCurl(text);
      return { conversion, error: null };
    } catch (error) {
      return { conversion: null, error: (error as Error).message };
    }
  });
}
