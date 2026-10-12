import { Injectable } from '@angular/core';
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

  repositories = () =>
    apiRequest<{ repositories: RepositoryDto[] }>('/api/v1/repositories');

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
