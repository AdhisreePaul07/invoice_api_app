import { Injectable } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  catchError,
  filter,
  switchMap,
  take,
  throwError,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const isApiReq = req.url.startsWith(environment.apiBaseUrl);
    if (!isApiReq) return next.handle(req);

    const isAuthCall = req.url.includes('/api/auth/');
    const isPublicAuthCall =
      req.url.includes('/api/auth/csrf') ||
      req.url.includes('/api/auth/login') ||
      req.url.includes('/api/auth/refresh') ||
      req.url.includes('/api/auth/register/') ||
      req.url.includes('/api/auth/password-reset/') ||
      req.url.includes('/api/auth/invitations/accept');

    const headers: Record<string, string> = {
      'X-API-KEY': environment.apiKey,
    };

    const csrfToken = this.auth.getCsrfToken();
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }

    const access = this.auth.getAccessToken();
    if (access && !isPublicAuthCall) {
      headers['Authorization'] = `Bearer ${access}`;
    }

    const request = req.clone({
      withCredentials: true,
      setHeaders: headers,
    });

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status !== 401 || isPublicAuthCall || req.url.includes('/api/auth/refresh')) {
          return throwError(() => error);
        }

        if (!this.isRefreshing) {
          this.isRefreshing = true;
          this.refreshSubject.next(null);

          return this.auth.refreshToken().pipe(
            switchMap((res) => {
              this.isRefreshing = false;

              if (!res?.access) {
                this.auth.forceLogout();
                return throwError(() => error);
              }

              this.refreshSubject.next(res.access);

              const retryHeaders: Record<string, string> = {
                'X-API-KEY': environment.apiKey,
              };

              const nextCsrfToken = this.auth.getCsrfToken();
              if (nextCsrfToken) {
                retryHeaders['X-CSRFToken'] = nextCsrfToken;
              }

              if (!isPublicAuthCall) {
                retryHeaders['Authorization'] = `Bearer ${res.access}`;
              }

              const retryReq = req.clone({
                withCredentials: true,
                setHeaders: retryHeaders,
              });

              return next.handle(retryReq);
            }),
            catchError((refreshError) => {
              this.isRefreshing = false;
              this.auth.forceLogout();
              return throwError(() => refreshError);
            })
          );
        }

        return this.refreshSubject.pipe(
          filter((token): token is string => token !== null),
          take(1),
          switchMap((token) => {
            const retryHeaders: Record<string, string> = {
              'X-API-KEY': environment.apiKey,
            };

            const nextCsrfToken = this.auth.getCsrfToken();
            if (nextCsrfToken) {
              retryHeaders['X-CSRFToken'] = nextCsrfToken;
            }

            if (!isPublicAuthCall) {
              retryHeaders['Authorization'] = `Bearer ${token}`;
            }

            return next.handle(
              req.clone({
                withCredentials: true,
                setHeaders: retryHeaders,
              })
            );
          })
        );
      })
    );
  }
}
