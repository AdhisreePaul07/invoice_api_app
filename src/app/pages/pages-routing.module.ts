import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { AuthGuard } from '../core/guards/auth.guard';
import { OrgSetupGuard } from '../core/guards/org-setup.guard';
import { PagesComponent } from './pages.component';

const routes: Routes = [
  {
    path: '',
    component: PagesComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard, OrgSetupGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { title: 'Welcome to Dashboard!' },
      },
      {
        path: 'dashboard/our',
        loadComponent: () =>
          import('./dashboard/our-dashboard.component').then((m) => m.OurDashboardComponent),
        data: { title: 'Our Dashboard' },
      },
      {
        path: 'invoices',
        loadChildren: () =>
          import('./invoice/invoice.module').then((m) => m.InvoiceModule),
        data: { title: 'Invoices' },
      },
      {
        path: 'accounts',
        loadChildren: () =>
          import('./accounts/accounts.module').then((m) => m.AccountsModule),
        data: { title: 'Accounts' },
      },
      {
        path: 'organizations',
        loadChildren: () =>
          import('./organization/organization.module').then((m) => m.OrganizationModule),
        data: { title: 'Organization' },
      },
      {
        path: 'contacts',
        loadChildren: () =>
          import('./contact/contact.module').then((m) => m.ContactModule),
        data: { title: 'Contacts' },
      },
      {
        path: 'items',
        loadChildren: () =>
          import('./item/item.module').then((m) => m.ItemModule),
        data: { title: 'Items' },
      },
      {
        path: 'deals',
        loadChildren: () =>
          import('./deal/deal.module').then((m) => m.DealModule),
        data: { title: 'Deals' },
      },
      {
        path: 'receipts',
        loadChildren: () =>
          import('./receipt/receipt.module').then((m) => m.ReceiptModule),
        data: { title: 'Receipts' },
      },
      {
        path: 'profile/organization',
        loadComponent: () =>
          import('./profile/profile-organization.component').then((m) => m.ProfileOrganizationComponent),
        data: { title: 'Organization' },
      },
      {
        path: 'profile/security',
        loadComponent: () =>
          import('./profile/profile-security.component').then((m) => m.ProfileSecurityComponent),
        data: { title: 'Security' },
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./profile/profile.component').then((m) => m.ProfileComponent),
        data: { title: 'Personal Info' },
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PagesRoutingModule {}
