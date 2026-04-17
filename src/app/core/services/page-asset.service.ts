import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';

export interface PageAssets {
  styles?: string[];
  scripts?: string[];
  htmlAttributes?: Record<string, string>;
  bodyAttributes?: Record<string, string>;
}

@Injectable({
  providedIn: 'root',
})
export class PageAssetService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly loadedStyles = new Set<string>();
  private readonly loadedScripts = new Set<string>();

  async applyPageAssets(pageAssets: PageAssets): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.applyAttributes(this.document.documentElement, pageAssets.htmlAttributes);
    this.applyAttributes(this.document.body, pageAssets.bodyAttributes);

    for (const href of this.unique(pageAssets.styles ?? [])) {
      this.appendStylesheet(href);
    }

    for (const source of this.unique(pageAssets.scripts ?? [])) {
      await this.appendScript(source);
    }
  }

  private appendStylesheet(href: string): void {
    if (!href || this.loadedStyles.has(href) || this.document.head.querySelector(`link[href="${href}"]`)) {
      this.loadedStyles.add(href);
      return;
    }

    const linkElement = this.document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = href;
    linkElement.setAttribute('data-page-asset', 'style');
    this.document.head.appendChild(linkElement);
    this.loadedStyles.add(href);
  }

  private appendScript(source: string): Promise<void> {
    if (!source || this.loadedScripts.has(source) || this.document.querySelector(`script[src="${source}"]`)) {
      this.loadedScripts.add(source);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const scriptElement = this.document.createElement('script');
      scriptElement.src = source;
      scriptElement.defer = false;
      scriptElement.async = false;
      scriptElement.onload = () => {
        this.loadedScripts.add(source);
        resolve();
      };
      scriptElement.onerror = () => reject(new Error(`Unable to load script: ${source}`));
      this.document.body.appendChild(scriptElement);
    });
  }

  private unique(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private applyAttributes(element: Element, attributes?: Record<string, string>): void {
    if (!attributes) {
      return;
    }

    for (const [attributeName, attributeValue] of Object.entries(attributes)) {
      element.setAttribute(attributeName, attributeValue);
    }
  }
}
