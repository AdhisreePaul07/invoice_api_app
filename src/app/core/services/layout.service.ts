import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LayoutService {
  private readonly sidebarOpenSubject = new BehaviorSubject<boolean>(false);
  private readonly sidebarMiniSubject = new BehaviorSubject<boolean>(false);

  readonly sidebarOpen$ = this.sidebarOpenSubject.asObservable();
  readonly sidebarMini$ = this.sidebarMiniSubject.asObservable();

  openSidebar(): void {
    this.sidebarOpenSubject.next(true);
  }

  closeSidebar(): void {
    this.sidebarOpenSubject.next(false);
  }

  toggleSidebar(): void {
    this.sidebarOpenSubject.next(!this.sidebarOpenSubject.value);
  }

  toggleSidebarMini(): void {
    this.sidebarMiniSubject.next(!this.sidebarMiniSubject.value);
  }

  resetDesktopSidebar(): void {
    this.sidebarMiniSubject.next(false);
  }
}
