import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, delay } from 'rxjs';

export interface StorageItem {
    name: string;
    type: 'file' | 'folder';
    size?: number;
    lastModified?: Date;
    path: string;
}

@Injectable({
    providedIn: 'root'
})
export class StorageService {
    // baseUrl = 'https://api.cloudflare.com/client/v4/accounts/...'; 
    // In a real app, this would be an API Proxy or Worker URL to avoid exposing Cloudflare keys on client.

    constructor(private http: HttpClient) { }

    /**
     * Mocks listing files from R2
     */
    listFiles(path: string): Observable<StorageItem[]> {
        // Mock data for MVP
        const items: StorageItem[] = [
            { name: 'assets', type: 'folder', path: `${path}assets/` },
            { name: 'documents', type: 'folder', path: `${path}documents/` },
            { name: 'logo.png', type: 'file', size: 1024 * 50, lastModified: new Date(), path: `${path}logo.png` },
            { name: 'banner.jpg', type: 'file', size: 1024 * 500, lastModified: new Date(), path: `${path}banner.jpg` },
        ];

        if (path.includes('assets')) {
            return of<StorageItem[]>([
                { name: 'icons', type: 'folder', path: `${path}icons/` },
                { name: 'bg.webp', type: 'file', size: 1024 * 200, lastModified: new Date(), path: `${path}bg.webp` }
            ]).pipe(delay(500));
        }

        return of(items).pipe(delay(500));
    }

    createFolder(name: string, path: string): Observable<boolean> {
        console.log(`Creating folder ${name} at ${path}`);
        return of(true).pipe(delay(300));
    }

    uploadFile(file: File, path: string): Observable<boolean> {
        console.log(`Uploading ${file.name} to ${path}`);
        return of(true).pipe(delay(1000));
    }
}
