import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Project {
  id: string;
  userId: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class ProjectsService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/projects';

  async getProjects(): Promise<Project[]> {
    const res = await fetch(this.baseUrl, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load projects');
    const data = await res.json();
    return data.projects as Project[];
  }

  async createProject(name: string, repoUrl?: string): Promise<Project> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, repoUrl }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const data = await res.json();
    return data.project as Project;
  }

  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete project');
  }
}
