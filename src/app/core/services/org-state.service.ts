import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, finalize, map, of, shareReplay } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { Organization } from '../models/organization.model';
import { AuthService } from './auth.service';
import { OrganizationService } from './organization.service';

@Injectable({ providedIn: 'root' })
export class OrgStateService {
  private orgSubject = new BehaviorSubject<Organization | null>(null);
  readonly org$ = this.orgSubject.asObservable();

  private loaded = false;
  private inflight$?: Observable<Organization | null>;
  private activeTenantId: number | null;

  constructor(
    private orgService: OrganizationService,
    private auth: AuthService
  ) {
    this.activeTenantId = this.auth.getCurrentAccount()?.tenant_id ?? null;

    this.auth.currentAccount$.subscribe((account) => {
      const nextTenantId = account?.tenant_id ?? null;

      if (nextTenantId !== this.activeTenantId) {
        this.clear();
      }

      this.activeTenantId = nextTenantId;
    });
  }

  get current(): Organization | null {
    return this.orgSubject.value;
  }

  get hasOrg(): boolean {
    return !!this.orgSubject.value;
  }

  setOrg(org: Organization | null): void {
    this.loaded = true;
    this.orgSubject.next(org);
  }

  clear(): void {
    this.loaded = false;
    this.orgSubject.next(null);
  }

  ensureLoaded(): Observable<Organization | null> {
    if (this.loaded) return of(this.orgSubject.value);
    return this.refresh();
  }

  refresh(): Observable<Organization | null> {
    if (this.inflight$) return this.inflight$;

    this.inflight$ = this.orgService.list().pipe(
      map((res: any) => {
        const profileTenantId = this.auth.getCurrentAccount()?.tenant_id;
        const orgList = Array.isArray(res?.list) ? res.list : [];
        const org =
          (profileTenantId ? orgList.find((item: Organization) => item.id === profileTenantId) : null) ||
          orgList[0] ||
          null;

        this.loaded = true;
        this.orgSubject.next(org);
        return org;
      }),
      catchError(() => {
        this.loaded = true;
        this.orgSubject.next(null);
        return of(null);
      }),
      finalize(() => {
        this.inflight$ = undefined;
      }),
      shareReplay(1)
    );

    return this.inflight$;
  }
}
