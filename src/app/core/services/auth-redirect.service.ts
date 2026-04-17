import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';
import { OrgStateService } from './org-state.service';

@Injectable({ providedIn: 'root' })
export class AuthRedirectService {
  private readonly guestOnlyRoutes = ['/login', '/register', '/reset-password', '/accept-invitation'];

  constructor(
    private auth: AuthService,
    private orgState: OrgStateService
  ) {}

  resolveAuthenticatedUrl(returnUrl?: string | null): Observable<string> {
    const safeReturnUrl = this.sanitizeReturnUrl(returnUrl);
    if (safeReturnUrl) {
      return of(safeReturnUrl);
    }

    if (this.auth.getCurrentAccount()?.tenant_id) {
      return of('/');
    }

    return this.orgState.ensureLoaded().pipe(
      map((org) => (org ? '/' : '/organizations/add')),
      catchError(() => of('/organizations/add'))
    );
  }

  sanitizeReturnUrl(returnUrl?: string | null): string | null {
    const url = String(returnUrl || '').trim();
    if (!url || !url.startsWith('/') || url.startsWith('//')) {
      return null;
    }

    const normalizedPath = url.split('?')[0].split('#')[0];
    const isGuestOnlyRoute = this.guestOnlyRoutes.some(
      (route) => normalizedPath === route || normalizedPath.startsWith(`${route}/`)
    );

    return isGuestOnlyRoute ? null : url;
  }
}
