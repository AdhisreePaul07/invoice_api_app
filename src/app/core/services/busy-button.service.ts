import { DestroyRef, Inject, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class BusyButtonService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly selector = 'button, a.btn, a.btn-link, a[role="button"], label.btn, .profile-photo-modal__action';
  private observer: MutationObserver | null = null;
  private frameHandle: number | null = null;
  private isBrowser = false;

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);

    if (!this.isBrowser) {
      return;
    }

    const start = () => {
      this.scheduleSync();
      this.observer = new MutationObserver(() => this.scheduleSync());
      this.observer.observe(this.document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['disabled', 'aria-disabled', 'class', 'data-loading'],
      });
    };

    if (this.document.readyState === 'loading') {
      this.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else if (this.document.body) {
      start();
    }

    this.destroyRef.onDestroy(() => {
      this.observer?.disconnect();
      this.observer = null;

      if (this.frameHandle !== null) {
        window.cancelAnimationFrame(this.frameHandle);
        this.frameHandle = null;
      }
    });
  }

  private scheduleSync(): void {
    if (!this.isBrowser || this.frameHandle !== null) {
      return;
    }

    this.frameHandle = window.requestAnimationFrame(() => {
      this.frameHandle = null;
      this.syncBusyButtons();
    });
  }

  private syncBusyButtons(): void {
    this.document.querySelectorAll<HTMLElement>(this.selector).forEach((element) => {
      this.applyBusyState(element);
    });
  }

  private applyBusyState(element: HTMLElement): void {
    const explicitBusy = element.getAttribute('data-loading') === 'true';
    const disabled =
      ('disabled' in element && (element as HTMLButtonElement | HTMLInputElement).disabled === true) ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.classList.contains('disabled');

    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const hasBusyEllipsis = /(\.\.\.|…)/.test(text);
    const hasBusyWord =
      /(load|creat|updat|sav|submit|verif|accept|send|resend|remov|delet|upload|refresh|mark|log|revok|process|discard)/.test(
        text,
      );

    const busy = explicitBusy || (disabled && hasBusyEllipsis && hasBusyWord);

    element.classList.toggle('app-auto-busy', busy);

    if (busy) {
      element.setAttribute('aria-busy', 'true');
    } else {
      element.removeAttribute('aria-busy');
    }
  }
}
