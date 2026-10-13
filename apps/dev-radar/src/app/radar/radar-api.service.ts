import { Injectable } from '@angular/core';
import type { DashboardLayout } from '@org/dashboard-layout/logic';
import type {
  ActivityDto,
  OverviewDto,
  PullRequestDto,
  RepositoryDetailDto,
  RepositoryDto,
  SettingsDto,
  SyncResultDto,
} from '../../shared/dto';
import { apiRequest } from './api';

/** Typed access to DevRadar's own API. Reads persisted state only. */
@Injectable({ providedIn: 'root' })
export class RadarApi {
  overview = () => apiRequest<OverviewDto>('/api/v1/overview');

  /** Followed repositories only. */
  repositories = () =>
    apiRequest<{ repositories: RepositoryDto[] }>('/api/v1/repositories');

  /** Everything the GitHub App can read, each flagged `followed`. */
  availableRepositories = () =>
    apiRequest<{ repositories: RepositoryDto[] }>(
      '/api/v1/repositories?scope=available',
    );

  dashboardLayout = () =>
    apiRequest<{ layout: DashboardLayout }>('/api/v1/dashboard-layout');

  saveDashboardLayout = (layout: DashboardLayout) =>
    apiRequest<{ layout: DashboardLayout }>('/api/v1/dashboard-layout', {
      method: 'PUT',
      body: layout,
    });

  resetDashboardLayout = () =>
    apiRequest<{ layout: DashboardLayout }>('/api/v1/dashboard-layout', {
      method: 'DELETE',
    });

  repository = (id: number) =>
    apiRequest<RepositoryDetailDto>(`/api/v1/repositories/${id}`);

  pullRequests = () =>
    apiRequest<{ pullRequests: PullRequestDto[] }>('/api/v1/pull-requests');

  activity = () => apiRequest<{ events: ActivityDto[] }>('/api/v1/activity');

  settings = () => apiRequest<SettingsDto>('/api/v1/settings');

  sync = () =>
    apiRequest<SyncResultDto>('/api/v1/sync', {
      method: 'POST',
      body: undefined,
    });
}
