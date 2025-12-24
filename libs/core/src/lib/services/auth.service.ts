import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { of, delay, tap, Observable } from 'rxjs';

export interface User {
    id: string;
    name: string;
    email: string;
    avatar?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private _currentUser = signal<User | null>(null);
    currentUser = computed(() => this._currentUser());
    isLoggedIn = computed(() => !!this._currentUser());

    constructor(private router: Router) {
        // Check local storage for persisted session (mock)
        const stored = localStorage.getItem('devflare_user');
        if (stored) {
            this._currentUser.set(JSON.parse(stored));
        }
    }

    login(email: string, password: string): Observable<boolean> {
        return of(true).pipe(
            delay(800), // Simulate network
            tap(() => {
                let user: User;

                if (email === 'admin' && password === 'admin') {
                    user = {
                        id: 'admin_1',
                        name: 'Administrator',
                        email: 'admin@devflare.com',
                        avatar: 'AD'
                    };
                } else {
                    user = {
                        id: 'u_123',
                        name: 'Demo User',
                        email: email,
                        avatar: 'JD' // Initials for now
                    };
                }

                this._currentUser.set(user);
                localStorage.setItem('devflare_user', JSON.stringify(user));
            })
        );
    }

    signup(name: string, email: string, password: string): Observable<boolean> {
        return of(true).pipe(
            delay(1000),
            tap(() => {
                const user: User = {
                    id: 'u_' + Date.now(),
                    name,
                    email,
                    avatar: name.substring(0, 2).toUpperCase()
                };
                this._currentUser.set(user);
                localStorage.setItem('devflare_user', JSON.stringify(user));
            })
        );
    }

    logout() {
        this._currentUser.set(null);
        localStorage.removeItem('devflare_user');
        this.router.navigate(['/auth/sign-in']);
    }
}
