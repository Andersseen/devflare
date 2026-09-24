import { Component, computed, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import type {
  FindingStatus,
  HeaderAnalysis,
} from '../tools/security-headers.analyzer';

const LABELS: Record<FindingStatus, string> = {
  weak: 'Potentially weak',
  missing: 'Missing',
  info: 'Informational',
  present: 'Present',
};

const STYLES: Record<FindingStatus, string> = {
  weak: 'border-red-500/40 bg-red-500/5',
  missing: 'border-amber-500/40 bg-amber-500/5',
  info: 'border-border bg-muted/30',
  present: 'border-green-600/30 bg-green-600/5',
};

const ICONS: Record<FindingStatus, string> = {
  weak: 'triangle-alert',
  missing: 'circle-dashed',
  info: 'info',
  present: 'circle-check',
};

/**
 * Renders the shared header analysis — the same component for pasted headers
 * (Security Headers) and fetched ones (Domain Inspector). No score, by design.
 */
@Component({
  selector: 'app-header-findings',
  imports: [LucideAngularModule],
  template: `
    <div class="space-y-4">
      <div
        class="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter findings"
      >
        @for (status of statuses; track status) {
          <button
            type="button"
            (click)="toggle(status)"
            [attr.aria-pressed]="!hidden().has(status)"
            class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            [class]="
              hidden().has(status)
                ? 'border-border text-muted-foreground opacity-60'
                : statusStyle(status)
            "
          >
            <lucide-icon [name]="icon(status)" class="h-3.5 w-3.5" />
            {{ label(status) }} · {{ analysis().counts[status] }}
          </button>
        }
      </div>

      <ul class="space-y-2">
        @for (finding of visible(); track finding.id) {
          <li
            class="rounded-md border p-3"
            [class]="statusStyle(finding.status)"
          >
            <div class="flex items-start gap-2">
              <lucide-icon
                [name]="icon(finding.status)"
                class="mt-0.5 h-4 w-4 shrink-0"
              />
              <div class="min-w-0 space-y-1">
                <p class="text-sm font-medium">
                  <span class="font-mono text-xs text-muted-foreground">{{
                    finding.header
                  }}</span>
                  <span class="sr-only"> — {{ label(finding.status) }}: </span>
                  <br />{{ finding.title }}
                </p>
                <p class="text-sm text-muted-foreground">
                  {{ finding.detail }}
                </p>
                @if (finding.evidence) {
                  <code
                    class="block break-all rounded bg-background/60 px-2 py-1 font-mono text-xs"
                    >{{ finding.evidence }}</code
                  >
                }
              </div>
            </div>
          </li>
        }
      </ul>
    </div>
  `,
})
export class HeaderFindingsComponent {
  readonly analysis = input.required<HeaderAnalysis>();

  protected readonly statuses: FindingStatus[] = [
    'weak',
    'missing',
    'info',
    'present',
  ];
  protected readonly hidden = signal<ReadonlySet<FindingStatus>>(new Set());

  protected readonly visible = computed(() =>
    this.analysis().findings.filter((f) => !this.hidden().has(f.status)),
  );

  protected toggle(status: FindingStatus): void {
    this.hidden.update((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  protected label(status: FindingStatus): string {
    return LABELS[status];
  }
  protected statusStyle(status: FindingStatus): string {
    return STYLES[status];
  }
  protected icon(status: FindingStatus): string {
    return ICONS[status];
  }
}
