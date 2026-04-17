import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { OrganizationAddComponent } from './organization-add/organization-add.component';
import { OrganizationEditComponent } from './organization-edit/organization-edit.component';
import { OrganizationListComponent } from './organization-list/organization-list.component';

const routes: Routes = [

  { path: '', component: OrganizationListComponent },
  { path: 'add', component: OrganizationAddComponent },
  { path: 'edit/:id', component: OrganizationEditComponent },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class OrganizationRoutingModule {}
