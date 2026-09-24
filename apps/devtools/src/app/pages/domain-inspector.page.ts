import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltButton,
  VoltCard,
  VoltCardContent,
  VoltCardHeader,
  VoltCardTitle,
} from '@voltui/components';
import { ConnectedGateComponent } from '../components/connected-gate.component';
import { HeaderFindingsComponent } from '../components/header-findings.component';
import { ConnectedAccess } from '../connected/connected-access.service';
import { ApiError } from '../connected/api';
import {
  DomainInspector,
  type InspectionReport,
} from '../tools/domain-inspector.service';

@Component({
  selector: 'app-domain-inspector-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltButton,
    VoltCard,
    VoltCardContent,
    VoltCardHeader,
    VoltCardTitle,
    ConnectedGateComponent,
    HeaderFindingsComponent,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Domain Inspector</h1>
        <p class="mt-1 text-muted-foreground">
          DNS records, the redirect chain and the response headers of a public
          domain, fetched by the DevTools server — no CORS limits, every
          redirect visible.
        </p>
      </div>

      <app-connected-gate toolName="Domain Inspector">
        <div class="space-y-6">
          <volt-card>
            <volt-card-content>
              <form
                class="flex flex-col gap-3 sm:flex-row sm:items-end"
                (ngSubmit)="inspect()"
              >
                <div class="flex-1 space-y-1">
                  <label for="target" class="text-sm font-medium"
                    >Domain or URL</label
                  >
                  <input
                    id="target"
                    name="target"
                    autocomplete="off"
                    spellcheck="false"
                    class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    placeholder="example.com"
                    [ngModel]="target()"
                    (ngModelChange)="target.set($event)"
                  />
                </div>
                <volt-button
                  type="submit"
                  variant="solid"
                  [disabled]="busy() || !target().trim()"
                >
                  @if (busy()) {
                    <lucide-icon
                      name="loader"
                      class="mr-1 h-4 w-4 animate-spin"
                    />
                    Inspecting…
                  } @else {
                    <lucide-icon name="search" class="mr-1 h-4 w-4" /> Inspect
                  }
                </volt-button>
              </form>
              <p class="mt-2 text-xs text-muted-foreground">
                Public domains only — private networks, IP addresses and
                non-default ports are refused. At most 5 redirects; bodies are
                never downloaded. Nothing is stored.
              </p>
              @if (error()) {
                <p class="mt-3 text-sm text-red-600" role="alert">
                  {{ error() }}
                </p>
              }
            </volt-card-content>
          </volt-card>

          @if (report(); as r) {
            <volt-card>
              <volt-card-header
                ><volt-card-title>HTTP</volt-card-title></volt-card-header
              >
              <volt-card-content class="space-y-3">
                <ol class="space-y-2">
                  @for (hop of r.http.hops; track $index) {
                    <li class="rounded-md border border-border p-3 text-sm">
                      <div class="flex flex-wrap items-center gap-2">
                        <span
                          class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold"
                          >{{ hop.status }}</span
                        >
                        <span class="break-all font-mono text-xs">{{
                          hop.url
                        }}</span>
                        <span class="ml-auto text-xs text-muted-foreground"
                          >{{ hop.durationMs }} ms</span
                        >
                      </div>
                      @if (hop.location) {
                        <p class="mt-1 break-all text-xs text-muted-foreground">
                          → {{ hop.location }}
                        </p>
                      }
                      <p class="mt-1 text-xs text-muted-foreground">
                        Resolved to {{ hop.addresses.join(', ') }}
                      </p>
                    </li>
                  }
                </ol>
                @if (r.http.failure; as failure) {
                  <p
                    class="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                    role="status"
                  >
                    <span class="font-semibold"
                      >{{ failureLabel(failure.kind) }}:</span
                    >
                    {{ failure.message }}
                  </p>
                }
                @if (r.http.finalUrl) {
                  <p class="text-sm">
                    Final URL:
                    <span class="break-all font-mono text-xs">{{
                      r.http.finalUrl
                    }}</span>
                  </p>
                }
                @if (r.hints.length > 0) {
                  <p class="text-sm text-muted-foreground">
                    Served via
                    @for (
                      hint of r.hints;
                      track hint.provider;
                      let last = $last
                    ) {
                      <span
                        class="font-medium text-foreground"
                        [title]="hint.evidence"
                        >{{ hint.provider }}</span
                      >{{ last ? '' : ', ' }}
                    }
                    (from response headers)
                  </p>
                }
                <p class="text-xs text-muted-foreground">
                  TLS certificate details are not shown: the Workers runtime
                  does not expose them.
                </p>
              </volt-card-content>
            </volt-card>

            @if (r.headers; as analysis) {
              <volt-card>
                <volt-card-header
                  ><volt-card-title
                    >Response headers</volt-card-title
                  ></volt-card-header
                >
                <volt-card-content>
                  <app-header-findings [analysis]="analysis" />
                </volt-card-content>
              </volt-card>
            }

            <volt-card>
              <volt-card-header
                ><volt-card-title>DNS</volt-card-title></volt-card-header
              >
              <volt-card-content>
                <table class="w-full text-left text-sm">
                  <tbody class="divide-y divide-border">
                    @for (answer of r.dns; track answer.type) {
                      <tr class="align-top">
                        <th
                          scope="row"
                          class="w-20 py-2 pr-3 font-mono text-xs"
                        >
                          {{ answer.type }}
                        </th>
                        <td class="py-2">
                          @if (answer.status !== 'ok') {
                            <span class="text-xs text-muted-foreground">{{
                              answer.status
                            }}</span>
                          } @else if (answer.records.length === 0) {
                            <span class="text-xs text-muted-foreground"
                              >none</span
                            >
                          } @else {
                            <ul class="space-y-0.5">
                              @for (record of answer.records; track $index) {
                                <li class="break-all font-mono text-xs">
                                  @if (record.type !== answer.type) {
                                    <span class="text-muted-foreground"
                                      >{{ record.type }} {{ record.name }} →
                                    </span>
                                  }
                                  {{ record.data }}
                                  <span class="text-muted-foreground"
                                    >(TTL {{ record.ttl }})</span
                                  >
                                </li>
                              }
                            </ul>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <p class="mt-2 text-xs text-muted-foreground">
                  Resolved over DNS-over-HTTPS (cloudflare-dns.com).
                </p>
              </volt-card-content>
            </volt-card>
          }
        </div>
      </app-connected-gate>
    </div>
  `,
})
export default class DomainInspectorPage {
  readonly #inspector = inject(DomainInspector);
  readonly #access = inject(ConnectedAccess);

  protected readonly target = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly report = signal<InspectionReport | null>(null);

  async inspect(): Promise<void> {
    if (!this.target().trim()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.report.set(await this.#inspector.inspect(this.target()));
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

  protected failureLabel(kind: string): string {
    return (
      (
        {
          blocked: 'Blocked',
          dns: 'DNS',
          timeout: 'Timed out',
          network: 'Unreachable',
          'too-many-redirects': 'Too many redirects',
        } as Record<string, string>
      )[kind] ?? 'Stopped'
    );
  }
}
