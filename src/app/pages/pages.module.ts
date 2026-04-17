import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PagesRoutingModule } from './pages-routing.module';
import { DashboardComponent } from './dashboard/dashboard.component';

@NgModule({
  imports: [CommonModule, PagesRoutingModule, DashboardComponent],
})
export class PagesModule {}
