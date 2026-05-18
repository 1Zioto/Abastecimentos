// src/app/core/services/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { finalize, map, shareReplay, tap } from 'rxjs/operators';
import { AuthUser, LoginResponse } from '../../shared/models';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_RETRY } from '../interceptors/auth-context';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly garagensDisponiveis = ['Matriz', 'Viana'];
  private readonly TOKEN_KEY = 'ft_token';
  private readonly USER_KEY  = 'ft_user';
  private readonly GARAGE_KEY = 'ft_garagem';
  private _user = signal<AuthUser | null>(this.loadUser());
  private refreshInFlight$?: Observable<string>;

  constructor(private http: HttpClient, private router: Router) {}

  login(login: string, password: string) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { login, password }).pipe(
      tap(res => {
        this.setToken(res.token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
        this._user.set(res.user);
      })
    );
  }

  logout(redirect = true) {
    this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ error: () => {} });
    this.clearSession(redirect);
  }

  getGaragem(): string | null {
    return localStorage.getItem(this.GARAGE_KEY);
  }

  setGaragem(garagem: string) {
    if (!this.canAccessGaragem(garagem)) return;
    const anterior = this.getGaragem();
    localStorage.setItem(this.GARAGE_KEY, garagem);
    if (anterior !== garagem) {
      window.dispatchEvent(new CustomEvent('garagem:changed', { detail: { garagem } }));
    }
  }

  hasGaragem(): boolean {
    const garagem = this.getGaragem();
    return !!garagem && this.canAccessGaragem(garagem);
  }

  clearGaragem() {
    localStorage.removeItem(this.GARAGE_KEY);
  }

  getFiliaisAcesso(): string[] {
    const user = this._user();
    const filiais = Array.isArray(user?.filiais_acesso) ? user!.filiais_acesso! : [];
    const validas = filiais.filter(filial => this.garagensDisponiveis.includes(filial));
    return validas.length ? validas : [...this.garagensDisponiveis];
  }

  canAccessGaragem(garagem: string | null | undefined): boolean {
    if (!garagem) return false;
    return this.getFiliaisAcesso().includes(garagem);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  currentUser(): AuthUser | null {
    return this._user();
  }

  isAdmin(): boolean {
    return this._user()?.tipo === 'admin';
  }

  isOperator(): boolean {
    return this._user()?.tipo === 'operador';
  }

  canCreateOperationalRecords(): boolean {
    const tipo = this._user()?.tipo;
    return tipo === 'admin' || tipo === 'operador';
  }

  refreshToken(): Observable<string> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.http
      .post<{ token: string }>(
        `${environment.apiUrl}/auth/refresh`,
        {},
        { context: new HttpContext().set(SKIP_AUTH_RETRY, true) }
      )
      .pipe(
        map(res => res?.token),
        tap(token => {
          if (!token) {
            throw new Error('Token não retornado no refresh');
          }
          this.setToken(token);
        }),
        map(token => token as string),
        finalize(() => {
          this.refreshInFlight$ = undefined;
        }),
        shareReplay(1)
      );

    return this.refreshInFlight$;
  }

  clearSession(redirect = true) {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.GARAGE_KEY);
    this._user.set(null);
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  private setToken(token: string) {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  private loadUser(): AuthUser | null {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}
