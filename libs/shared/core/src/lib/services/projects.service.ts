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

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${this.#baseUrl}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete project');
  }
}
