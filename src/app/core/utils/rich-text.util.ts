const LINK_PROTOCOL_PATTERN = /^(https?:|mailto:|tel:|\/|#)/i;

export function normalizeRichTextHtml(value: unknown): string {
  const input = String(value ?? '').trim();
  if (!input) {
    return '';
  }

  if (!containsHtmlMarkup(input)) {
    return plainTextToRichTextHtml(input);
  }

  if (typeof document === 'undefined' || typeof DOMParser === 'undefined') {
    return fallbackNormalizeHtml(input);
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${input}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;
  const output = document.createElement('div');

  Array.from(root?.childNodes ?? []).forEach((node) => {
    sanitizeNode(node, output);
  });

  return cleanupRichTextHtml(output.innerHTML);
}

export function plainTextToRichTextHtml(value: unknown): string {
  const input = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!input) {
    return '';
  }

  return input
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function richTextToPlainText(value: unknown): string {
  const input = String(value ?? '').trim();
  if (!input) {
    return '';
  }

  if (!containsHtmlMarkup(input)) {
    return normalizePlainText(input);
  }

  if (typeof document === 'undefined') {
    return normalizePlainText(
      input
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|ul|ol|section|article|header|footer|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    );
  }

  const bridge = document.createElement('div');
  bridge.innerHTML = input
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|section|article|header|footer|h[1-6])>/gi, '\n');

  return normalizePlainText(bridge.textContent || '');
}

export function richTextToLines(value: unknown): string[] {
  return richTextToPlainText(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isRichTextBlank(value: unknown): boolean {
  return !richTextToPlainText(value);
}

function sanitizeNode(node: Node, target: HTMLElement): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text) {
      target.append(document.createTextNode(text));
    }
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toUpperCase();

  switch (tag) {
    case 'BR': {
      target.append(document.createElement('br'));
      return;
    }
    case 'B':
    case 'STRONG': {
      const strong = document.createElement('strong');
      sanitizeChildren(element, strong);
      appendIfMeaningful(strong, target);
      return;
    }
    case 'I':
    case 'EM': {
      const em = document.createElement('em');
      sanitizeChildren(element, em);
      appendIfMeaningful(em, target);
      return;
    }
    case 'U': {
      const underline = document.createElement('u');
      sanitizeChildren(element, underline);
      appendIfMeaningful(underline, target);
      return;
    }
    case 'A': {
      const href = String(element.getAttribute('href') || '').trim();
      if (!LINK_PROTOCOL_PATTERN.test(href)) {
        sanitizeChildren(element, target);
        return;
      }
      const link = document.createElement('a');
      link.setAttribute('href', href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      sanitizeChildren(element, link);
      appendIfMeaningful(link, target);
      return;
    }
    case 'UL':
    case 'OL': {
      const list = document.createElement(tag.toLowerCase());
      Array.from(element.children).forEach((child) => {
        if ((child as HTMLElement).tagName.toUpperCase() !== 'LI') {
          return;
        }
        sanitizeNode(child, list);
      });
      appendIfMeaningful(list, target);
      return;
    }
    case 'LI': {
      const listItem = document.createElement('li');
      sanitizeChildren(element, listItem);
      appendIfMeaningful(listItem, target);
      return;
    }
    case 'P':
    case 'DIV':
    case 'SECTION':
    case 'ARTICLE':
    case 'HEADER':
    case 'FOOTER':
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const paragraph = document.createElement('p');
      sanitizeChildren(element, paragraph);
      appendIfMeaningful(paragraph, target);
      return;
    }
    default: {
      sanitizeChildren(element, target);
      return;
    }
  }
}

function sanitizeChildren(source: HTMLElement, target: HTMLElement): void {
  Array.from(source.childNodes).forEach((child) => {
    sanitizeNode(child, target);
  });
}

function appendIfMeaningful(node: HTMLElement, target: HTMLElement): void {
  if (!isRichTextBlank(node.innerHTML)) {
    target.append(node);
  }
}

function cleanupRichTextHtml(value: string): string {
  const cleaned = value
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .trim();

  return isRichTextBlank(cleaned) ? '' : cleaned;
}

function normalizePlainText(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fallbackNormalizeHtml(value: string): string {
  return plainTextToRichTextHtml(richTextToPlainText(value));
}

function containsHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
