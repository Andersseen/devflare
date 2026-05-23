import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltButton,
  VoltInput,
  VoltFormField,
  VoltLabel,
  VoltError,
  VoltBadge,
} from '@voltui/components';
import { Projects, type Project } from '@org/core';

@Component({
  selector: 'app-projects-page',
  imports: [
    RouterLink,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltButton,
    VoltInput,
    VoltFormField,
    VoltLabel,
    VoltError,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">Projects</h1>
          <p class="text-muted-foreground mt-1">
            Manage your deployed projects
          </p>
        </div>
      </div>

      <!-- Create Form -->
      <volt-card>
        <volt-card-header>
          <volt-card-title>Create New Project</volt-card-title>
        </volt-card-header>
        <volt-card-content>
          <form
            class="flex flex-col sm:flex-row gap-4 items-end"
            (submit)="onCreate($event)"
          >
            <volt-form-field class="flex-1 w-full">
              <volt-label>Project Name</volt-label>
              <volt-input
                type="text"
                placeholder="my-awesome-app"
                [(value)]="newName"
                autocomplete="off"
              />
            </volt-form-field>
            <volt-form-field class="flex-1 w-full">
              <volt-label>Repository URL (optional)</volt-label>
              <volt-input
                type="url"
                placeholder="https://github.com/user/repo"
                [(value)]="newRepoUrl"
                autocomplete="off"
              />
            </volt-form-field>
            <volt-button
              type="submit"
              variant="solid"
              [disabled]="isCreating() || !newName()"
            >
              @if (isCreating()) {
                <lucide-icon name="loader" class="animate-spin w-4 h-4 mr-1" />
                Creating...
              } @else {
                <lucide-icon name="plus" class="w-4 h-4 mr-1" />
                Create
              }
            </volt-button>
          </form>
          @if (createError()) {
            <volt-error class="mt-2">{{ createError() }}</volt-error>
          }
        </volt-card-content>
      </volt-card>

      <!-- Loading -->
      @if (isLoading()) {
        <div class="flex items-center justify-center py-12">
          <lucide-icon
            name="loader"
            class="animate-spin w-8 h-8 text-muted-foreground"
          />
        </div>
      }

      <!-- Projects List -->
      @if (!isLoading() && projects().length > 0) {
        <div class="grid grid-cols-1 gap-4">
          @for (project of projects(); track project.id) {
            <volt-card>
              <volt-card-content
                class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"
                    >
                      <lucide-icon
                        name="folder-open"
                        class="w-5 h-5 text-primary"
                      />
                    </div>
                    <div>
                      <h3 class="font-semibold text-lg truncate">
                        {{ project.name }}
                      </h3>
                      @if (project.repoUrl) {
                        <a
                          [href]="project.repoUrl"
                          target="_blank"
                          class="text-sm text-muted-foreground hover:text-primary hover:underline truncate block max-w-md"
                        >
                          {{ project.repoUrl }}
                        </a>
                      }
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                  <volt-badge variant="secondary">{{
                    formatDate(project.createdAt)
                  }}</volt-badge>
                  <volt-button
                    size="sm"
                    variant="destructive"
                    (click)="onDelete(project.id)"
                  >
                    <lucide-icon name="x" class="w-4 h-4 mr-1" />
                    Delete
                  </volt-button>
                </div>
              </volt-card-content>
            </volt-card>
          }
        </div>
      }

      <!-- Empty State -->
      @if (!isLoading() && projects().length === 0) {
        <volt-card>
          <volt-card-content>
            <div class="text-center py-12">
              <div
                class="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <lucide-icon
                  name="folder-open"
                  class="w-8 h-8 text-muted-foreground"
                />
              </div>
              <h3 class="text-lg font-medium">No projects yet</h3>
              <p class="text-muted-foreground mt-1">
                Create your first project above to get started
              </p>
            </div>
          </volt-card-content>
        </volt-card>
      }
    </div>
  `,
})
export default class ProjectsPage {
  #projectsService = inject(Projects);

  projects = signal<Project[]>([]);
  isLoading = signal(true);
  newName = signal('');
  newRepoUrl = signal('');
  isCreating = signal(false);
  createError = signal('');

  constructor() {
    this.loadProjects();
  }

  async loadProjects() {
    this.isLoading.set(true);
    try {
      const list = await this.#projectsService.getProjects();
      this.projects.set(list);
    } catch (err: unknown) {
      console.error('Failed to load projects', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async onCreate(event: Event) {
    event.preventDefault();
    this.isCreating.set(true);
    this.createError.set('');

    try {
      const project = await this.#projectsService.createProject(
        this.newName(),
        this.newRepoUrl() || undefined,
      );
      this.projects.update((list) => [project, ...list]);
      this.newName.set('');
      this.newRepoUrl.set('');
    } catch (err: unknown) {
      this.createError.set(
        err instanceof Error ? err.message : 'Failed to create project',
      );
    } finally {
      this.isCreating.set(false);
    }
  }

  async onDelete(id: string) {
    try {
      await this.#projectsService.deleteProject(id);
      this.projects.update((list) => list.filter((p) => p.id !== id));
    } catch (err: unknown) {
      console.error('Failed to delete project', err);
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  }
}
