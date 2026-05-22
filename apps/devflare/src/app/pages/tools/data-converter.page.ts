import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as Papa from 'papaparse';
import { LucideAngularModule } from 'lucide-angular';
import {
  VoltCard,
  VoltCardHeader,
  VoltCardTitle,
  VoltCardContent,
  VoltTextarea,
  VoltButton,
  VoltBadge,
} from '@voltui/components';

@Component({
  selector: 'app-data-converter-page',
  imports: [
    FormsModule,
    LucideAngularModule,
    VoltCard,
    VoltCardHeader,
    VoltCardTitle,
    VoltCardContent,
    VoltTextarea,
    VoltButton,
    VoltBadge,
  ],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Data Converter</h1>
        <p class="text-muted-foreground mt-1">Convert between JSON and CSV formats instantly</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <!-- JSON Panel -->
        <volt-card>
          <volt-card-header class="flex flex-row items-center justify-between">
            <volt-card-title>JSON</volt-card-title>
            <div class="flex gap-2">
              <volt-button size="sm" variant="ghost" (click)="prettifyJson()">Prettify</volt-button>
              <volt-button size="sm" variant="ghost" (click)="clearJson()">Clear</volt-button>
            </div>
          </volt-card-header>
          <volt-card-content>
            <volt-textarea
              [(value)]="jsonInput"
              (valueChange)="onJsonChange($event)"
              placeholder='[{"name": "John", "age": 30}]'
              class="font-mono text-xs"
              [rows]="14"
              resize="vertical"
              [state]="jsonError() ? 'error' : 'default'"
            />
            @if (jsonError()) {
              <p class="text-xs text-red-500 font-medium mt-2">{{ jsonError() }}</p>
            }
          </volt-card-content>
        </volt-card>

        <!-- Controls -->
        <div class="flex lg:flex-col items-center justify-center gap-4 py-2">
          <volt-button variant="solid" (click)="convertJsonToCsv()" title="JSON → CSV">
            <lucide-icon name="arrow-right-left" class="w-4 h-4 lg:rotate-0 rotate-90" />
            <span class="ml-2 hidden lg:inline">JSON → CSV</span>
          </volt-button>
          <volt-button variant="outline" (click)="convertCsvToJson()" title="CSV → JSON">
            <lucide-icon name="arrow-right-left" class="w-4 h-4 lg:rotate-0 rotate-90" />
            <span class="ml-2 hidden lg:inline">CSV → JSON</span>
          </volt-button>
        </div>

        <!-- CSV Panel -->
        <volt-card>
          <volt-card-header class="flex flex-row items-center justify-between">
            <volt-card-title>CSV</volt-card-title>
            <volt-button size="sm" variant="ghost" (click)="clearCsv()">Clear</volt-button>
          </volt-card-header>
          <volt-card-content>
            <volt-textarea
              [(value)]="csvInput"
              placeholder="name,age&#10;John,30"
              class="font-mono text-xs"
              [rows]="14"
              resize="vertical"
              [state]="csvError() ? 'error' : 'default'"
            />
            @if (csvError()) {
              <p class="text-xs text-red-500 font-medium mt-2">{{ csvError() }}</p>
            }
          </volt-card-content>
        </volt-card>
      </div>
    </div>
  `,
})
export default class DataConverterPageComponent {
  jsonInput = signal('');
  csvInput = signal('');
  jsonError = signal<string | null>(null);
  csvError = signal<string | null>(null);

  onJsonChange(value: string) {
    this.jsonInput.set(value);
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
      const csv = Papa.unparse(parsed, {
        quotes: false,
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        header: true,
        newline: '\n',
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

    const result = Papa.parse(raw, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (result.errors && result.errors.length > 0) {
      this.csvError.set('CSV Error: ' + result.errors[0].message);
      return;
    }

    this.jsonInput.set(JSON.stringify(result.data, null, 2));
  }
}
