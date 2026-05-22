import { Injectable } from '@angular/core';
import * as Papa from 'papaparse';

export interface CsvParseResult<T = any> {
  data: T[];
  errors: Papa.ParseError[];
}

@Injectable({
  providedIn: 'root',
})
export class DataConverterService {
  jsonToCsv(json: string): { csv: string; error?: string } {
    try {
      const parsed = JSON.parse(json);
      const csv = Papa.unparse(parsed, {
        quotes: false,
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        header: true,
        newline: '\n',
      });
      return { csv };
    } catch (e: any) {
      return { csv: '', error: 'Invalid JSON: ' + e.message };
    }
  }

  csvToJson(csv: string): { json: string; error?: string } {
    const result = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    });

    if (result.errors && result.errors.length > 0) {
      return { json: '', error: 'CSV Error: ' + result.errors[0].message };
    }

    return { json: JSON.stringify(result.data, null, 2) };
  }

  prettifyJson(json: string): { pretty: string; error?: string } {
    try {
      const parsed = JSON.parse(json);
      return { pretty: JSON.stringify(parsed, null, 2) };
    } catch (e: any) {
      return { pretty: '', error: 'Invalid JSON: ' + e.message };
    }
  }
}
