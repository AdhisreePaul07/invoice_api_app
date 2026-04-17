import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { OrganizationService } from '../../core/services/organization.service';
import { ProfileOrganizationComponent } from './profile-organization.component';

describe('ProfileOrganizationComponent', () => {
  let component: ProfileOrganizationComponent;
  let fixture: ComponentFixture<ProfileOrganizationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileOrganizationComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getCurrentAccount: jasmine.createSpy('getCurrentAccount').and.returnValue({
              first_name: 'Adhisree',
              last_name: 'Paul',
              email: 'adhisree@example.com',
              tenant_role: 'owner',
              tenant: { org_name: 'Clienet' },
            }),
            loadProfile: jasmine.createSpy('loadProfile').and.returnValue(of({
              first_name: 'Adhisree',
              last_name: 'Paul',
              email: 'adhisree@example.com',
              tenant_role: 'owner',
              tenant: { org_name: 'Clienet' },
            })),
          },
        },
        {
          provide: OrganizationService,
          useValue: {
            getCurrencyCatalog: jasmine.createSpy('getCurrencyCatalog').and.returnValue(of([
              { id: 1, shortname: 'INR', symbol: 'Rs', name: 'Indian Rupee' },
            ])),
            getReceiptDueOptions: jasmine.createSpy('getReceiptDueOptions').and.returnValue(of([
              { id: 1, code: 0, value: 'Due on Receipt' },
            ])),
            getCurrent: jasmine.createSpy('getCurrent').and.returnValue(of({
              data: {
                id: 1,
                uid: 'ORG123',
                org_name: 'Clienet',
                org_slug: 'clienet',
                schema_name: 'org123',
                plan_code: 'growth',
                primary_address: {},
                legal_identifiers: [],
                tax_detail: [],
                all_address: [],
                brand_settings: {},
                invoice_settings: {},
                currency_settings: { currencies: [] },
                is_active: true,
                is_provisioned: true,
              },
            })),
            updateCurrent: jasmine.createSpy('updateCurrent').and.returnValue(of({
              message: 'Organization updated successfully.',
              data: {
                id: 1,
                uid: 'ORG123',
                org_name: 'Clienet',
                org_slug: 'clienet',
                schema_name: 'org123',
                plan_code: 'growth',
                primary_address: {},
                legal_identifiers: [],
                tax_detail: [],
                all_address: [],
                brand_settings: {},
                invoice_settings: {},
                currency_settings: { currencies: [] },
                is_active: true,
                is_provisioned: true,
              },
            })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileOrganizationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
