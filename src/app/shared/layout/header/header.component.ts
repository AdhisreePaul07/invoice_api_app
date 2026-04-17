import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AccountProfile } from '../../../core/models/auth.model';
import { AuthService } from '../../../core/services/auth.service';
import { LayoutService } from '../../../core/services/layout.service';
import { resolveImageUrl } from '../../../core/utils/image-upload.util';

interface SearchItem {
  label: string;
  iconClass: string;
  route?: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private accountSubscription?: Subscription;

  readonly sidebarOpen$;
  readonly searchItems: SearchItem[] = [
    { label: 'Dashboard', iconClass: 'fi fi-rr-apps', route: '/' },
    { label: 'Chat', iconClass: 'fi fi-rr-comment' },
    { label: 'Calendar', iconClass: 'fi fi-rr-calendar' },
    { label: 'Apexchart', iconClass: 'fi fi-rr-chart-pie-alt' },
    { label: 'Pricing', iconClass: 'fi fi-rr-file' },
    { label: 'Email', iconClass: 'fi fi-rr-envelope' },
  ];

  userName = 'Robert Brown';
  userRoleLabel = 'Manager';
  userEmail = 'robert@gmail.com';
  userAvatarUrl = '/assets/images/avatar/avatar1.webp';

  isSearchOpen = false;
  isNotificationsOpen = false;
  isProfileOpen = false;
  isDarkTheme = false;
  searchQuery = '';

  constructor(
    private auth: AuthService,
    private layout: LayoutService,
    private router: Router,
  ) {
    this.sidebarOpen$ = this.layout.sidebarOpen$;
  }

  ngOnInit(): void {
    this.accountSubscription = this.auth.currentAccount$.subscribe((user) => {
      if (user) {
        this.applyUser(user);
      }
    });

    this.loadUserFromSession();
    // Theme switching is temporarily disabled. Keep light theme as the default.
    this.applyTheme('light');
    // this.restoreTheme();
  }

  ngOnDestroy(): void {
    this.accountSubscription?.unsubscribe();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.isNotificationsOpen = false;
    this.isProfileOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isNotificationsOpen = false;
    this.isProfileOpen = false;
    this.closeSearch();
  }

  get filteredSearchItems(): SearchItem[] {
    const query = this.searchQuery.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return this.searchItems.filter((item) =>
      item.label.toLowerCase().includes(query),
    );
  }

  toggleShellNav(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 1480) {
      this.layout.toggleSidebar();
      return;
    }

    this.layout.toggleSidebarMini();
  }

  openSearch(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isSearchOpen = true;
    this.searchQuery = '';
    this.isNotificationsOpen = false;
    this.isProfileOpen = false;
  }

  closeSearch(): void {
    this.isSearchOpen = false;
    this.searchQuery = '';
  }

  toggleNotifications(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isNotificationsOpen = !this.isNotificationsOpen;
    this.isProfileOpen = false;
  }

  toggleProfile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isProfileOpen = !this.isProfileOpen;
    this.isNotificationsOpen = false;
  }

  toggleTheme(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    // Theme switching is temporarily disabled. Keep the shell in light mode.
    // this.applyTheme(this.isDarkTheme ? 'light' : 'dark');
  }

  navigateTo(route: string | undefined, event: Event, closeSearch = false): void {
    event.preventDefault();
    event.stopPropagation();

    if (closeSearch) {
      this.closeSearch();
    }

    this.isNotificationsOpen = false;
    this.isProfileOpen = false;

    if (!route) {
      return;
    }

    void this.router.navigateByUrl(route);
  }

  preventDefault(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  logout(): void {
    this.isProfileOpen = false;
    this.auth.logout();
  }

  private loadUserFromSession(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const userRaw = localStorage.getItem('account_profile');

    if (!userRaw) {
      return;
    }

    try {
      this.applyUser(JSON.parse(userRaw));
    } catch (error) {
      console.error('Invalid user session data', error);
    }
  }

  private applyUser(user: Partial<AccountProfile> | null | undefined): void {
    const firstName = String(user?.first_name || '').trim();
    const lastName = String(user?.last_name || '').trim();
    const email = String(user?.email || '').trim();

    this.userName = `${firstName} ${lastName}`.trim() || email || 'Workspace User';
    this.userEmail = email || this.userEmail;
    this.userRoleLabel = this.roleLabel(user?.tenant_role);
    this.userAvatarUrl = resolveImageUrl(user?.profile_image?.url) || '/assets/images/avatar/avatar1.webp';
  }

  private roleLabel(role: unknown): string {
    switch (String(role || '')) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      case 'manager':
        return 'Manager';
      case 'viewer':
        return 'Viewer';
      default:
        return 'Member';
    }
  }

  private restoreTheme(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const storedTheme = localStorage.getItem('app-theme');
    const attrTheme =
      this.document.documentElement.getAttribute('data-app-theme') ||
      this.document.body.getAttribute('data-app-theme');

    this.applyTheme(storedTheme === 'dark' || attrTheme === 'dark' ? 'dark' : 'light');
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    this.isDarkTheme = theme === 'dark';
    this.document.documentElement.setAttribute('data-app-theme', theme);
    this.document.body.setAttribute('data-app-theme', theme);

    if (typeof window !== 'undefined') {
      localStorage.setItem('app-theme', theme);
    }
  }
}
