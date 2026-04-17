import { Injectable } from '@angular/core';
import { CanActivateChild, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { OrgStateService } from '../services/org-state.service';

@Injectable({ providedIn: 'root' })
export class OrgSetupGuard implements CanActivateChild {
  constructor(private orgState: OrgStateService, private router: Router) {}

  canActivateChild(_: any, state: any): Observable<boolean | UrlTree> {
    const url: string = state.url || '';
    const goingToOrgAdd = url.startsWith('/organizations/add');

    return this.orgState.ensureLoaded().pipe(
      map((org) => {
        if (!org && !goingToOrgAdd) return this.router.parseUrl('/organizations/add');
        if (org && goingToOrgAdd) return this.router.parseUrl('/organizations');
        return true;
      })
    );
  }
}
