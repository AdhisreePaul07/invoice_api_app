import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, CanActivateChild, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';

import { AuthRedirectService } from '../services/auth-redirect.service';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild {
  constructor(
    private auth: AuthService,
    private router: Router,
    private authRedirect: AuthRedirectService
  ) {}

  canActivate(_: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    return this.checkAccess(state.url);
  }

  canActivateChild(_: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean | UrlTree> {
    return this.checkAccess(state.url);
  }

  private checkAccess(returnUrl: string): Observable<boolean | UrlTree> {
    const safeReturnUrl = this.authRedirect.sanitizeReturnUrl(returnUrl);

    return this.auth.ensureSession().pipe(
      map((ok) =>
        ok
          ? true
          : this.router.createUrlTree(['/login'], {
              queryParams: { returnUrl: safeReturnUrl || undefined },
            })
      ),
      catchError(() =>
        of(
          this.router.createUrlTree(['/login'], {
            queryParams: { returnUrl: safeReturnUrl || undefined },
          })
        )
      )
    );
  }
}
