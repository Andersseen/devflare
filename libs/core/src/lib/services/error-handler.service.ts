import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { Router } from '@angular/router';

export interface ErrorLog {
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalErrorHandler implements ErrorHandler {
  private router = inject(Router);
  private ngZone = inject(NgZone);

  private errorLogs: ErrorLog[] = [];

  handleError(error: Error | HttpErrorResponse): void {
    const errorLog: ErrorLog = {
      timestamp: new Date(),
      type: error.constructor.name,
      message: error.message,
      stack: error instanceof Error ? error.stack : undefined,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    };

    this.errorLogs.push(errorLog);

    if (this.errorLogs.length > 50) {
      this.errorLogs.shift();
    }

    if (error instanceof HttpErrorResponse) {
      this.handleHttpError(error);
    } else {
      this.handleClientError(error);
    }

    // Log to console
    console.error('[GlobalErrorHandler]', error);
  }

  private handleHttpError(error: HttpErrorResponse): void {
    switch (error.status) {
      case 401:
        this.ngZone.run(() => {
          this.router.navigate(['/auth/sign-in']);
        });
        break;
      case 403:
        console.error('Access denied:', error.message);
        break;
      case 404:
        console.error('Resource not found:', error.message);
        break;
      case 500:
        console.error('Server error:', error.message);
        break;
      default:
        console.error('HTTP error:', error.message);
    }
  }

  private handleClientError(error: Error): void {
    console.error('Client error:', error.message);
  }

  getErrorLogs(): ErrorLog[] {
    return [...this.errorLogs];
  }

  clearErrorLogs(): void {
    this.errorLogs = [];
  }
}
