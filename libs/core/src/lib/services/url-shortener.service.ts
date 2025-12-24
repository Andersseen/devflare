import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, delay, of } from 'rxjs';

export interface ShortenResponse {
    shortUrl: string;
    slug: string;
}

export interface ShortenRequest {
    originalUrl: string;
    slug?: string;
}

@Injectable({
    providedIn: 'root'
})
export class UrlShortenerService {
    // private apiUrl = 'https://api.devflare.com/api/shorten'; 
    // Using a mock URL for now as per requirements, but typically this would be env var
    private apiUrl = 'https://api.devflare.com/api/shorten';

    constructor(private http: HttpClient) { }

    shortenUrl(originalUrl: string, slug?: string): Observable<ShortenResponse> {
        // Mock implementation for demo purposes since the backend doesn't practically exist yet at this domain
        // In a real scenario: return this.http.post<ShortenResponse>(this.apiUrl, { originalUrl, slug });

        // Simulating network delay and response
        const mockSlug = slug || Math.random().toString(36).substring(2, 8);
        return of({
            shortUrl: `https://devflare.link/${mockSlug}`,
            slug: mockSlug
        }).pipe(delay(800));
    }
}
