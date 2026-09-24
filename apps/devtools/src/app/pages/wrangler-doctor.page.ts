import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import { CopyButtonComponent } from '../components/copy-button.component';
import { SecretNoticeComponent } from '../components/secret-notice.component';
import {
  WranglerConfigError,
  WranglerDoctor,
  detectFormat,
  type ConfigFormat,
  type IssueLevel,
} from '../tools/wrangler-doctor.service';

const SAMPLE = `name = "shop"
main = "src/index.ts"
compatibility_date = "2026-05-23"

[[d1_databases]]
binding = "DB"
database_name = "shop-db"
database_id = "1c9e6a3e-5b0e-4d6b-9a52-6d4f0f3f7a11"

[[kv_namespaces]]
binding = "CACHE"
id = "a1b2c3d4e5f6"

[vars]
PUBLIC_URL = "http://localhost:8787"

[env.production]
[[env.production.d1_databases]]
binding = "DB"
database_name = "shop-db"
database_id = "1c9e6a3e-5b0e-4d6b-9a52-6d4f0f3f7a11"

[env.production.vars]
PUBLIC_URL = "https://shop.example"
`;

const LEVEL_STYLE: Record<IssueLevel, string> = {
  error: 'border-red-500/40 bg-red-500/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-border bg-muted/30',
};

@Component({
  selector: 'app-wrangler-doctor-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    CopyButtonComponent,
    SecretNoticeComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Wrangler Config Doctor</h1>
        <p class="mt-1 text-muted-foreground">
          Paste a <code class="font-mono text-sm">wrangler.toml</code> or
          <code class="font-mono text-sm">wrangler.jsonc</code> to find binding drift between
          environments, duplicates and missing fields.
        </p>
        <p class="mt-2 text-sm text-muted-foreground">
          Rules come from Wrangler's own schema and validation; Wrangler stays the authority.
          Parsed in this tab — configs often hold ids and vars you would not upload.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <volt-card>
          <volt-card-header><volt-card-title>Configuration</volt-card-title></volt-card-header>
          <volt-card-content class="space-y-3">
            <div class="flex flex-wrap items-center gap-3 text-sm" role="radiogroup" aria-label="Format">
              @for (option of formats; track option.value) {
                <label class="inline-flex items-center gap-1.5">
                  <input type="radio" name="format" [value]="option.value"
                    [ngModel]="format()" (ngModelChange)="format.set($event)" />
                  {{ option.label }}
                </label>
              }
              <button type="button" class="ml-auto text-primary hover:underline" (click)="config.set(sample)">
                Load an example
              </button>
            </div>
            <label for="config" class="sr-only">Wrangler configuration</label>
            <textarea id="config" rows="22" spellcheck="false" autocomplete="off" autocapitalize="off"
              class="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
              placeholder='name = "my-worker"'
              [ngModel]="config()" (ngModelChange)="config.set($event)"></textarea>
            <app-secret-notice [text]="config()" />
          </volt-card-content>
        </volt-card>

        <div class="space-y-6">
          @if (result(); as r) {
            @if (r.error) {
              <volt-card>
                <volt-card-content>
                  <p class="text-sm text-red-600" role="alert">
                    {{ r.error.message }}
                  </p>
                </volt-card-content>
              </volt-card>
            } @else if (r.report; as report) {
              <volt-card>
                <volt-card-header>
                  <volt-card-title>
                    {{ report.workerName ?? '(no name)' }}
                    <span class="ml-2 text-xs font-normal text-muted-foreground">
                      {{ report.format === 'toml' ? 'TOML' : 'JSON/JSONC' }}
                      @if (report.compatibilityDate) { · {{ report.compatibilityDate }} }
                    </span>
                  </volt-card-title>
                </volt-card-header>
                <volt-card-content class="space-y-2">
                  @if (report.issues.length === 0) {
                    <p class="text-sm text-green-600">No problems found.</p>
                  }
                  <ul class="space-y-2">
                    @for (issue of report.issues; track $index) {
                      <li class="rounded-md border p-3 text-sm" [class]="levelStyle[issue.level]">
                        <span class="mr-2 text-xs font-semibold uppercase">{{ issue.level }}</span>
                        @if (issue.scope) {
                          <span class="mr-2 font-mono text-xs text-muted-foreground">{{ issue.scope }}</span>
                        }
                        {{ issue.message }}
                      </li>
                    }
                  </ul>
                </volt-card-content>
              </volt-card>

              <volt-card>
                <volt-card-header>
                  <div class="flex items-center justify-between">
                    <volt-card-title>Bindings</volt-card-title>
                    <app-copy-button [value]="report.summaryText" label="Copy summary" />
                  </div>
                </volt-card-header>
                <volt-card-content class="space-y-4">
                  @for (environment of report.environments; track environment.scope) {
                    <div>
                      <p class="mb-1 font-mono text-xs text-muted-foreground">[{{ environment.scope }}]</p>
                      <table class="w-full text-left text-sm">
                        <tbody class="divide-y divide-border">
                          @for (binding of environment.bindings; track binding.name + binding.kind) {
                            <tr>
                              <td class="py-1 pr-3 text-muted-foreground">{{ binding.kind }}</td>
                              <td class="py-1 pr-3 font-mono text-xs">{{ binding.name }}</td>
                              <td class="py-1 font-mono text-xs text-muted-foreground">{{ binding.detail }}</td>
                            </tr>
                          }
                          @for (variable of environment.vars; track variable.name) {
                            <tr>
                              <td class="py-1 pr-3 text-muted-foreground">var</td>
                              <td class="py-1 pr-3 font-mono text-xs">{{ variable.name }}</td>
                              <td class="py-1 text-xs text-muted-foreground">{{ variable.valueType }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                </volt-card-content>
              </volt-card>

              <volt-card>
                <volt-card-header>
                  <div class="flex items-center justify-between">
                    <volt-card-title>Env interface</volt-card-title>
                    <app-copy-button [value]="report.envInterface" />
                  </div>
                </volt-card-header>
                <volt-card-content class="space-y-2">
                  <pre class="overflow-x-auto rounded-md bg-muted/50 p-3 font-mono text-xs">{{ report.envInterface }}</pre>
                  <p class="text-xs text-muted-foreground">
                    Types from <code>@cloudflare/workers-types</code>, only for bindings that map
                    one to one. <code>wrangler types</code> generates the complete version.
                  </p>
                </volt-card-content>
              </volt-card>
            }
          } @else {
            <volt-card>
              <volt-card-content>
                <p class="text-sm text-muted-foreground">Paste a configuration to inspect it.</p>
              </volt-card-content>
            </volt-card>
          }
        </div>
      </div>
    </div>
  `,
})
export default class WranglerDoctorPage {
  readonly #doctor = inject(WranglerDoctor);

  protected readonly sample = SAMPLE;
  protected readonly levelStyle = LEVEL_STYLE;
  protected readonly formats: {
    value: ConfigFormat | 'auto';
    label: string;
  }[] = [
    { value: 'auto', label: 'Detect' },
    { value: 'toml', label: 'TOML' },
    { value: 'jsonc', label: 'JSON / JSONC' },
  ];

  protected readonly config = signal('');
  protected readonly format = signal<ConfigFormat | 'auto'>('auto');

  protected readonly result = computed(() => {
    const text = this.config();
    if (!text.trim()) return null;
    const format =
      this.format() === 'auto'
        ? detectFormat(text)
        : (this.format() as ConfigFormat);
    try {
      return { report: this.#doctor.inspect(text, format), error: null };
    } catch (error) {
      return {
        report: null,
        error:
          error instanceof WranglerConfigError
            ? error
            : new WranglerConfigError('Could not read this configuration.'),
      };
    }
  });
}
