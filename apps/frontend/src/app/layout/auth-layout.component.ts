import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-auth-layout',
    standalone: true,
    imports: [CommonModule, RouterOutlet],
    template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div class="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
          <div class="h-12 w-12 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/30 mx-auto">
             DF
          </div>
          <h2 class="mt-6 text-center text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
             DevFlare
          </h2>
      </div>

      <div class="sm:mx-auto sm:w-full sm:max-w-md">
        <div class="bg-white dark:bg-slate-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200 dark:border-slate-700">
           <router-outlet></router-outlet>
        </div>
      </div>
    </div>
  `
})
export class AuthLayoutComponent { }
