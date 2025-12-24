import { Injectable, signal, computed } from '@angular/core';

export interface CloudflareConfig {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
}

@Injectable({
    providedIn: 'root'
})
export class ConfigService {
    private _config = signal<CloudflareConfig | null>(null);
    config = computed(() => this._config());
    hasConfig = computed(() => !!this._config());

    constructor() {
        // Load from storage
        const stored = localStorage.getItem('devflare_cf_config');
        if (stored) {
            try {
                this._config.set(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse stored config', e);
            }
        }
    }

    saveConfig(config: CloudflareConfig) {
        this._config.set(config);
        localStorage.setItem('devflare_cf_config', JSON.stringify(config));
    }

    clearConfig() {
        this._config.set(null);
        localStorage.removeItem('devflare_cf_config');
    }
}
