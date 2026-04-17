import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  AccountProfile,
  LoginRequest,
  LoginResponse,
  OrganizationSummary,
  UserSession,
  UserSettings,
} from '../models/auth.model';
import { ImageAsset } from '../models/image.model';

type AuthenticatedApiResponse = {
  access: string;
  user?: AccountProfile | null;
};

type OrganizationAuthResponse = AuthenticatedApiResponse & {
  code: number;
  message: string;
  organization: OrganizationSummary;
};

type ProfileImageResponse = {
  code: number;
  message?: string;
  profile_image: ImageAsset;
  user?: AccountProfile | null;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseApiUrl = `${environment.apiBaseUrl}/api`;
  private readonly authUrl = `${this.baseApiUrl}/auth`;

  private readonly PROFILE_KEY = 'account_profile';
  private readonly USER_SETTINGS_KEY = 'users_settings';
  private readonly ACCESS_KEY = 'access';
  private readonly CSRF_KEY = 'invoice_csrf_token';

  private accessToken: string | null = null;
  private csrfToken: string | null = null;

  private currentAccountSubject = new BehaviorSubject<AccountProfile | null>(null);
  readonly currentAccount$ = this.currentAccountSubject.asObservable();

  private sessionInit$?: Observable<boolean>;
  private csrfInit$?: Observable<string>;

  constructor(private http: HttpClient, private router: Router) {
    if (this.isBrowser()) {
      // Keep access tokens in memory only and clear any legacy persisted copy.
      this.removeStorageItem(this.ACCESS_KEY);
      this.csrfToken =
        sessionStorage.getItem(this.CSRF_KEY) ||
        (this.canMirrorCsrfCookie() ? this.readCookie('csrftoken') : null);
    }

    const cachedProfile = this.readJson<AccountProfile>(this.PROFILE_KEY);
    if (cachedProfile) {
      this.currentAccountSubject.next(cachedProfile);
    }
  }

  ensureCsrf(force = false): Observable<string> {
    const existing = force ? null : this.getCsrfToken();
    if (existing) {
      this.ensureMirroredCsrfCookie(existing);
      return of(existing);
    }
    if (!force && this.csrfInit$) return this.csrfInit$;

    this.csrfInit$ = this.http.get<{ csrfToken?: string }>(`${this.authUrl}/csrf`).pipe(
      map((res) => {
        const token = res?.csrfToken || this.readCookie('csrftoken') || '';
        this.setCsrfToken(token);
        return token;
      }),
      finalize(() => {
        this.csrfInit$ = undefined;
      }),
      shareReplay(1)
    );

    return this.csrfInit$;
  }

  login(payload: LoginRequest): Observable<LoginResponse> {
    return this.ensureCsrf().pipe(
      switchMap(() => this.http.post<LoginResponse>(`${this.authUrl}/login`, payload)),
      tap((res) => this.persistAuthenticatedResponse(res))
    );
  }

  requestRegistrationOtp(payload: { email: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/register/request-otp`, payload));
  }

  verifyRegistrationOtp(payload: { email: string; otp_code: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/register/verify-otp`, payload));
  }

  completeRegistration(payload: {
    email: string;
    first_name: string;
    last_name?: string;
    password: string;
    organization_name: string;
  }): Observable<OrganizationAuthResponse> {
    return this.withCsrf(() =>
      this.http.post<OrganizationAuthResponse>(`${this.authUrl}/register/complete`, payload).pipe(
        tap((res) => this.persistAuthenticatedResponse(res))
      )
    );
  }

  acceptInvitation(payload: {
    token: string;
    first_name: string;
    last_name?: string;
    password: string;
  }): Observable<OrganizationAuthResponse> {
    return this.withCsrf(() =>
      this.http.post<OrganizationAuthResponse>(`${this.authUrl}/invitations/accept`, payload).pipe(
        tap((res) => this.persistAuthenticatedResponse(res))
      )
    );
  }

  requestPasswordResetOtp(payload: { email: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/password-reset/request-otp`, payload));
  }

  verifyPasswordResetOtp(payload: { email: string; otp_code: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/password-reset/verify-otp`, payload));
  }

  confirmPasswordReset(payload: { email: string; new_password: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/password-reset/confirm`, payload));
  }

  refreshToken(): Observable<{ access: string } | null> {
    return this.ensureCsrf().pipe(
      switchMap(() =>
        this.http.post<{ access: string }>(`${this.authUrl}/refresh`, {}, { observe: 'response' })
      ),
      map((resp: HttpResponse<{ access: string }>) => {
        if (resp.status === 204) return null;

        const access = resp.body?.access;
        if (!access) throw new Error('INVALID_REFRESH_RESPONSE');

        this.persistAccessToken(access);
        return { access };
      })
    );
  }

  ensureSession(): Observable<boolean> {
    if (this.currentAccountSubject.value && this.accessToken) return of(true);
    if (this.sessionInit$) return this.sessionInit$;

    const bootstrap$ = this.accessToken
      ? this.loadProfile().pipe(
          map(() => true),
          catchError(() => this.refreshAndLoadProfile())
        )
      : this.refreshAndLoadProfile();

    this.sessionInit$ = bootstrap$.pipe(
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
      finalize(() => {
        this.sessionInit$ = undefined;
      }),
      shareReplay(1)
    );

    return this.sessionInit$;
  }

  loadProfile(): Observable<AccountProfile> {
    return this.http.get<AccountProfile>(`${this.authUrl}/me`).pipe(
      tap((account) => {
        this.hydrateAccount(account);
      })
    );
  }

  getProfileImage(): Observable<{ code: number; profile_image: ImageAsset }> {
    return this.http.get<{ code: number; profile_image: ImageAsset }>(`${this.authUrl}/me/image`);
  }

  uploadProfileImage(file: File): Observable<ProfileImageResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.withCsrf(() => this.http.patch<ProfileImageResponse>(`${this.authUrl}/me/image`, formData)).pipe(
      tap((response) => {
        if (response?.user) {
          this.hydrateAccount(response.user);
        }
      })
    );
  }

  deleteProfileImage(): Observable<ProfileImageResponse> {
    return this.withCsrf(() => this.http.delete<ProfileImageResponse>(`${this.authUrl}/me/image`)).pipe(
      tap((response) => {
        if (response?.user) {
          this.hydrateAccount(response.user);
        }
      })
    );
  }

  listSessions(): Observable<{ code: number; count: number; list: UserSession[] }> {
    return this.http.get<{ code: number; count: number; list: UserSession[] }>(`${this.authUrl}/sessions`);
  }

  revokeSession(payload: { session_id?: string; session_key?: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/sessions/revoke`, payload));
  }

  changePassword(payload: { old_password: string; new_password: string }): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/change-password`, payload));
  }

  logout(): void {
    this.withCsrf(() => this.http.post(`${this.authUrl}/logout`, {})).subscribe({
      next: () => this.forceLogout(),
      error: () => this.forceLogout(),
    });
  }

  logoutOtherSessions(): Observable<any> {
    return this.withCsrf(() => this.http.post(`${this.authUrl}/logout-others`, {})).pipe(
      catchError((err) => {
        if (err?.status === 404) {
          return this.http.post(`${this.authUrl}/logout-other`, {});
        }
        return throwError(() => err);
      })
    );
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getCsrfToken(): string | null {
    return this.csrfToken || (this.canMirrorCsrfCookie() ? this.readCookie('csrftoken') : null);
  }

  isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  getCurrentAccount(): AccountProfile | null {
    return this.currentAccountSubject.value;
  }

  getUserSettings(): UserSettings | null {
    return this.readJson<UserSettings>(this.USER_SETTINGS_KEY);
  }

  clearSession(): void {
    this.accessToken = null;
    this.currentAccountSubject.next(null);
    this.removeStorageItem(this.PROFILE_KEY);
    this.removeStorageItem(this.USER_SETTINGS_KEY);
    this.removeStorageItem(this.ACCESS_KEY);
  }

  forceLogout(): void {
    this.clearSession();
    void this.router.navigateByUrl(this.buildLoginRedirectUrl(this.router.url));
  }

  private refreshAndLoadProfile(): Observable<boolean> {
    return this.refreshToken().pipe(
      switchMap((res) => {
        if (!res?.access) {
          this.clearSession();
          return of(false);
        }

        return this.loadProfile().pipe(
          map(() => true),
          catchError(() => {
            this.clearSession();
            return of(false);
          })
        );
      })
    );
  }

  private withCsrf<T>(factory: () => Observable<T>): Observable<T> {
    return this.ensureCsrf().pipe(switchMap(() => factory()));
  }

  private hydrateAccount(account: AccountProfile | null): void {
    if (!account) return;

    this.currentAccountSubject.next(account);
    this.writeJson(this.PROFILE_KEY, account);

    if (account.user_settings) {
      this.writeJson(this.USER_SETTINGS_KEY, account.user_settings);
    }
  }

  private persistAccessToken(access: string): void {
    this.accessToken = access;
    this.removeStorageItem(this.ACCESS_KEY);
  }

  private persistAuthenticatedResponse(response: AuthenticatedApiResponse): void {
    this.persistAccessToken(response.access);
    if (response.user) {
      this.hydrateAccount(response.user);
    }
  }

  private setCsrfToken(token: string | null): void {
    this.csrfToken = token || null;
    if (token) {
      this.setSessionItem(this.CSRF_KEY, token);
      this.syncCsrfMirrorCookie(token);
    } else {
      this.removeSessionItem(this.CSRF_KEY);
      this.clearCsrfMirrorCookie();
    }
  }

  private readJson<T>(key: string): T | null {
    if (!this.isBrowser()) return null;

    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private writeJson(key: string, value: unknown): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  private removeStorageItem(key: string): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(key);
  }

  private setSessionItem(key: string, value: string): void {
    if (!this.isBrowser()) return;
    sessionStorage.setItem(key, value);
  }

  private removeSessionItem(key: string): void {
    if (!this.isBrowser()) return;
    sessionStorage.removeItem(key);
  }

  private readCookie(name: string): string | null {
    if (!this.isBrowser() || typeof document === 'undefined') return null;

    const prefix = `${name}=`;
    const parts = document.cookie.split(';').map((item) => item.trim());
    const match = parts.find((item) => item.startsWith(prefix));
    return match ? decodeURIComponent(match.slice(prefix.length)) : null;
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private canMirrorCsrfCookie(): boolean {
    if (!this.isBrowser()) return false;

    try {
      return new URL(environment.apiBaseUrl).hostname === window.location.hostname;
    } catch {
      return false;
    }
  }

  // Django requires the CSRF cookie to be present in addition to the header.
  // When the SPA and API share the same host in local development, mirror the
  // token into a host cookie so auth POSTs can proceed even if the backend
  // cookie is not persisted by the browser.
  private syncCsrfMirrorCookie(token: string): void {
    if (!this.canMirrorCsrfCookie() || typeof document === 'undefined') return;

    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `csrftoken=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}`;
  }

  private clearCsrfMirrorCookie(): void {
    if (!this.canMirrorCsrfCookie() || typeof document === 'undefined') return;

    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `csrftoken=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }

  private ensureMirroredCsrfCookie(token: string): void {
    if (!this.canMirrorCsrfCookie()) return;
    if (this.readCookie('csrftoken')) return;

    this.syncCsrfMirrorCookie(token);
  }

  private buildLoginRedirectUrl(returnUrl?: string | null): string {
    const safeReturnUrl = this.sanitizeReturnUrl(returnUrl);
    if (!safeReturnUrl) {
      return '/login';
    }

    return `/login?returnUrl=${encodeURIComponent(safeReturnUrl)}`;
  }

  private sanitizeReturnUrl(returnUrl?: string | null): string | null {
    const url = String(returnUrl || '').trim();
    if (!url || !url.startsWith('/') || url.startsWith('//')) {
      return null;
    }

    const normalizedPath = url.split('?')[0].split('#')[0];
    const guestOnlyRoutes = ['/login', '/register', '/reset-password', '/accept-invitation'];
    const isGuestOnlyRoute = guestOnlyRoutes.some(
      (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`)
    );

    return isGuestOnlyRoute ? null : url;
  }
}
