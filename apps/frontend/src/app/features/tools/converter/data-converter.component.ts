import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as Papa from 'papaparse';

@Component({
    selector: 'app-data-converter',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      <header class="flex-none p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Data Converter</h1>
        <p class="text-slate-500 dark:text-slate-400">Convert between JSON and CSV formats easily.</p>
      </header>

      <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        <!-- Left Panel: JSON -->
        <div class="flex-1 flex flex-col p-4 gap-2 min-w-0">
          <div class="flex items-center justify-between">
            <label class="text-sm font-semibold text-slate-700 dark:text-slate-300">JSON</label>
            <div class="flex gap-2">
                 <button 
                  (click)="prettifyJson()"
                  class="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  Prettify
                </button>
                 <button 
                  (click)="clearJson()"
                  class="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  Clear
                </button>
            </div>
          </div>
          <textarea 
            [ngModel]="jsonInput()" 
            (ngModelChange)="onJsonChange($event)"
            class="flex-1 w-full p-4 font-mono text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border rounded-xl resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
            [class.border-red-500]="jsonError()"
            [class.border-slate-300]="!jsonError()"
            [class.dark:border-slate-700]="!jsonError()"
            placeholder='[{"name": "John", "age": 30}, {"name": "Jane", "age": 25}]'></textarea>
          @if (jsonError()) {
            <p class="text-xs text-red-500 font-medium animate-pulse">{{ jsonError() }}</p>
          }
        </div>

        <!-- Middle Controls -->
        <div class="flex-none flex md:flex-col items-center justify-center p-2 gap-4 bg-slate-50 dark:bg-slate-900 z-10">
          <button 
            (click)="convertJsonToCsv()"
            class="p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 hover:scale-110 active:scale-95 transition-all"
            title="Convert JSON to CSV">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" class="md:hidden"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" class="hidden md:block"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </button>

          <button 
            (click)="convertCsvToJson()"
            class="p-3 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 hover:scale-110 active:scale-95 transition-all"
            title="Convert CSV to JSON">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" class="md:hidden"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
             <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" class="hidden md:block"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          </button>
        </div>

        <!-- Right Panel: CSV -->
        <div class="flex-1 flex flex-col p-4 gap-2 min-w-0">
          <div class="flex items-center justify-between">
            <label class="text-sm font-semibold text-slate-700 dark:text-slate-300">CSV</label>
             <div class="flex gap-2">
                 <button 
                  (click)="clearCsv()"
                  class="px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  Clear
                </button>
            </div>
          </div>
          <textarea 
            [ngModel]="csvInput()" 
            (ngModelChange)="csvInput.set($event)"
            class="flex-1 w-full p-4 font-mono text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
            placeholder="name,age&#10;John,30&#10;Jane,25"></textarea>
           
           @if (csvError()) {
            <p class="text-xs text-red-500 font-medium animate-pulse">{{ csvError() }}</p>
          }
        </div>

      </div>
    </div>
  `,
    styles: [`
    :host {
      display: block;
      height: 100%;
    }
  `]
})
export class DataConverterComponent {
    jsonInput = signal('');
    csvInput = signal('');

    jsonError = signal<string | null>(null);
    csvError = signal<string | null>(null);

    onJsonChange(value: string) {
        this.jsonInput.set(value);
        // Clear error on type to avoid annoyance, or leave it until next convert.
        // Let's clear it on type.
        if (this.jsonError()) this.jsonError.set(null);
    }

    prettifyJson() {
        try {
            const raw = this.jsonInput();
            if (!raw.trim()) return;
            const parsed = JSON.parse(raw);
            this.jsonInput.set(JSON.stringify(parsed, null, 2));
            this.jsonError.set(null);
        } catch (e: any) {
            this.jsonError.set('Invalid JSON: ' + e.message);
        }
    }

    clearJson() {
        this.jsonInput.set('');
        this.jsonError.set(null);
    }

    clearCsv() {
        this.csvInput.set('');
        this.csvError.set(null);
    }

    convertJsonToCsv() {
        this.jsonError.set(null);
        const raw = this.jsonInput();
        if (!raw.trim()) return;

        try {
            const parsed = JSON.parse(raw);

            // Papaparse unparse
            const csv = Papa.unparse(parsed, {
                quotes: false, // or true
                quoteChar: '"',
                escapeChar: '"',
                delimiter: ",",
                header: true,
                newline: "\n",
            });

            this.csvInput.set(csv);
        } catch (e: any) {
            this.jsonError.set('Invalid JSON: ' + e.message);
        }
    }

    convertCsvToJson() {
        this.csvError.set(null);
        const raw = this.csvInput();
        if (!raw.trim()) return;

        // Papaparse parse
        const result = Papa.parse(raw, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });

        if (result.errors && result.errors.length > 0) {
            // Just show the first error for simplicity
            this.csvError.set('CSV Parsing Error: ' + result.errors[0].message);
            return;
        }

        this.jsonInput.set(JSON.stringify(result.data, null, 2));
    }
}
