import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { InvoiceService } from '../../../core/services/invoice.service';
import { InvoiceListComponent } from './invoice-list.component';

describe('InvoiceListComponent', () => {
  let component: InvoiceListComponent;
  let fixture: ComponentFixture<InvoiceListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceListComponent, RouterTestingModule],
      providers: [
        {
          provide: InvoiceService,
          useValue: {
            list: () => of({ list: [], count: 0, limit: 10, page: 1, total_pages: 1 }),
            updateUserSettings: () => of({}),
            markSent: () => of({}),
            markPaid: () => of({}),
            markVoid: () => of({}),
            delete: () => of({}),
            exportSelectedCsv: () => of(new Blob()),
            exportSelectedPdf: () => of(new Blob()),
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(InvoiceListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
