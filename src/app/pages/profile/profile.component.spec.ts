import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ProfileComponent } from './profile.component';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileComponent, RouterTestingModule],
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
              is_email_verified: true,
              is_active: true,
              date_joined: '2026-01-01T00:00:00Z',
            }),
            loadProfile: jasmine.createSpy('loadProfile').and.returnValue(of({
              first_name: 'Adhisree',
              last_name: 'Paul',
              email: 'adhisree@example.com',
              tenant_role: 'owner',
              tenant: { org_name: 'Clienet' },
              is_email_verified: true,
              is_active: true,
              date_joined: '2026-01-01T00:00:00Z',
            })),
          },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
