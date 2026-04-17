import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  AppSettingsResponse,
  InvoiceTemplateAppSetting,
  InvoiceTemplateBlock,
  InvoiceTemplateBlockType,
} from '../../../core/models/app-settings.model';
import { TenantMediaAsset } from '../../../core/models/image.model';
import { AppSettingsService } from '../../../core/services/app-settings.service';
import { extractApiError } from '../../../core/utils/api-error.util';
import { formatImageAssetMeta, imageUrl, validateImageFile } from '../../../core/utils/image-upload.util';
import { ImageUploadFieldComponent } from '../../../shared/components/image-upload-field/image-upload-field.component';

interface TemplateBlockBlueprint {
  type: InvoiceTemplateBlockType;
  label: string;
  heading: string;
  description: string;
}

const TEMPLATE_BLOCK_LIBRARY: TemplateBlockBlueprint[] = [
  {
    type: 'text',
    label: 'Text Block',
    heading: 'Text block',
    description: 'Type directly inside the green text block on the canvas.',
  },
  {
    type: 'seller',
    label: 'Seller',
    heading: 'Seller details',
    description: 'Business logo, brand name, and registered business details.',
  },
  {
    type: 'billTo',
    label: 'Bill To',
    heading: 'Customer details',
    description: 'Buyer name, address, contact person, and billing summary.',
  },
  {
    type: 'itemsTable',
    label: 'Items table',
    heading: 'Line items',
    description: 'Catalog rows, quantities, pricing, taxes, and totals columns.',
  },
  {
    type: 'notes',
    label: 'Notes',
    heading: 'Notes section',
    description: 'Header notes, footer notes, and billing description area.',
  },
  {
    type: 'hero',
    label: 'Hero',
    heading: 'Invoice hero',
    description: 'Legacy title area with invoice type, badge, and short supporting copy.',
  },
  {
    type: 'invoiceMeta',
    label: 'Meta',
    heading: 'Invoice facts',
    description: 'Legacy invoice number, dates, status, and payment terms.',
  },
  {
    type: 'totals',
    label: 'Totals',
    heading: 'Total summary',
    description: 'Legacy subtotal, tax total, grand total, and amount in words.',
  },
  {
    type: 'terms',
    label: 'Terms',
    heading: 'Terms and conditions',
    description: 'Legacy payment rules, legal disclaimers, and shareable terms.',
  },
  {
    type: 'footer',
    label: 'Footer',
    heading: 'Footer bar',
    description: 'Legacy bank details, contact links, and brand footer line.',
  },
];

const VISIBLE_TEMPLATE_BLOCK_TYPES: InvoiceTemplateBlockType[] = ['text', 'seller', 'billTo', 'itemsTable', 'notes'];

@Component({
  selector: 'app-invoice-template',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DragDropModule, ImageUploadFieldComponent],
  templateUrl: './invoice-template.component.html',
  styleUrls: ['./invoice-template.component.scss'],
})
export class InvoiceTemplateComponent implements OnInit {
  readonly paletteDropListId = 'invoiceTemplatePalette';
  readonly canvasDropListId = 'invoiceTemplateCanvas';
  readonly blockLibrary = VISIBLE_TEMPLATE_BLOCK_TYPES.map((type) => this.resolveBlueprint(type));
  readonly fontOptions = ['Inter', 'Urbanist'];

  readonly templateForm;

  loading = false;
  saving = false;
  deleting = false;
  error: string | null = null;
  success: string | null = null;
  templateBackgroundUploading = false;
  templateBackgroundRemoving = false;
  templateBackgroundError: string | null = null;
  templateBackgroundSuccess: string | null = null;

  templates: InvoiceTemplateAppSetting[] = [];
  currentBlocks: InvoiceTemplateBlock[] = [];
  selectedTemplateId: string | null = null;
  templateBackgroundAssets: TenantMediaAsset[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly appSettingsService: AppSettingsService,
  ) {
    this.templateForm = this.fb.group({
      temp_name: ['Modern Invoice', Validators.required],
      description: ['Balanced A4 layout for service and product invoices.'],
      fontFamily: ['Inter'],
      accentColor: ['#10b981'],
      is_default: [true],
    });
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  get currentAccentColor(): string {
    return this.normalizeColor(this.templateForm.getRawValue().accentColor);
  }

  get currentFontFamily(): string {
    return this.normalizeFont(this.templateForm.getRawValue().fontFamily);
  }

  get canDeleteSelectedTemplate(): boolean {
    return !!this.getSelectedSavedTemplate();
  }

  get selectedTemplateBackgroundAsset(): TenantMediaAsset | null {
    const selectedId = String(this.selectedTemplateId || '').trim();
    if (!selectedId) {
      return null;
    }

    return this.templateBackgroundAssets.find((asset) => asset.asset_key === selectedId) || null;
  }

  get templateBackgroundUrl(): string {
    return imageUrl(this.selectedTemplateBackgroundAsset?.file);
  }

  get templateBackgroundFileName(): string {
    return String(this.selectedTemplateBackgroundAsset?.file?.original_name || '').trim();
  }

  get templateBackgroundMeta(): string {
    return formatImageAssetMeta(this.selectedTemplateBackgroundAsset?.file);
  }

  get templatePaperBackgroundStyle(): string | null {
    if (!this.templateBackgroundUrl) {
      return null;
    }

    return `linear-gradient(rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.95)), url('${this.templateBackgroundUrl}')`;
  }

  createNewTemplate(): void {
    this.error = null;
    this.success = null;
    this.templateBackgroundError = null;
    this.templateBackgroundSuccess = null;
    this.selectedTemplateId = this.createId('invoice-template');
    this.templateForm.reset(
      {
        temp_name: 'Modern Invoice',
        description: 'Balanced A4 layout for service and product invoices.',
        fontFamily: 'Inter',
        accentColor: '#10b981',
        is_default: !this.templates.some((template) => template['is_default'] === true),
      },
      { emitEvent: false },
    );
    this.currentBlocks = this.buildStarterBlocks();
  }

  selectTemplate(templateId: string): void {
    const template = this.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    this.error = null;
    this.success = null;
    this.templateBackgroundError = null;
    this.templateBackgroundSuccess = null;
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
        this.syncTemplateBackgroundAssets(response);
        this.selectTemplate(currentTemplate.id || this.templates[0]?.id || '');
        this.success = response?.message || 'Invoice templates saved successfully.';
      },
      error: (error) => {
        this.saving = false;
        this.error = extractApiError(error, 'Failed to save invoice templates.');
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
    const normalizedRemaining = remainingTemplates.map((template, index) => ({
      ...template,
      is_default: template.is_default === true || (!remainingTemplates.some((item) => item.is_default) && index === 0),
    }));

    this.deleting = true;

    this.appSettingsService.updateInvoiceTemplates(normalizedRemaining).subscribe({
      next: (response) => {
        this.deleting = false;
        this.templates = this.normalizeTemplates(response?.settings?.invoice_template || normalizedRemaining);
        this.syncTemplateBackgroundAssets(response);
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

  onCanvasDrop(event: CdkDragDrop<any[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(this.currentBlocks, event.previousIndex, event.currentIndex);
      this.currentBlocks = [...this.currentBlocks];
      return;
    }

    const draggedBlock = event.item.data as InvoiceTemplateBlock | TemplateBlockBlueprint;
    const blockType = this.isTemplateBlock(draggedBlock) ? draggedBlock.type : draggedBlock.type;
    const nextBlocks = [...this.currentBlocks];
    nextBlocks.splice(event.currentIndex, 0, this.createBlock(blockType));
    this.currentBlocks = nextBlocks;
  }

  onPaletteDrop(event: CdkDragDrop<any[]>): void {
    if (event.previousContainer === event.container) {
      return;
    }

    if (event.previousContainer.id === this.canvasDropListId) {
      const nextBlocks = [...this.currentBlocks];
      nextBlocks.splice(event.previousIndex, 1);
      this.currentBlocks = nextBlocks;
    }
  }

  addBlock(blockType: InvoiceTemplateBlockType): void {
    this.currentBlocks = [...this.currentBlocks, this.createBlock(blockType)];
  }

  duplicateBlock(blockId: string): void {
    const index = this.currentBlocks.findIndex((block) => block.id === blockId);
    if (index < 0) {
      return;
    }

    const block = this.currentBlocks[index];
    const duplicate = {
      ...block,
      id: this.createId(block.type),
    };
    const nextBlocks = [...this.currentBlocks];
    nextBlocks.splice(index + 1, 0, duplicate);
    this.currentBlocks = nextBlocks;
  }

  removeBlock(blockId: string): void {
    this.currentBlocks = this.currentBlocks.filter((block) => block.id !== blockId);
  }

  updateBlockField(blockId: string, field: 'heading' | 'description' | 'layout', value: string): void {
    this.currentBlocks = this.currentBlocks.map((block) => (
      block.id === blockId
        ? {
            ...block,
            [field]: value,
          }
        : block
    ));
  }

  updateTextBlockContent(blockId: string, value: string): void {
    const block = this.currentBlocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'text') {
      return;
    }

    block.content = this.normalizeContent(value);
  }

  normalizeTextBlockContent(blockId: string, textarea: HTMLTextAreaElement): void {
    const block = this.currentBlocks.find((item) => item.id === blockId);
    if (!block || block.type !== 'text') {
      return;
    }

    const normalizedValue = this.normalizeContent(textarea.value).replace(/\n{3,}/g, '\n\n');
    block.content = normalizedValue;
    textarea.value = normalizedValue;
  }

  trackByTemplateId(_index: number, template: InvoiceTemplateAppSetting): string {
    return template.id || `template-${_index}`;
  }

  trackByBlockId(_index: number, block: InvoiceTemplateBlock): string {
    return block.id;
  }

  onTemplateBackgroundSelected(file: File): void {
    const selectedId = String(this.selectedTemplateId || '').trim();
    if (!selectedId) {
      this.templateBackgroundError = 'Save or select a template before uploading a background image.';
      this.templateBackgroundSuccess = null;
      return;
    }

    const validationError = validateImageFile(file);
    if (validationError) {
      this.templateBackgroundError = validationError;
      this.templateBackgroundSuccess = null;
      return;
    }

    this.templateBackgroundUploading = true;
    this.templateBackgroundError = null;
    this.templateBackgroundSuccess = null;

    const activeTemplateName = this.cleanText(this.templateForm.getRawValue().temp_name) || 'Invoice Template Background';
    const currentAsset = this.selectedTemplateBackgroundAsset;
    const request$ = currentAsset?.id
      ? this.appSettingsService.replaceAsset(currentAsset.id, {
          file,
          assetType: 'invoice_template_background',
          assetKey: selectedId,
          title: activeTemplateName,
        })
      : this.appSettingsService.uploadAsset({
          file,
          assetType: 'invoice_template_background',
          assetKey: selectedId,
          title: activeTemplateName,
        });

    request$.subscribe({
      next: (response) => {
        this.templateBackgroundUploading = false;
        this.upsertTemplateBackgroundAsset(response?.data || null);
        this.templateBackgroundSuccess = response?.message || 'Template background updated successfully.';
      },
      error: (error) => {
        this.templateBackgroundUploading = false;
        this.templateBackgroundError = extractApiError(error, 'Failed to update the template background.');
      },
    });
  }

  removeTemplateBackground(): void {
    const currentAsset = this.selectedTemplateBackgroundAsset;
    if (!currentAsset?.id) {
      return;
    }

    this.templateBackgroundRemoving = true;
    this.templateBackgroundError = null;
    this.templateBackgroundSuccess = null;

    this.appSettingsService.deleteAsset(currentAsset.id).subscribe({
      next: (response) => {
        this.templateBackgroundRemoving = false;
        this.templateBackgroundAssets = this.templateBackgroundAssets.filter((asset) => asset.id !== currentAsset.id);
        this.templateBackgroundSuccess = response?.message || 'Template background removed successfully.';
      },
      error: (error) => {
        this.templateBackgroundRemoving = false;
        this.templateBackgroundError = extractApiError(error, 'Failed to remove the template background.');
      },
    });
  }

  private loadTemplates(): void {
    this.loading = true;
    this.error = null;
    this.success = null;

    this.appSettingsService.getSettings().subscribe({
      next: (response) => {
        this.loading = false;
        this.templates = this.normalizeTemplates(response?.settings?.invoice_template || []);
        this.syncTemplateBackgroundAssets(response);
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
        pageStyle: 'builder',
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
        pageStyle: this.cleanText(design.pageStyle) || 'builder',
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
    const blueprint = this.resolveBlueprint(this.isTemplateBlock(block) ? block.type : 'text');
    return {
      ...source,
      id: this.cleanText(source.id) || this.createId(`${blueprint.type}-${index + 1}`),
      type: blueprint.type,
      label: this.cleanText(source.label) || blueprint.label,
      heading: this.cleanText(source.heading) || blueprint.heading,
      description: this.cleanText(source.description) || blueprint.description,
      enabled: source.enabled !== false,
      layout: source.layout === 'split' ? 'split' : 'full',
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
      surfaceStyle: type === 'text' ? 'plain' : type === 'seller' || type === 'billTo' || type === 'itemsTable' ? 'outline' : 'plain',
      content: type === 'text' ? '' : '',
      fontSize: type === 'text' ? 18 : 16,
      width: type === 'text' ? 320 : 720,
      autoWidth: type === 'text',
    };
  }

  private resolveBlueprint(type: InvoiceTemplateBlockType): TemplateBlockBlueprint {
    return TEMPLATE_BLOCK_LIBRARY.find((item) => item.type === type) || TEMPLATE_BLOCK_LIBRARY[0];
  }

  private isTemplateBlock(value: unknown): value is InvoiceTemplateBlock {
    return !!value && typeof value === 'object' && 'type' in value;
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private cleanText(value: unknown): string {
    return String(value || '').trim();
  }

  private normalizeContent(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private normalizeColor(value: unknown): string {
    const candidate = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : '#10b981';
  }

  private normalizeFont(value: unknown): string {
    const candidate = this.cleanText(value);
    return this.fontOptions.includes(candidate) ? candidate : 'Inter';
  }

  private normalizeOptionalColor(value: unknown): string {
    const candidate = this.cleanText(value);
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : '';
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

  private syncTemplateBackgroundAssets(response: AppSettingsResponse | null | undefined): void {
    const assets = response?.assets?.grouped?.['invoice_template_background'] || [];
    this.templateBackgroundAssets = Array.isArray(assets) ? [...assets] : [];
  }

  private upsertTemplateBackgroundAsset(asset: TenantMediaAsset | null): void {
    if (!asset) {
      return;
    }

    const index = this.templateBackgroundAssets.findIndex((item) => item.id === asset.id);
    if (index >= 0) {
      this.templateBackgroundAssets[index] = asset;
      this.templateBackgroundAssets = [...this.templateBackgroundAssets];
      return;
    }

    this.templateBackgroundAssets = [asset, ...this.templateBackgroundAssets];
  }
}
