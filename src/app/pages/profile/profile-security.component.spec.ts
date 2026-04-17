import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { ProfileSecurityComponent } from './profile-security.component';

describe('ProfileSecurityComponent', () => {
  let component: ProfileSecurityComponent;
  let fixture: ComponentFixture<ProfileSecurityComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileSecurityComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            getCurrentAccount: jasmine.createSpy('getCurrentAccount').and.returnValue({
              first_name: 'Adhisree',
              last_name: 'Paul',
              email: 'adhisree@example.com',
              tenant_role: 'owner',
            }),
            loadProfile: jasmine.createSpy('loadProfile').and.returnValue(of({
              first_name: 'Adhisree',
              last_name: 'Paul',
              email: 'adhisree@example.com',
              tenant_role: 'owner',
            })),
            listSessions: jasmine.createSpy('listSessions').and.returnValue(of({
              list: [
                {
                  id: 'session-1',
                  session_key: 'session-key',
                  user_agent: 'Chrome',
                  ip_address: '127.0.0.1',
                  is_active: true,
                  created_at: '2026-01-01T00:00:00Z',
                  last_activity: '2026-01-01T00:00:00Z',
                  expires_at: null,
                  is_current: true,
                },
              ],
            })),
            changePassword: jasmine.createSpy('changePassword').and.returnValue(of({ message: 'Password changed successfully.' })),
            revokeSession: jasmine.createSpy('revokeSession').and.returnValue(of({ message: 'Session revoked successfully.' })),
            logoutOtherSessions: jasmine.createSpy('logoutOtherSessions').and.returnValue(of({ message: 'Other sessions logged out.' })),
            forceLogout: jasmine.createSpy('forceLogout'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileSecurityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
