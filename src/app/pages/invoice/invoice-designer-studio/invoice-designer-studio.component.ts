import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  AppSettingsResponse,
  InvoiceTemplateAppSetting,
  InvoiceTemplateBlock,
  InvoiceTemplateBlockType,
} from '../../../core/models/app-settings.model';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { extractApiError } from '../../../core/utils/api-error.util';

export interface InvoiceDesignerPreviewItem {
  itemName: string;
  itemCode: string;
  itemDetails: string;
  quantity: number;
  unitPrice: number;
  taxValue: number;
  lineTotal: number;
}

export interface InvoiceDesignerPreviewData {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  statusLabel: string;
  invoiceTypeLabel: string;
  organizationName: string;
  accountName: string;
  contactName: string;
  contactEmail: string;
  headerText: string;
  footerText: string;
  descriptionText: string;
  terms: string[];
  subtotal: number;
  totalTax: number;
  grandTotal: number;
  items: InvoiceDesignerPreviewItem[];
}

interface DesignerWidgetBlueprint {
  type: InvoiceTemplateBlockType;
  label: string;
  icon: string;
  category: 'Text' | 'Structure' | 'Brand' | 'Finance' | 'Legal';
  description: string;
  heading: string;
}

interface DesignerWidgetGroup {
  category: DesignerWidgetBlueprint['category'];
  items: DesignerWidgetBlueprint[];
}

interface DesignerToken {
  label: string;
  value: string;
  description: string;
}

const DEFAULT_PREVIEW: InvoiceDesignerPreviewData = {
  invoiceNo: 'INV-2026-00000001',
  invoiceDate: '',
  dueDate: '',
  statusLabel: 'Draft',
  invoiceTypeLabel: 'Standard',
  organizationName: 'Your Organization',
  accountName: 'Customer Account',
  contactName: 'Contact Person',
  contactEmail: 'contact@example.com',
  headerText: 'Add a polished opening note or billing context for this invoice.',
  footerText: 'Footer notes, payment instructions, and support details appear here.',
  descriptionText: 'Use the widget library to build a reusable invoice layout from scratch.',
  terms: ['Payment due within 15 days.', 'Service begins after invoice confirmation.'],
  subtotal: 1000,
  totalTax: 180,
  grandTotal: 1180,
  items: [
    {
      itemName: 'Consulting Services',
      itemCode: 'CONS-001',
      itemDetails: 'Strategy and implementation support',
      quantity: 1,
      unitPrice: 1000,
      taxValue: 180,
      lineTotal: 1180,
    },
  ],
};

const ALL_WIDGET_BLUEPRINTS: DesignerWidgetBlueprint[] = [
  {
    type: 'text',
    label: 'Text Block',
    icon: 'Tx',
    category: 'Text',
    description: 'Type directly in the green text box on the canvas and insert live invoice tokens.',
    heading: 'Text Block',
  },
  {
    type: 'seller',
    label: 'Company',
    icon: 'Co',
    category: 'Brand',
    description: 'Business identity, logo zone, and organization details.',
    heading: 'Company Details',
  },
  {
    type: 'billTo',
    label: 'Customer',
    icon: 'Cu',
    category: 'Structure',
    description: 'Billing recipient details and contact information.',
    heading: 'Bill To',
  },
  {
    type: 'itemsTable',
    label: 'Items',
    icon: 'Tb',
    category: 'Finance',
    description: 'Line items, descriptions, quantity, taxes, and totals.',
    heading: 'Line Items',
  },
  {
    type: 'notes',
    label: 'Notes',
    icon: 'Nt',
    category: 'Structure',
    description: 'Header notes, narrative, and custom billing copy.',
    heading: 'Notes & Description',
  },
  {
    type: 'hero',
    label: 'Header Block',
    icon: 'Hd',
    category: 'Structure',
    description: 'Legacy invoice header section.',
    heading: 'Invoice Header',
  },
  {
    type: 'invoiceMeta',
    label: 'Invoice Meta',
    icon: 'Mt',
    category: 'Finance',
    description: 'Legacy invoice number, dates, and payment facts section.',
    heading: 'Invoice Facts',
  },
  {
    type: 'totals',
    label: 'Total Card',
    icon: 'Tl',
    category: 'Finance',
    description: 'Legacy subtotal, tax, and grand total card.',
    heading: 'Total Summary',
  },
  {
    type: 'terms',
    label: 'Terms',
    icon: 'Tr',
    category: 'Legal',
    description: 'Legacy terms and conditions section.',
    heading: 'Terms & Conditions',
  },
  {
    type: 'footer',
    label: 'Footer Block',
    icon: 'Ft',
    category: 'Brand',
    description: 'Legacy footer, bank, or support details section.',
    heading: 'Footer Information',
  },
];

const VISIBLE_WIDGET_TYPES: InvoiceTemplateBlockType[] = ['text', 'seller', 'billTo', 'itemsTable', 'notes'];

const TOKEN_LIBRARY: DesignerToken[] = [
  {
    label: 'Invoice Number',
    value: '{{invoice_no}}',
    description: 'Current invoice number',
  },
  {
    label: 'Invoice Date',
    value: '{{invoice_date}}',
    description: 'Selected invoice date',
  },
  {
    label: 'Due Date',
    value: '{{due_date}}',
    description: 'Selected due date',
  },
  {
    label: 'Status',
    value: '{{invoice_status}}',
    description: 'Current invoice status label',
  },
  {
    label: 'Organization',
    value: '{{organization_name}}',
    description: 'Current organization name',
  },
  {
    label: 'Account',
    value: '{{account_name}}',
    description: 'Selected customer account',
  },
  {
    label: 'Contact Name',
    value: '{{contact_name}}',
    description: 'Selected contact full name',
  },
  {
    label: 'Contact Email',
    value: '{{contact_email}}',
    description: 'Selected contact email',
  },
  {
    label: 'Grand Total',
    value: '{{grand_total}}',
    description: 'Calculated grand total',
  },
];

@Component({
  selector: 'app-invoice-designer-studio',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DragDropModule],
  templateUrl: './invoice-designer-studio.component.html',
  styleUrls: ['./invoice-designer-studio.component.scss'],
})
export class InvoiceDesignerStudioComponent implements OnInit {
  @Input() previewData: InvoiceDesignerPreviewData | null = null;

  readonly paletteDropListId = 'invoiceDesignerPalette';
  readonly canvasDropListId = 'invoiceDesignerCanvas';
  readonly fontOptions = ['Inter', 'Urbanist'];
  readonly fontSizeOptions = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
  readonly widgetLibrary = VISIBLE_WIDGET_TYPES.map((type) => this.resolveBlueprint(type));
  readonly tokenLibrary = [...TOKEN_LIBRARY];

  readonly templateForm;

  loading = false;
  saving = false;
  deleting = false;
  error: string | null = null;
  success: string | null = null;

  templates: InvoiceTemplateAppSetting[] = [];
  currentBlocks: InvoiceTemplateBlock[] = [];
  selectedTemplateId: string | null = null;
  selectedBlockId: string | null = null;
  activeTextEditorBlockId: string | null = null;
  textEditorDraft = '';
  widgetSearch = '';
  zoomLevel = 100;

  private draggedTokenValue: string | null = null;
  private textSelectionStart = 0;
  private textSelectionEnd = 0;

  constructor(
    private readonly fb: FormBuilder,
    private readonly appSettingsService: AppSettingsService,
  ) {
    this.templateForm = this.fb.group({
      temp_name: ['Modern Invoice', Validators.required],
      description: ['Reusable layout for polished CRM invoice documents.'],
      fontFamily: ['Inter'],
      accentColor: ['#0d9b6c'],
      is_default: [false],
    });
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  get preview(): InvoiceDesignerPreviewData {
    return this.previewData || DEFAULT_PREVIEW;
  }

  get currentAccentColor(): string {
    return this.normalizeColor(this.templateForm.getRawValue().accentColor);
  }

  get currentFontFamily(): string {
    return this.normalizeFont(this.templateForm.getRawValue().fontFamily);
  }

  get selectedBlock(): InvoiceTemplateBlock | null {
    return this.currentBlocks.find((block) => block.id === this.selectedBlockId) || null;
  }

  get isTextBlockSelected(): boolean {
    return this.selectedBlock?.type === 'text';
  }

  get filteredWidgetGroups(): DesignerWidgetGroup[] {
    const query = this.cleanText(this.widgetSearch).toLowerCase();
    const groups = ['Text', 'Structure', 'Brand', 'Finance', 'Legal'].map((category) => ({
      category: category as DesignerWidgetBlueprint['category'],
      items: this.widgetLibrary.filter((widget) => widget.category === category),
    }));

    if (!query) {
      return groups;
    }

    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((widget) => (
          widget.label.toLowerCase().includes(query)
          || widget.heading.toLowerCase().includes(query)
          || widget.description.toLowerCase().includes(query)
        )),
      }))
      .filter((group) => group.items.length > 0);
  }

  get templateDisplayName(): string {
    return this.cleanText(this.templateForm.getRawValue().temp_name) || 'Untitled Template';
  }

  get templateDescription(): string {
    return this.cleanText(this.templateForm.getRawValue().description)
      || 'Reusable layout for polished CRM invoice documents.';
  }

  get paperScale(): number {
    return this.zoomLevel / 100;
  }

  get selectedBlockIndex(): number {
    return this.currentBlocks.findIndex((block) => block.id === this.selectedBlockId);
  }

  get canDeleteSelectedTemplate(): boolean {
    return !!this.getSelectedSavedTemplate();
  }

  get selectedTextFontSize(): number {
    return this.normalizeFontSize(this.selectedBlock?.fontSize);
  }

  get selectedTextWidth(): number {
    return this.normalizeWidth(this.selectedBlock?.width);
  }

  get selectedTextAutoWidth(): boolean {
    return this.selectedBlock?.autoWidth !== false;
  }

  get previewTerms(): string[] {
    const terms = Array.isArray(this.preview.terms) ? this.preview.terms : [];
    return terms.filter((term) => this.cleanText(term)).slice(0, 5);
  }

  get previewItems(): InvoiceDesignerPreviewItem[] {
    return this.preview.items.length ? this.preview.items.slice(0, 5) : DEFAULT_PREVIEW.items;
  }

  createNewTemplate(): void {
    this.error = null;
    this.success = null;
    this.selectedTemplateId = this.createId('invoice-template');
    this.templateForm.reset(
      {
        temp_name: 'Modern Invoice',
        description: 'Reusable layout for polished CRM invoice documents.',
        fontFamily: 'Inter',
        accentColor: '#0d9b6c',
        is_default: !this.templates.some((template) => template.is_default === true),
      },
      { emitEvent: false },
    );
    this.currentBlocks = this.buildStarterBlocks();
    this.selectedBlockId = this.currentBlocks[0]?.id || null;
    this.stopTextEditing();
  }

  selectTemplate(templateId: string): void {
    const template = this.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    this.error = null;
    this.success = null;
    this.selectedTemplateId = template.id || null;
    this.templateForm.reset(
      {
        temp_name: this.cleanText(template.temp_name) || 'Untitled Template',
        description: this.cleanText(template.description),
        fontFamily: this.normalizeFont(template.design?.fontFamily),
        accentColor: this.normalizeColor(template.design?.accentColor),
        is_default: template.is_default === true,
      },
      { emitEvent: false },
    );
    this.currentBlocks = this.cloneBlocks(template.design?.blocks);
    this.selectedBlockId = this.currentBlocks[0]?.id || null;
    this.stopTextEditing();
  }

  onTemplateSelectionChange(templateId: string): void {
    if (templateId === '__new__') {
      this.createNewTemplate();
      return;
    }

    this.selectTemplate(templateId);
  }

  saveTemplate(): void {
    this.error = null;
    this.success = null;
    this.templateForm.markAllAsTouched();

    if (this.templateForm.invalid) {
      return;
    }

    const currentTemplate = this.buildCurrentTemplate();
    let nextTemplates = [...this.templates];
    const existingIndex = nextTemplates.findIndex((template) => template.id === currentTemplate.id);

    if (existingIndex >= 0) {
      nextTemplates[existingIndex] = currentTemplate;
    } else {
      nextTemplates = [currentTemplate, ...nextTemplates];
    }

    if (currentTemplate.is_default) {
      nextTemplates = nextTemplates.map((template) => ({
        ...template,
        is_default: template.id === currentTemplate.id,
      }));
    } else if (!nextTemplates.some((template) => template.is_default)) {
      nextTemplates = nextTemplates.map((template, index) => ({
        ...template,
        is_default: index === 0,
      }));
    }

    this.saving = true;

    this.appSettingsService.updateInvoiceTemplates(nextTemplates).subscribe({
      next: (response) => {
        this.saving = false;
        this.templates = this.normalizeTemplates(response?.settings?.invoice_template || nextTemplates);
        this.selectTemplate(currentTemplate.id || this.templates[0]?.id || '');
        this.success = response?.message || 'Invoice template saved successfully.';
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to save invoice template.');
      },
    });
  }

  deleteSelectedTemplate(): void {
    const selected = this.getSelectedSavedTemplate();
    if (!selected?.id) {
      return;
    }

    this.error = null;
    this.success = null;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete template "${selected.temp_name || 'Untitled Template'}"?`);
      if (!confirmed) {
        return;
      }
    }

    const remainingTemplates = this.templates.filter((template) => template.id !== selected.id);
    const hasExplicitDefault = remainingTemplates.some((template) => template.is_default === true);
    const normalizedRemaining = remainingTemplates.map((template, index) => ({
      ...template,
      is_default: template.is_default === true || (!hasExplicitDefault && index === 0),
    }));

    this.deleting = true;

    this.appSettingsService.updateInvoiceTemplates(normalizedRemaining).subscribe({
      next: (response) => {
        this.deleting = false;
        this.templates = this.normalizeTemplates(response?.settings?.invoice_template || normalizedRemaining);
        if (this.templates.length) {
          this.selectTemplate(this.templates.find((template) => template.is_default)?.id || this.templates[0].id || '');
        } else {
          this.createNewTemplate();
        }
        this.success = response?.message || 'Invoice template deleted successfully.';
      },
      error: (error) => {
        this.deleting = false;
        this.error = extractApiError(error, 'Failed to delete invoice template.');
      },
    });
  }

  onCanvasDrop(event: CdkDragDrop<InvoiceTemplateBlock[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(this.currentBlocks, event.previousIndex, event.currentIndex);
      this.currentBlocks = [...this.currentBlocks];
      this.selectedBlockId = this.currentBlocks[event.currentIndex]?.id || this.selectedBlockId;
      return;
    }

    const widget = event.item.data as DesignerWidgetBlueprint;
    const nextBlock = this.createBlock(widget.type);
    const nextBlocks = [...this.currentBlocks];
    nextBlocks.splice(event.currentIndex, 0, nextBlock);
    this.currentBlocks = nextBlocks;
    this.selectedBlockId = nextBlock.id;
  }

  onPaletteDrop(event: CdkDragDrop<DesignerWidgetBlueprint[]>): void {
    if (event.previousContainer === event.container) {
      return;
    }

    if (event.previousContainer.id === this.canvasDropListId) {
      const nextBlocks = [...this.currentBlocks];
      nextBlocks.splice(event.previousIndex, 1);
      this.currentBlocks = nextBlocks;
      if (!this.currentBlocks.some((block) => block.id === this.selectedBlockId)) {
        this.selectedBlockId = this.currentBlocks[0]?.id || null;
      }
    }
  }

  addBlock(type: InvoiceTemplateBlockType): void {
    const nextBlock = this.createBlock(type);
    this.currentBlocks = [...this.currentBlocks, nextBlock];
    this.selectedBlockId = nextBlock.id;
    this.stopTextEditing();
  }

  selectBlock(blockId: string): void {
    this.selectedBlockId = blockId;
  }

  onBlockDoubleClick(event: MouseEvent, block: InvoiceTemplateBlock): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectedBlockId = block.id;
    if (block.type === 'text') {
      this.startTextEditing(block.id);
    }
  }

  isEditingTextBlock(blockId: string): boolean {
    return this.activeTextEditorBlockId === blockId;
  }

  duplicateSelectedBlock(): void {
    if (this.selectedBlockId) {
      this.duplicateBlock(this.selectedBlockId);
    }
  }

  duplicateBlock(blockId: string): void {
    const index = this.currentBlocks.findIndex((block) => block.id === blockId);
    if (index < 0) {
      return;
    }

    const source = this.currentBlocks[index];
    const duplicate = {
      ...source,
      id: this.createId(source.type),
    };

    const nextBlocks = [...this.currentBlocks];
    nextBlocks.splice(index + 1, 0, duplicate);
    this.currentBlocks = nextBlocks;
    this.selectedBlockId = duplicate.id;
    this.stopTextEditing();
  }

  removeSelectedBlock(): void {
    if (this.selectedBlockId) {
      this.removeBlock(this.selectedBlockId);
    }
  }

  removeBlock(blockId: string): void {
    this.currentBlocks = this.currentBlocks.filter((block) => block.id !== blockId);
    if (this.selectedBlockId === blockId) {
      this.selectedBlockId = this.currentBlocks[0]?.id || null;
    }
    if (this.activeTextEditorBlockId === blockId) {
      this.stopTextEditing();
    }
  }

  moveSelectedBlock(direction: -1 | 1): void {
    const currentIndex = this.selectedBlockIndex;
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= this.currentBlocks.length) {
      return;
    }

    const nextBlocks = [...this.currentBlocks];
    const [selected] = nextBlocks.splice(currentIndex, 1);
    nextBlocks.splice(targetIndex, 0, selected);
    this.currentBlocks = nextBlocks;
    this.selectedBlockId = selected.id;
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(140, this.zoomLevel + 10);
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(70, this.zoomLevel - 10);
  }

  resetZoom(): void {
    this.zoomLevel = 100;
  }

  updateWidgetSearch(value: string): void {
    this.widgetSearch = value;
  }

  updateBlockTextField(
    blockId: string,
    field: 'heading' | 'description' | 'backgroundColor' | 'textColor',
    value: string,
  ): void {
    const normalizedValue = field === 'heading' || field === 'description'
      ? value
      : this.normalizeOptionalColor(value);

    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            [field]: normalizedValue,
          }
        : block
    ));
  }

  updateBlockSelectField(
    blockId: string,
    field: 'layout' | 'alignment' | 'surfaceStyle',
    value: string,
  ): void {
    const normalizedValue = field === 'layout'
      ? this.normalizeLayout(value)
      : field === 'alignment'
        ? this.normalizeAlignment(value)
        : this.normalizeSurfaceStyle(value);

    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            [field]: normalizedValue,
          }
        : block
    ));
  }

  updateBlockPadding(blockId: string, value: string): void {
    const padding = this.normalizePadding(Number(value));
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            padding,
          }
        : block
    ));
  }

  updateBlockEnabled(blockId: string, enabled: boolean): void {
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            enabled,
          }
        : block
    ));
  }

  updateBlockFontSize(blockId: string, value: string | number): void {
    const fontSize = this.normalizeFontSize(value);
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            fontSize,
          }
        : block
    ));
  }

  adjustSelectedFontSize(step: number): void {
    if (!this.selectedBlock || this.selectedBlock.type !== 'text') {
      return;
    }

    this.updateBlockFontSize(this.selectedBlock.id, this.normalizeFontSize(this.selectedBlock.fontSize) + step);
  }

  updateBlockWidth(blockId: string, value: string | number): void {
    const width = this.normalizeWidth(value);
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            width,
          }
        : block
    ));
  }

  updateBlockAutoWidth(blockId: string, checked: boolean): void {
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            autoWidth: checked,
          }
        : block
    ));
  }

  startTextEditing(blockId: string): void {
    const block = this.currentBlocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'text') {
      return;
    }

    this.selectedBlockId = blockId;
    this.activeTextEditorBlockId = blockId;
    this.textEditorDraft = this.readRawBlockContent(block);
    this.textSelectionStart = this.textEditorDraft.length;
    this.textSelectionEnd = this.textEditorDraft.length;
  }

  activateTextEditor(blockId: string, textarea: HTMLTextAreaElement): void {
    if (this.activeTextEditorBlockId !== blockId) {
      this.startTextEditing(blockId);
      textarea.value = this.textEditorDraft;
    } else {
      this.selectedBlockId = blockId;
    }

    this.syncTextEditorHeight(textarea);
    this.cacheTextEditorSelection(textarea);
  }

  onTextEditorInput(blockId: string, value: string, textarea: HTMLTextAreaElement): void {
    if (this.activeTextEditorBlockId !== blockId) {
      this.startTextEditing(blockId);
    }

    this.textEditorDraft = value;
    this.setBlockContent(blockId, value);
    this.syncTextEditorHeight(textarea);
    this.cacheTextEditorSelection(textarea);
  }

  onTextEditorKeydown(event: KeyboardEvent, blockId: string, textarea: HTMLTextAreaElement): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.commitTextEditing(blockId, textarea.value);
    }
  }

  commitTextEditing(blockId: string, value: string): void {
    this.setBlockContent(blockId, value);
    if (this.activeTextEditorBlockId === blockId) {
      this.stopTextEditing();
    }
  }

  cacheTextEditorSelection(textarea: HTMLTextAreaElement): void {
    this.textSelectionStart = textarea.selectionStart ?? this.textEditorDraft.length;
    this.textSelectionEnd = textarea.selectionEnd ?? this.textEditorDraft.length;
  }

  allowTokenDrop(event: DragEvent): void {
    event.preventDefault();
  }

  onTokenDragStart(event: DragEvent, tokenValue: string): void {
    this.draggedTokenValue = tokenValue;
    event.dataTransfer?.setData('text/plain', tokenValue);
    event.dataTransfer?.setData('application/x-invoice-token', tokenValue);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onTokenDragEnd(): void {
    this.draggedTokenValue = null;
  }

  onTextPreviewDrop(event: DragEvent, blockId: string): void {
    event.preventDefault();
    const tokenValue = this.readDroppedToken(event);
    if (!tokenValue) {
      return;
    }

    this.startTextEditing(blockId);
    this.insertTokenIntoSelectedText(tokenValue);
  }

  onTextEditorDrop(event: DragEvent, blockId: string, textarea: HTMLTextAreaElement): void {
    event.preventDefault();
    const tokenValue = this.readDroppedToken(event);
    if (!tokenValue) {
      return;
    }

    this.selectedBlockId = blockId;
    this.activeTextEditorBlockId = blockId;
    this.cacheTextEditorSelection(textarea);
    this.insertTokenIntoSelectedText(tokenValue, textarea);
  }

  insertTokenIntoSelectedText(tokenValue: string, textarea?: HTMLTextAreaElement): void {
    const block = this.selectedBlock;
    if (!block || block.type !== 'text') {
      return;
    }

    if (this.activeTextEditorBlockId !== block.id) {
      this.startTextEditing(block.id);
    }

    const sourceValue = this.activeTextEditorBlockId === block.id
      ? this.textEditorDraft
      : this.readRawBlockContent(block);
    const selectionStart = textarea?.selectionStart ?? this.textSelectionStart ?? sourceValue.length;
    const selectionEnd = textarea?.selectionEnd ?? this.textSelectionEnd ?? sourceValue.length;
    const nextValue = `${sourceValue.slice(0, selectionStart)}${tokenValue}${sourceValue.slice(selectionEnd)}`;
    const nextCaretPosition = selectionStart + tokenValue.length;

    this.textEditorDraft = nextValue;
    this.setBlockContent(block.id, nextValue);
    this.textSelectionStart = nextCaretPosition;
    this.textSelectionEnd = nextCaretPosition;

    if (textarea) {
      textarea.value = nextValue;
      this.syncTextEditorHeight(textarea);
      textarea.focus();
      textarea.selectionStart = nextCaretPosition;
      textarea.selectionEnd = nextCaretPosition;
    }
  }

  getBlockPreviewStyle(block: InvoiceTemplateBlock): Record<string, string> {
    const backgroundColor = this.normalizeOptionalColor(block.backgroundColor);
    const textColor = this.normalizeOptionalColor(block.textColor) || '#0f172a';
    const style: Record<string, string> = {
      '--block-padding': `${this.normalizePadding(block.padding)}px`,
      '--block-background': backgroundColor || 'rgba(255, 255, 255, 0.98)',
      '--block-text': textColor,
      '--block-accent': this.currentAccentColor,
      '--block-font-size': `${this.normalizeFontSize(block.fontSize)}px`,
      textAlign: this.toTextAlign(block.alignment),
    };

    if (block.type === 'text') {
      style['width'] = block.autoWidth !== false ? 'fit-content' : `${this.normalizeWidth(block.width)}px`;
      style['maxWidth'] = '100%';
    }

    return style;
  }

  isSelectedBlock(blockId: string): boolean {
    return this.selectedBlockId === blockId;
  }

  trackByTemplateId(_index: number, template: InvoiceTemplateAppSetting): string {
    return template.id || `template-${_index}`;
  }

  trackByBlockId(_index: number, block: InvoiceTemplateBlock): string {
    return block.id;
  }

  trackByWidgetType(_index: number, widget: DesignerWidgetBlueprint): string {
    return widget.type;
  }

  trackByTokenValue(_index: number, token: DesignerToken): string {
    return token.value;
  }

  readDateLabel(value: string): string {
    const normalized = this.cleanText(value);
    if (!normalized) {
      return 'Not set';
    }

    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) {
      return normalized;
    }

    return parsed.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  readBlockSurfaceClass(block: InvoiceTemplateBlock): string {
    const surfaceStyle = this.normalizeSurfaceStyle(block.surfaceStyle);
    return `designer-block__preview--${surfaceStyle}`;
  }

  readBlockPreviewContent(block: InvoiceTemplateBlock): string {
    const rawContent = this.readRawBlockContent(block);
    if (!rawContent) {
      return '';
    }

    return this.tokenLibrary.reduce((content, token) => {
      const tokenPattern = new RegExp(this.escapeRegex(token.value), 'g');
      return content.replace(tokenPattern, this.resolveTokenValue(token.value));
    }, rawContent);
  }

  readRawBlockContent(block: InvoiceTemplateBlock | null | undefined): string {
    return this.normalizeContent(block?.content);
  }

  readCanvasTextValue(block: InvoiceTemplateBlock): string {
    if (block.type !== 'text') {
      return '';
    }

    return this.activeTextEditorBlockId === block.id
      ? this.textEditorDraft
      : this.readRawBlockContent(block);
  }

  private loadTemplates(): void {
    this.loading = true;
    this.error = null;
    this.success = null;

    this.appSettingsService.getSettings().subscribe({
      next: (response) => {
        this.loading = false;
        this.templates = this.normalizeTemplates(response?.settings?.invoice_template || []);
        const defaultTemplate = this.templates.find((template) => template.is_default) || this.templates[0];
        if (defaultTemplate?.id) {
          this.selectTemplate(defaultTemplate.id);
        } else {
          this.createNewTemplate();
        }
      },
      error: (error) => {
        this.loading = false;
        this.error = extractApiError(error, 'Failed to load invoice templates.');
        this.createNewTemplate();
      },
    });
  }

  private buildCurrentTemplate(): InvoiceTemplateAppSetting {
    const raw = this.templateForm.getRawValue();
    return {
      id: this.selectedTemplateId || this.createId('invoice-template'),
      temp_name: this.cleanText(raw.temp_name) || 'Untitled Template',
      description: this.cleanText(raw.description),
      is_default: raw.is_default === true,
      design: {
        paperSize: 'A4',
        fontFamily: this.normalizeFont(raw.fontFamily),
        accentColor: this.normalizeColor(raw.accentColor),
        pageStyle: 'designer-studio',
        blocks: this.cloneBlocks(this.currentBlocks),
      },
    };
  }

  private getSelectedSavedTemplate(): InvoiceTemplateAppSetting | undefined {
    return this.templates.find((template) => template.id === this.selectedTemplateId);
  }

  private normalizeTemplates(templates: InvoiceTemplateAppSetting[] | null | undefined): InvoiceTemplateAppSetting[] {
    const normalized = (Array.isArray(templates) ? templates : [])
      .map((template, index) => this.normalizeTemplate(template, index))
      .filter((template): template is InvoiceTemplateAppSetting => !!template);

    if (!normalized.length) {
      return [];
    }

    if (!normalized.some((template) => template.is_default)) {
      normalized[0] = {
        ...normalized[0],
        is_default: true,
      };
    }

    return normalized;
  }

  private normalizeTemplate(
    template: InvoiceTemplateAppSetting | null | undefined,
    index: number,
  ): InvoiceTemplateAppSetting | null {
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      return null;
    }

    const design = template.design && typeof template.design === 'object' && !Array.isArray(template.design)
      ? template.design
      : {};

    return {
      ...template,
      id: this.cleanText(template.id) || this.createId(`invoice-template-${index + 1}`),
      temp_name: this.cleanText(template.temp_name) || `Template ${index + 1}`,
      description: this.cleanText(template.description),
      is_default: template.is_default === true,
      design: {
        ...design,
        paperSize: 'A4',
        fontFamily: this.normalizeFont(design.fontFamily),
        accentColor: this.normalizeColor(design.accentColor),
        pageStyle: this.cleanText(design.pageStyle) || 'designer-studio',
        blocks: this.cloneBlocks(Array.isArray(design.blocks) ? design.blocks : this.buildStarterBlocks()),
      },
    };
  }

  private cloneBlocks(blocks: InvoiceTemplateBlock[] | null | undefined): InvoiceTemplateBlock[] {
    const source = Array.isArray(blocks) && blocks.length ? blocks : this.buildStarterBlocks();
    return source.map((block, index) => this.normalizeBlock(block, index));
  }

  private normalizeBlock(block: InvoiceTemplateBlock | null | undefined, index: number): InvoiceTemplateBlock {
    const source: Partial<InvoiceTemplateBlock> =
      block && typeof block === 'object' && !Array.isArray(block) ? block : {};
    const blueprint = this.resolveBlueprint(source.type || 'text');
    return {
      ...source,
      id: this.cleanText(source.id) || this.createId(`${blueprint.type}-${index + 1}`),
      type: blueprint.type,
      label: this.cleanText(source.label) || blueprint.label,
      heading: this.cleanText(source.heading) || blueprint.heading,
      description: this.cleanText(source.description) || blueprint.description,
      enabled: source.enabled !== false,
      layout: this.normalizeLayout(source.layout),
      alignment: this.normalizeAlignment(source.alignment),
      padding: this.normalizePadding(source.padding),
      backgroundColor: this.normalizeOptionalColor(source.backgroundColor),
      textColor: this.normalizeOptionalColor(source.textColor),
      surfaceStyle: this.normalizeSurfaceStyle(source.surfaceStyle),
      content: this.normalizeContent(source.content),
      fontSize: this.normalizeFontSize(source.fontSize),
      width: this.normalizeWidth(source.width),
      autoWidth: source.autoWidth !== false,
    };
  }

  private buildStarterBlocks(): InvoiceTemplateBlock[] {
    return [
      this.createBlock('text'),
      this.createBlock('seller'),
      this.createBlock('billTo'),
      this.createBlock('itemsTable'),
      this.createBlock('notes'),
    ];
  }

  private createBlock(type: InvoiceTemplateBlockType): InvoiceTemplateBlock {
    const blueprint = this.resolveBlueprint(type);
    return {
      id: this.createId(type),
      type,
      label: blueprint.label,
      heading: blueprint.heading,
      description: blueprint.description,
      enabled: true,
      layout: type === 'seller' || type === 'billTo' ? 'split' : 'full',
      alignment: 'start',
      padding: type === 'text' ? 8 : 20,
      backgroundColor: '',
      textColor: '',
      surfaceStyle: type === 'text' ? 'plain' : type === 'seller' || type === 'billTo' || type === 'itemsTable' ? 'outline' : 'card',
      content: type === 'text' ? '' : '',
      fontSize: type === 'text' ? 18 : 16,
      width: type === 'text' ? 320 : 720,
      autoWidth: type === 'text',
    };
  }

  private resolveBlueprint(type: InvoiceTemplateBlockType): DesignerWidgetBlueprint {
    return ALL_WIDGET_BLUEPRINTS.find((widget) => widget.type === type) || ALL_WIDGET_BLUEPRINTS[0];
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private setBlockContent(blockId: string, content: string): void {
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            content,
          }
        : block
    ));
  }

  private stopTextEditing(): void {
    this.activeTextEditorBlockId = null;
    this.textEditorDraft = '';
    this.textSelectionStart = 0;
    this.textSelectionEnd = 0;
  }

  private syncTextEditorHeight(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  private readDroppedToken(event: DragEvent): string {
    const fromTransfer = event.dataTransfer?.getData('application/x-invoice-token')
      || event.dataTransfer?.getData('text/plain')
      || '';
    return this.cleanText(fromTransfer || this.draggedTokenValue || '');
  }

  private resolveTokenValue(tokenValue: string): string {
    switch (tokenValue) {
      case '{{invoice_no}}':
        return this.preview.invoiceNo || 'Draft Invoice';
      case '{{invoice_date}}':
        return this.readDateLabel(this.preview.invoiceDate);
      case '{{due_date}}':
        return this.readDateLabel(this.preview.dueDate);
      case '{{invoice_status}}':
        return this.preview.statusLabel || 'Draft';
      case '{{organization_name}}':
        return this.preview.organizationName || 'Your Organization';
      case '{{account_name}}':
        return this.preview.accountName || 'Customer Account';
      case '{{contact_name}}':
        return this.preview.contactName || 'Contact Person';
      case '{{contact_email}}':
        return this.preview.contactEmail || 'contact@example.com';
      case '{{grand_total}}':
        return this.formatAmount(this.preview.grandTotal);
      default:
        return tokenValue;
    }
  }

  private formatAmount(value: number): string {
    return Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private cleanText(value: unknown): string {
    return String(value || '').trim();
  }

  private normalizeContent(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private normalizeColor(value: unknown): string {
    const candidate = this.cleanText(value);
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : '#0d9b6c';
  }

  private normalizeOptionalColor(value: unknown): string {
    const candidate = this.cleanText(value);
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : '';
  }

  private normalizeFont(value: unknown): string {
    const candidate = this.cleanText(value);
    return this.fontOptions.includes(candidate) ? candidate : 'Inter';
  }

  private normalizeLayout(value: unknown): 'full' | 'split' {
    return value === 'split' ? 'split' : 'full';
  }

  private normalizeAlignment(value: unknown): 'start' | 'center' | 'end' {
    return value === 'center' || value === 'end' ? value : 'start';
  }

  private normalizePadding(value: unknown): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 20;
    }

    return Math.min(40, Math.max(12, Math.round(numericValue)));
  }

  private normalizeSurfaceStyle(value: unknown): 'plain' | 'card' | 'outline' {
    return value === 'card' || value === 'outline' ? value : 'plain';
  }

  private normalizeFontSize(value: unknown): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 16;
    }

    return Math.min(96, Math.max(8, Math.round(numericValue)));
  }

  private normalizeWidth(value: unknown): number {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 320;
    }

    return Math.min(760, Math.max(80, Math.round(numericValue)));
  }

  private toTextAlign(value: unknown): 'left' | 'center' | 'right' {
    if (value === 'center') {
      return 'center';
    }

    if (value === 'end') {
      return 'right';
    }

    return 'left';
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
