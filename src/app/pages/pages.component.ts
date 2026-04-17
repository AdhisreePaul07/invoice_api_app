import { Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { HeaderComponent } from '../shared/layout/header/header.component';
import { SidebarComponent } from '../shared/layout/sidebar/sidebar.component';
import { FooterComponent } from '../shared/layout/footer/footer.component';
import { GstCalculatorComponent } from '../shared/layout/gst-calculator/gst-calculator.component';
import { LayoutService } from '../core/services/layout.service';


@Component({
  selector: 'app-pages',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, SidebarComponent, FooterComponent, GstCalculatorComponent],
  templateUrl: './pages.component.html',
  styleUrls: ['./pages.component.scss'],
})
export class PagesComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private routeSkeletonTimer: ReturnType<typeof setTimeout> | null = null;
  readonly sidebarMini$;
  routeLoading = false;

  constructor(private layout: LayoutService) {
    this.sidebarMini$ = this.layout.sidebarMini$;
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationStart) {
        if (this.routeSkeletonTimer) {
          clearTimeout(this.routeSkeletonTimer);
        }

        this.routeSkeletonTimer = setTimeout(() => {
          this.routeLoading = true;
          this.routeSkeletonTimer = null;
        }, 120);
        return;
      }

      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        if (this.routeSkeletonTimer) {
          clearTimeout(this.routeSkeletonTimer);
          this.routeSkeletonTimer = null;
        }

        this.routeLoading = false;
      }
    });
  }
}
