import { Injectable } from '@angular/core';

/** Which kind of Cloudflare resource a project deploys to (spec 005). */
export type ProjectLinkType = 'worker' | 'pages';

export interface Project {
  id: string;
  userId: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
  /** Null on both when the project is not linked to anything yet. */
  cfType: ProjectLinkType | null;
  cfName: string | null;
}

/**
 * One deployment DevFlare itself made (spec 006). Distinct from `/cloud`, which
 * shows everything the account has from any source and cannot say which came
 * from here.
 */
export interface Deployment {
  id: string;
  projectId: string;
  status: string;
  commitSha: string | null;
  previewUrl: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class Projects {
  #baseUrl = '/api/v1/projects';

  async getProjects(): Promise<Project[]> {
    const res = await fetch(this.#baseUrl, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load projects');
    const data = await res.json();
    return data.projects as Project[];
  }

  async createProject(name: string, repoUrl?: string): Promise<Project> {
    const res = await fetch(this.#baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, repoUrl }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const data = await res.json();
    return data.project as Project;
  }

  /**
   * Points a project at the Worker or Pages project it deploys to. Passing null
   * clears the link; the server drops both halves together.
   */
  async linkProject(
    id: string,
    link: { cfType: ProjectLinkType; cfName: string } | null,
  ): Promise<Project> {
    const res = await fetch(`${this.#baseUrl}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(link ?? { cfType: null }),
    });
    if (!res.ok) throw new Error('Failed to link project');
    const data = await res.json();
    return data.project as Project;
  }

  /** What this app has deployed for the project, newest first. */
  async getDeployments(id: string): Promise<Deployment[]> {
    const res = await fetch(`${this.#baseUrl}/${id}/deployments`, {
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to load deployments');
    const data = await res.json();
    return data.deployments as Deployment[];
  }

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${this.#baseUrl}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete project');
  }
}
