import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import type { ConnectionDto } from '../../shared/dto';

/**
 * Shown above empty dashboards. It states plainly whether DevRadar can reach
 * GitHub, so an empty page is never mistaken for "all quiet".
 */
@Component({
  selector: 'app-disconnected-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LucideAngularModule],
  template: `
    @if (!connection().configured) {
      <div
        class="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        role="status"
        data-testid="disconnected-notice"
      >
        <lucide-icon
          name="triangle-alert"
          class="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
        />
        <div class="space-y-1">
          <p class="font-medium">GitHub is not connected</p>
          <p class="text-muted-foreground">
            The GitHub App is not configured on this deployment, so DevRadar has
            no repositories to show. Nothing below is sample data.
            <a routerLink="/settings" class="font-medium text-primary underline"
              >Set it up in Settings</a
            >.
          </p>
        </div>
      </div>
    } @else if (empty()) {
      <div
        class="flex gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm"
        role="status"
        data-testid="no-installation-notice"
      >
        <lucide-icon name="info" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p class="text-muted-foreground">
          The GitHub App is configured but no repositories are synced yet.
          Install the App on an account, then run a sync in
          <a routerLink="/settings" class="font-medium text-primary underline"
            >Settings</a
          >.
        </p>
      </div>
    }
  `,
})
export class DisconnectedNoticeComponent {
  readonly connection = input.required<ConnectionDto>();
  /** True when connected but there is nothing synced yet. */
  readonly empty = input(false);
}
