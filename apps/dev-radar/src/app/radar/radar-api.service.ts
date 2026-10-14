import { Injectable } from '@angular/core';
import type { DashboardLayout } from '@org/dashboard-layout/logic';
import type {
  ActivityDto,
  AutomationDetailDto,
  AutomationRuleDto,
  AutomationsDto,
  ManualPrepareDto,
  PromptDetailDto,
  PromptListDto,
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

  automations = () => apiRequest<AutomationsDto>('/api/v1/automations');

  automation = (repositoryId: number) =>
    apiRequest<AutomationDetailDto>(`/api/v1/automations/${repositoryId}`);

  saveAutomation = (
    repositoryId: number,
    rule: {
      enabled: boolean;
      ciPolicy: 'all_workflows' | 'required_workflows';
      requiredWorkflowIds: number[];
      settleSeconds: number;
      cooldownMinutes: number;
      chatgptUrl: string | null;
    },
  ) =>
    apiRequest<{ rule: AutomationRuleDto }>(
      `/api/v1/automations/${repositoryId}`,
      { method: 'PUT', body: rule },
    );

  /** Manual preparation. `bypassCi` is the explicit "prepare anyway" action. */
  preparePrompt = (repositoryId: number, bypassCi: boolean) =>
    apiRequest<Extract<ManualPrepareDto, { ok: true }>>(
      `/api/v1/automations/${repositoryId}/prepare`,
      { method: 'POST', body: { bypassCi } },
    );

  prompts = (filter: { repositoryId?: number; status?: string } = {}) => {
    const query = new URLSearchParams();
    if (filter.repositoryId) {
      query.set('repositoryId', String(filter.repositoryId));
    }
    if (filter.status) query.set('status', filter.status);
    const suffix = query.size > 0 ? `?${query}` : '';
    return apiRequest<PromptListDto>(`/api/v1/prompts${suffix}`);
  };

  prompt = (id: string) => apiRequest<PromptDetailDto>(`/api/v1/prompts/${id}`);

  setPromptStatus = (id: string, status: 'unread' | 'read' | 'dismissed') =>
    apiRequest<{ id: string; status: string }>(`/api/v1/prompts/${id}`, {
      method: 'PATCH',
      body: { status },
    });

  sync = () =>
    apiRequest<SyncResultDto>('/api/v1/sync', {
      method: 'POST',
      body: undefined,
    });
}
