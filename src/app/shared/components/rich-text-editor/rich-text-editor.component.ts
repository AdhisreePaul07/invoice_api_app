import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import {
  isRichTextBlank,
  normalizeRichTextHtml,
  plainTextToRichTextHtml,
} from '../../../core/utils/rich-text.util';

type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'removeFormat';

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditorComponent),
      multi: true,
    },
  ],
})
export class RichTextEditorComponent implements ControlValueAccessor, AfterViewInit {
  @Input() placeholder = 'Write here...';
  @Input() minHeight = 180;

  @ViewChild('editor') private editorRef?: ElementRef<HTMLDivElement>;

  disabled = false;
  focused = false;
  activeState: Record<Exclude<RichTextCommand, 'removeFormat'>, boolean> = {
    bold: false,
    italic: false,
    underline: false,
    insertUnorderedList: false,
    insertOrderedList: false,
  };

  private value = '';
  private viewReady = false;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderValue();
    this.refreshToolbarState();
  }

  writeValue(value: string | null): void {
    this.value = normalizeRichTextHtml(value || '');
    this.renderValue();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  get showPlaceholder(): boolean {
    return isRichTextBlank(this.value);
  }

  get editorStyles(): Record<string, string> {
    return {
      minHeight: `${this.minHeight}px`,
    };
  }

  exec(command: RichTextCommand): void {
    if (this.disabled || typeof document === 'undefined') {
      return;
    }

    this.focusEditor();

    if (command === 'removeFormat') {
      document.execCommand('removeFormat');
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand(command);
    }

    this.captureEditorValue(true);
  }

  onEditorInput(): void {
    this.captureEditorValue(false);
  }

  onEditorFocus(): void {
    this.focused = true;
    this.refreshToolbarState();
  }

  onEditorBlur(): void {
    this.focused = false;
    this.captureEditorValue(true);
    this.onTouched();
  }

  onEditorKeyup(): void {
    this.refreshToolbarState();
  }

  onEditorMouseup(): void {
    this.refreshToolbarState();
  }

  onEditorPaste(event: ClipboardEvent): void {
    if (this.disabled || typeof document === 'undefined') {
      return;
    }

    event.preventDefault();
    const html = event.clipboardData?.getData('text/html') || '';
    const text = event.clipboardData?.getData('text/plain') || '';
    const safeHtml = html ? normalizeRichTextHtml(html) : plainTextToRichTextHtml(text);

    if (safeHtml) {
      document.execCommand('insertHTML', false, safeHtml);
    }

    this.captureEditorValue(true);
  }

  private captureEditorValue(reRender: boolean): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) {
      return;
    }

    const normalized = normalizeRichTextHtml(editor.innerHTML);
    this.value = normalized;
    this.onChange(normalized);

    if (reRender) {
      editor.innerHTML = normalized;
    }

    this.refreshToolbarState();
  }

  private renderValue(): void {
    if (!this.viewReady || !this.editorRef) {
      return;
    }

    this.editorRef.nativeElement.innerHTML = this.value;
  }

  private focusEditor(): void {
    const editor = this.editorRef?.nativeElement;
    if (!editor) {
      return;
    }

    editor.focus();
    if (!editor.innerHTML.trim()) {
      editor.innerHTML = '<p><br></p>';
      this.placeCaretAtEnd(editor);
    }
  }

  private placeCaretAtEnd(element: HTMLElement): void {
    if (typeof window === 'undefined') {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private refreshToolbarState(): void {
    if (!this.focused || typeof document === 'undefined') {
      this.activeState = {
        bold: false,
        italic: false,
        underline: false,
        insertUnorderedList: false,
        insertOrderedList: false,
      };
      return;
    }

    this.activeState = {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    };
  }
}
