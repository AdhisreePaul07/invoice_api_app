import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

import { GstCalculatorService } from '../../../core/services/gst-calculator.service';
import { LayoutService } from '../../../core/services/layout.service';

type SidebarTabId =
  | 'dashboard'
  | 'crm'
  | 'invoice'
  | 'profile';

interface SidebarEntry {
  kind: 'heading' | 'divider' | 'item';
  label?: string;
  iconClass?: string;
  chipColor?: string;
  route?: string;
  exact?: boolean;
  activeExactRoutes?: string[];
  activePrefixRoutes?: string[];
  badgeText?: string;
  badgeClass?: string;
  action?: 'gstCalculator';
}

interface SidebarTab {
  id: SidebarTabId;
  title: string;
  entries: SidebarEntry[];
}

const heading = (label: string): SidebarEntry => ({ kind: 'heading', label });
const divider = (): SidebarEntry => ({ kind: 'divider' });
const item = (
  label: string,
  options: Omit<SidebarEntry, 'kind' | 'label'> = {},
): SidebarEntry => ({
  kind: 'item',
  label,
  badgeClass: 'text-bg-success',
  ...options,
});

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  readonly sidebarOpen$;
  readonly tabs: SidebarTab[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      entries: [
        heading('Dashboard'),
        item('Default Dashboard', {
          route: '/',
          exact: true,
          iconClass: 'fi fi-rr-house-blank',
        }),
        item('Our Dashboard', {
          route: '/dashboard/our',
          exact: true,
          iconClass: 'fi fi-rr-apps',
          activeExactRoutes: ['/dashboard/our'],
        }),
        item('Sales Dashboard', {
          route: '/accounts',
          iconClass: 'fi fi-rr-percent-100',
        }),
        item('Finance Dashboard', {
          route: '/invoices',
          iconClass: 'fi fi-rr-growth-chart-invest',
        }),
        item('Team Management', {
          route: '/organizations',
          iconClass: 'fi fi-rr-circle-user',
        }),
        item('Employees', {
          route: '/contacts',
          iconClass: 'fi fi-rr-employee-man',
        }),
        item('Customers', {
          route: '/accounts',
          iconClass: 'fi fi-rr-review',
        }),
        item('Review', {
          route: '/receipts',
          iconClass: 'fi fi-rr-star',
        }),
        item('Tasks & Projects', {
          route: '/items',
          chipColor: 'var(--app-danger)',
        }),
        item('User Management', {
          route: '/organizations',
          chipColor: 'var(--app-accent)',
        }),
        item('Activities', {
          route: '/receipts',
          chipColor: 'var(--app-warning)',
        }),
        item('Deals', {
          route: '/deals',
          chipColor: 'var(--app-primary)',
          badgeText: '+12%',
        }),
      ],
    },
    {
      id: 'crm',
      title: 'CRM',
      entries: [
        heading('Account'),
        item('All Accounts', {
          route: '/accounts',
          iconClass: 'fi fi-rr-buildings',
          activeExactRoutes: ['/accounts'],
          activePrefixRoutes: ['/accounts/edit'],
        }),
        item('Add Account', {
          route: '/accounts/add',
          iconClass: 'fi fi-rr-plus-small',
          exact: true,
          activeExactRoutes: ['/accounts/add'],
        }),
        divider(),
        heading('Contact'),
        item('All Contacts', {
          route: '/contacts',
          iconClass: 'fi fi-rr-address-book',
          activeExactRoutes: ['/contacts'],
          activePrefixRoutes: ['/contacts/edit'],
        }),
        item('Add Contact', {
          route: '/contacts/add',
          iconClass: 'fi fi-rr-plus-small',
          exact: true,
          activeExactRoutes: ['/contacts/add'],
        }),
        divider(),
        heading('Deals'),
        item('All Deals', {
          route: '/deals',
          iconClass: 'fi fi-rr-handshake',
          activeExactRoutes: ['/deals'],
          activePrefixRoutes: ['/deals/edit'],
        }),
        item('Add Deal', {
          route: '/deals/add',
          iconClass: 'fi fi-rr-plus-small',
          exact: true,
          activeExactRoutes: ['/deals/add'],
        }),
        divider(),
        heading('Items'),
        item('All Items', {
          route: '/items',
          iconClass: 'fi fi-rr-box-open-full',
          activeExactRoutes: ['/items'],
          activePrefixRoutes: ['/items/edit'],
        }),
        item('Add Item', {
          route: '/items/add',
          iconClass: 'fi fi-rr-plus-small',
          exact: true,
          activeExactRoutes: ['/items/add'],
        }),
      ],
    },
    {
      id: 'invoice',
      title: 'Invoice',
      entries: [
        heading('Invoice'),
        item('All Invoice', {
          route: '/invoices',
          iconClass: 'fi fi-rr-file-invoice-dollar',
          activeExactRoutes: ['/invoices'],
          activePrefixRoutes: ['/invoices/view', '/invoices/edit'],
        }),
        item('Add Invoice', {
          route: '/invoices/add',
          iconClass: 'fi fi-rr-plus-small',
          exact: true,
          activeExactRoutes: ['/invoices/add'],
        }),
        item('Templates', {
          route: '/invoices/templates',
          iconClass: 'fi fi-rr-layers',
          exact: true,
          activeExactRoutes: ['/invoices/templates'],
        }),
        item('GST Calculator', {
          iconClass: 'fi fi-rr-calculator',
          action: 'gstCalculator',
        }),
        item('Settings', {
          route: '/invoices/settings',
          iconClass: 'fi fi-rr-settings-sliders',
          exact: true,
          activeExactRoutes: ['/invoices/settings'],
        }),
        divider(),
        heading('Receipt'),
        item('All Receipts', {
          route: '/receipts',
          iconClass: 'fi fi-rr-receipt',
          activeExactRoutes: ['/receipts'],
          activePrefixRoutes: ['/receipts/edit'],
        }),
        item('Add Receipts', {
          route: '/receipts/add',
          iconClass: 'fi fi-rr-plus-small',
          exact: true,
          activeExactRoutes: ['/receipts/add'],
        }),
        item('Settings', {
          route: '/receipts/settings',
          iconClass: 'fi fi-rr-settings-sliders',
          exact: true,
          activeExactRoutes: ['/receipts/settings'],
        }),
      ],
    },
    {
      id: 'profile',
      title: 'Profile',
      entries: [
        heading('Profile'),
        item('Personal Info', {
          route: '/profile',
          iconClass: 'fi fi-rr-user',
          exact: true,
        }),
        item('Organization', {
          route: '/profile/organization',
          iconClass: 'fi fi-rr-building',
          exact: true,
        }),
        item('Security', {
          route: '/profile/security',
          iconClass: 'fi fi-rr-shield-check',
          exact: true,
        }),
      ],
    },
  ];

  activeTabId: SidebarTabId = 'dashboard';
  addCustomerOpen = false;
  currentUrl = '/';

  constructor(
    private router: Router,
    private layout: LayoutService,
    private gstCalculator: GstCalculatorService,
  ) {
    this.sidebarOpen$ = this.layout.sidebarOpen$;
    this.currentUrl = this.cleanUrl(this.router.url);
    this.syncTabFromUrl(this.currentUrl);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl = this.cleanUrl(event.urlAfterRedirects);
        this.syncTabFromUrl(this.currentUrl);
        this.closeCompactSidebar();
      });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeAddCustomer();
  }

  selectTab(tabId: SidebarTabId): void {
    this.activeTabId = tabId;

    if (this.isCompactViewport()) {
      this.layout.openSidebar();
    }
  }

  onItemClick(entry: SidebarEntry, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (entry.action === 'gstCalculator') {
      this.gstCalculator.open();
      this.closeCompactSidebar();
      return;
    }

    if (!entry.route) {
      return;
    }

    this.navigateToEntry(entry);
    this.closeCompactSidebar();
  }

  isEntryActive(entry: SidebarEntry): boolean {
    if (entry.kind !== 'item' || !entry.route) {
      if (entry.kind === 'item' && entry.action === 'gstCalculator') {
        return this.gstCalculator.isOpen();
      }
      return false;
    }

    const exactRoutes = entry.activeExactRoutes || [];
    const prefixRoutes = entry.activePrefixRoutes || [];

    if (exactRoutes.length || prefixRoutes.length) {
      return (
        exactRoutes.includes(this.currentUrl) ||
        prefixRoutes.some((route) => this.currentUrl === route || this.currentUrl.startsWith(`${route}/`))
      );
    }

    if (entry.exact) {
      return this.currentUrl === entry.route;
    }

    return this.currentUrl === entry.route || this.currentUrl.startsWith(`${entry.route}/`);
  }

  openAddCustomer(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.addCustomerOpen = true;
  }

  closeAddCustomer(): void {
    this.addCustomerOpen = false;
  }

  openProfileMenu(): void {
    this.activeTabId = 'profile';
    void this.router.navigateByUrl('/profile');
    this.closeCompactSidebar();
  }

  private syncTabFromUrl(url: string): void {
    if (url.startsWith('/profile')) {
      this.activeTabId = 'profile';
      return;
    }

    if (
      url.startsWith('/accounts') ||
      url.startsWith('/contacts') ||
      url.startsWith('/deals') ||
      url.startsWith('/items')
    ) {
      this.activeTabId = 'crm';
      return;
    }

    if (
      url.startsWith('/invoices') ||
      url.startsWith('/receipts')
    ) {
      this.activeTabId = 'invoice';
      return;
    }

    if (
      url === '/' ||
      url.startsWith('/dashboard') ||
      url.startsWith('/organizations')
    ) {
      this.activeTabId = 'dashboard';
      return;
    }

    this.activeTabId = 'dashboard';
  }

  private cleanUrl(url: string): string {
    return url.split('?')[0].split('#')[0];
  }

  private closeCompactSidebar(): void {
    if (this.isCompactViewport()) {
      this.layout.closeSidebar();
    }
  }

  private navigateToEntry(entry: SidebarEntry): void {
    if (!entry.route) {
      return;
    }

    if (this.currentUrl === entry.route) {
      return;
    }

    void this.router.navigateByUrl(entry.route);
  }

  private isCompactViewport(): boolean {
    return typeof window !== 'undefined' && window.innerWidth < 1480;
  }
}
