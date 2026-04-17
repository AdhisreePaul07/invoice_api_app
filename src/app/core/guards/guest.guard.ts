import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of, switchMap } from 'rxjs';

import { AuthRedirectService } from '../services/auth-redirect.service';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
  constructor(
    private auth: AuthService,
    private router: Router,
    private authRedirect: AuthRedirectService
  ) {}

  canActivate(route: ActivatedRouteSnapshot, _: RouterStateSnapshot): Observable<boolean | UrlTree> {
    const requestedReturnUrl = route.queryParamMap.get('returnUrl');

    if (!this.auth.getAccessToken()) {
      return of(true);
    }

    return this.auth.ensureSession().pipe(
      switchMap((ok) => {
        if (!ok) {
          return of(true);
        }

        return this.authRedirect.resolveAuthenticatedUrl(requestedReturnUrl).pipe(
          map((url) => this.router.parseUrl(url))
        );
      }),
      catchError(() => of(true))
    );
  }
}
