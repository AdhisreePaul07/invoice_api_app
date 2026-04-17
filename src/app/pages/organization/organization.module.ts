import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { OrganizationRoutingModule } from './organization-routing.module';
import { OrganizationAddComponent } from '../organization/organization-add/organization-add.component';
import { OrganizationEditComponent } from '../organization/organization-edit/organization-edit.component';
import { OrganizationListComponent } from '../organization/organization-list/organization-list.component';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    OrganizationRoutingModule,
    OrganizationAddComponent,
    OrganizationEditComponent,
    OrganizationListComponent
  ]
})
export class OrganizationModule { }
