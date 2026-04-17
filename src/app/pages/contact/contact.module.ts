import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ContactRoutingModule } from './contact-routing.module';
import { ContactAddComponent } from '../contact/contact-add/contact-add.component';
import { ContactEditComponent } from '../contact/contact-edit/contact-edit.component';
import { ContactListComponent } from '../contact/contact-list/contact-list.component';
import { FormsModule } from '@angular/forms';


@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ContactRoutingModule,
    ContactAddComponent,
    ContactEditComponent,
    ContactListComponent
  ]
})
export class ContactModule { }
