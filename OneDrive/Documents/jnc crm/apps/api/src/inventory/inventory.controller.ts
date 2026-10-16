/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, UseGuards, UseInterceptors, UploadedFile, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { InventoryService } from './inventory.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { requireTenantId } from '../common/tenant.util';
import { validateUploadedFile } from '../common/file-validator';
import {
  CreateWarehouseDto,
  RecordMovementDto,
  CreateSkuDto,
  UpdateSkuDto,
  BulkDeleteSkusDto,
  ImportInventoryDto,
  TransferStockDto,
  CreateProjectStockDto,
  UpdateProjectStockDto,
  AssignProjectStockDto,
  BulkImportProjectStockDto,
  AllocateProjectStockDto,
  CreatePurchaseBillDto,
  ScanBillOcrDto,
  BulkEditComponentsDto,
  RecordPurchaseDto,
  ClearAllInventoryDto,
} from './dto/inventory.dto';
import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Response } from 'express';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

@Controller('inventory')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('stock')
  getStockLevels(
    @CurrentUser() user: ScopedUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
    @Query('lowStock') lowStock?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.inventoryService.getStockLevels(user, {
      warehouseId,
      search,
      lowStock: lowStock === 'true',
      page,
      limit,
    });
  }

  @Post('movements')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  recordMovement(@Body() data: RecordMovementDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.recordMovement(data, user);
  }

  @Get('movements')
  getMovements(
    @CurrentUser() user: ScopedUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('skuId') skuId?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.inventoryService.getMovements(user, { warehouseId, skuId, type, page, limit });
  }

  @Get('reorder-alerts')
  @Roles('tenant_admin', 'admin')
  getReorderAlerts(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.getReorderAlerts(user);
  }

  @Get('warehouses')
  getWarehouses(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.getWarehouses(user);
  }

  @Post('warehouses')
  @Roles('tenant_admin', 'admin')
  createWarehouse(
    @Body() data: CreateWarehouseDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.inventoryService.createWarehouse(data, user);
  }

  @Get('skus')
  getSkus(@CurrentUser() user: ScopedUser, @Query('search') search?: string) {
    return this.inventoryService.getSkus(user, search);
  }

  @Get('skus/:id')
  getSku(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.getSkuById(id, user);
  }

  @Post('skus')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  createSku(@Body() data: CreateSkuDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.createSku(data, user);
  }

  @Patch('skus/:id')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  updateSku(@Param('id') id: string, @Body() data: UpdateSkuDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.updateSku(id, data, user);
  }

  @Delete('skus/:id')
  @Roles('tenant_admin', 'admin')
  deleteSku(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.deleteSku(id, user);
  }

  @Post('skus/bulk-delete')
  @Roles('tenant_admin', 'admin')
  bulkDeleteSkus(@Body() body: BulkDeleteSkusDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.bulkDeleteSkus(body.ids, user);
  }

  /**
   * Raw Multipart File Upload for Excel (.xlsx/.xls) or CSV with 50MB limit
   */
  @Post('import-csv')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB multipart limit
    }),
  )
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
    @Query('warehouseCode') warehouseCode?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Spreadsheet/CSV file is required');
    }

    validateUploadedFile(file, 'spreadsheet', 50 * 1024 * 1024);

    let records: any[] = [];

    const lowerName = file.originalname.toLowerCase();

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      try {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert to 2D array of rows to scan for real header row
        const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        
        if (!rawRows || rawRows.length === 0) {
          throw new BadRequestException('Spreadsheet is empty');
        }

        // Find the row index that contains actual column headers (skip top titles/banners)
        let headerRowIndex = -1;
        const keywords = ['sku', 'item', 'code', 'part', 'component', 'description', 'specs', 'project', 'unit', 'price', 'rate', 'quantity', 'qty', 'stock'];

        for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
          const row = rawRows[i];
          if (!Array.isArray(row)) continue;
          const rowText = row.map((c) => String(c || '').toLowerCase().trim()).join(' ');
          let matches = 0;
          for (const kw of keywords) {
            if (rowText.includes(kw)) matches++;
          }
          if (matches >= 2) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          headerRowIndex = 0;
        }

        const headers = rawRows[headerRowIndex].map((h) => String(h || '').trim());

        for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.every((c) => c === '' || c === null || c === undefined)) {
            continue;
          }
          const obj: any = {};
          let hasData = false;
          for (let c = 0; c < headers.length; c++) {
            const h = headers[c];
            if (h) {
              obj[h] = row[c];
              if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
                hasData = true;
              }
            }
          }
          if (hasData) {
            records.push(obj);
          }
        }
      } catch (err: any) {
        throw new BadRequestException(`Excel parsing error: ${err.message}`);
      }
    } else {
      const csvContent = file.buffer.toString('utf-8');
      const parsed = Papa.parse(csvContent, { header: false, skipEmptyLines: true });
      const rawRows: any[][] = parsed.data as any[][];

      if (!rawRows || rawRows.length === 0) {
        throw new BadRequestException('CSV file is empty');
      }

      let headerRowIndex = -1;
      const keywords = ['sku', 'item', 'code', 'part', 'component', 'description', 'specs', 'project', 'unit', 'price', 'rate', 'quantity', 'qty', 'stock'];

      for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
        const row = rawRows[i];
        if (!Array.isArray(row)) continue;
        const rowText = row.map((c) => String(c || '').toLowerCase().trim()).join(' ');
        let matches = 0;
        for (const kw of keywords) {
          if (rowText.includes(kw)) matches++;
        }
        if (matches >= 2) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        headerRowIndex = 0;
      }

      const headers = rawRows[headerRowIndex].map((h) => String(h || '').trim());

      for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!Array.isArray(row) || row.every((c) => c === '' || c === null || c === undefined)) {
          continue;
        }
        const obj: any = {};
        let hasData = false;
        for (let c = 0; c < headers.length; c++) {
          const h = headers[c];
          if (h) {
            obj[h] = row[c];
            if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
              hasData = true;
            }
          }
        }
        if (hasData) {
          records.push(obj);
        }
      }
    }

    return this.inventoryService.importSpreadsheet(records, user, warehouseCode);
  }

  @Post('import-json')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async importJson(
    @Body() body: ImportInventoryDto,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!body.records || !Array.isArray(body.records)) {
      throw new BadRequestException('Records array is required');
    }
    return this.inventoryService.importSpreadsheet(body.records, user, body.warehouseCode);
  }

  @Get('template-csv')
  downloadTemplate(@Res() res: Response) {
    const csvContent = `SKU Code,Name,Category,HSN Code,Package Type,Unit Price,Cost Price,Reorder Point,Reorder Qty,Quantity,Supplier Name,Bin
PA-AMP-240W,240W Commercial PA Mixer Amplifier 100V,PA System,85184000,Unit,14500.00,9800.00,5,20,12,Ahuja / Bosch Sound India,BLR-A-01-B01
PA-SPK-CLG-6W,6W Fast-Clamp Ceiling Speaker 100V,PA System,85182100,Unit,850.00,480.00,25,100,80,Ahuja / Bosch Sound India,BLR-A-01-B02
PA-SPK-HRN-30W,30W Reflex Horn Weatherproof Speaker,PA System,85182900,Unit,2200.00,1400.00,10,50,35,Ahuja / Bosch Sound India,BLR-A-01-B03
TB-MST-10Z,10-Zone Master Intercom Control Station,Talk Back System,85176290,Unit,18500.00,12000.00,3,10,8,JSNC In-House Integration,BLR-A-02-A01
TB-SUB-FLUSH,Flush Mount Heavy-Duty Sub-station Intercom,Talk Back System,85176290,Unit,1850.00,1100.00,15,50,42,JSNC In-House Integration,BLR-A-02-A02
ATB-CTRL-2LP,2-Loop Addressable Talk Back Master Controller,Addressable Talk Back,85176290,Unit,34000.00,23500.00,2,5,4,JSNC Systems R&D,BLR-A-02-B01
ATB-ZMD-01,Addressable Zone Interface Module,Addressable Talk Back,85176290,Unit,2400.00,1550.00,20,50,45,JSNC Systems R&D,BLR-A-02-B02
FAS-PNL-16Z,16-Zone Microprocessor Fire Alarm Control Panel,Fire Alarm System,85311010,Unit,22500.00,15000.00,3,10,6,Honeywell / GST Fire India,BLR-B-01-A01
FAS-DET-SMK-OPT,Optical Smoke Detector with Standard Base,Fire Alarm System,85311090,Unit,950.00,550.00,50,200,140,Honeywell / GST Fire India,BLR-B-01-A02
FAS-MCP-RED,Resettable Manual Call Point with LED Indicator,Fire Alarm System,85319000,Unit,650.00,380.00,30,100,65,Honeywell / GST Fire India,BLR-B-01-A03
FAS-SND-HTR,Dual-Tone Electronic Fire Alarm Hooter with Strobe,Fire Alarm System,85318000,Unit,1200.00,720.00,20,80,50,Honeywell / GST Fire India,BLR-B-01-A04
NCS-PANEL-32,32-Bed Digital Nurse Call Station Display,Nurse Call System,85176990,Unit,28000.00,19000.00,2,5,5,JSNC Medical Systems,BLR-B-02-A01
NCS-CALL-BED,Bedside Emergency Call Button with Cord,Nurse Call System,85319000,Unit,1150.00,680.00,25,100,75,JSNC Medical Systems,BLR-B-02-A02
PBX-IP-16EXT,IP-PBX Hybrid 16 Extension VoIP Gateway,EPABX / IPABX,85176210,Unit,19500.00,13200.00,4,15,10,Matrix Comsec / Grandstream,BLR-C-01-A01
PBX-PHONE-SIP,HD Executive SIP IP Phone with Color Screen,EPABX / IPABX,85171810,Unit,4200.00,2750.00,10,30,22,Matrix Comsec / Grandstream,BLR-C-01-A02
PAS-BTN-HOLDUP,Dual-Action Bank Under-Desk Panic Switch,Panic Alarm System,85319000,Unit,450.00,220.00,25,100,60,JSNC Security Controls,BLR-C-02-A01
CCTV-CAM-4MP-DOM,4MP IR Turret Dome IP Camera 30m PoE,CCTV Surveillance,85258900,Unit,3200.00,2100.00,15,50,38,Hikvision / Dahua India,BLR-D-01-A01
CCTV-NVR-16CH-4K,16-Channel 4K Ultra HD NVR with 16-PoE,CCTV Surveillance,85285900,Unit,16500.00,11000.00,3,10,7,Hikvision / Dahua India,BLR-D-01-A02
ACS-BIO-FP-FACE,Biometric Facial Recognition & Fingerprint Terminal,Access Control,85437099,Unit,12500.00,8200.00,5,20,14,ZKTeco / eSSL Security,BLR-E-01-A01
ACS-LOCK-EM-600,Electromagnetic Lock 600 lbs with ZL Bracket,Access Control,83014090,Set,2800.00,1750.00,10,40,26,ZKTeco / eSSL Security,BLR-E-01-A02
NET-SW-24POE-GIG,24-Port Gigabit Managed PoE+ Network Switch 370W,Network Infrastructure,85176290,Unit,18500.00,12500.00,4,15,9,D-Link / Cisco Systems,BLR-F-01-A01
NET-CAB-CAT6-305,Cat6 UTP 4-Pair Solid Bare Copper 305m Drum,Network Infrastructure,85444999,Drum,8800.00,6200.00,5,20,18,Schneider / D-Link India,BLR-F-01-A02
`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="inventory_import_template.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(csvContent);
  }

  // ─── Stock Transfers Endpoints ──────────────────────────────────────────────

  @Post('transfers')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async initiateTransfer(
    @Body() body: TransferStockDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.inventoryService.initiateTransfer(body, user);
  }

  @Get('transfers')
  async getTransfers(
    @CurrentUser() user: ScopedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
  ) {
    return this.inventoryService.getTransfers(user, { page, limit, status, warehouseId, search });
  }

  @Get('transfers/summary')
  async getTransfersSummary(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.getInTransitSummary(user);
  }

  @Patch('transfers/:id/receive')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async receiveTransfer(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.receiveTransfer(id, user);
  }

  @Patch('transfers/:id/cancel')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async cancelTransfer(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.cancelTransfer(id, user);
  }

  // ─── Inventory Management — Project-wise Stock Position Endpoints ───────────

  @Get('project-stock')
  async getProjectStock(
    @CurrentUser() user: ScopedUser,
    @Query('project') project?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('shortageOnly') shortageOnly?: string,
  ) {
    return this.inventoryService.getProjectStockPositions(user, {
      project,
      search,
      status,
      shortageOnly: shortageOnly === 'true',
    });
  }

  @Get('project-stock/summary')
  async getProjectStockSummary(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.getProjectStockSummary(user);
  }

  @Post('project-stock')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async createProjectStock(@Body() data: CreateProjectStockDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.createProjectStockPosition(data, user);
  }

  @Patch('project-stock/:id')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async updateProjectStock(
    @Param('id') id: string,
    @Body() data: UpdateProjectStockDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.inventoryService.updateProjectStockPosition(id, data, user);
  }

  @Post('project-stock/:id/purchase')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async recordProjectStockPurchase(
    @Param('id') id: string,
    @Body() body: {
      quantityPurchased: number;
      unitRate: number;
      taxRate: number;
      supplierName?: string;
      supplierGstin?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      documentDataUrl?: string;
      notes?: string;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.inventoryService.recordProjectStockPurchase(id, body, user);
  }

  @Delete('project-stock/:id')
  @Roles('tenant_admin', 'admin')
  async deleteProjectStock(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.deleteProjectStockPosition(id, user);
  }

  @Post('project-stock/bulk')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async bulkImportProjectStock(@Body() body: BulkImportProjectStockDto, @CurrentUser() user: ScopedUser) {
    if (!body.rows || !Array.isArray(body.rows)) {
      throw new BadRequestException('Invalid payload: rows array required');
    }
    return this.inventoryService.bulkImportProjectStockPositions(body.rows, user);
  }

  @Post('clear-all')
  @Roles('tenant_admin')
  async clearAllInventory(@Body() body: ClearAllInventoryDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.clearAllInventory(body.confirmPhrase, body.password, user);
  }

  @Get('project-stock/template-csv')
  downloadProjectStockTemplate(@Res() res: Response) {
    const csvContent = `Project,Reference,Quantity,Item Code,Part Value,Package,Unit,BOM Qty / Unit,Batch Qty,Planned Requirement,Opening Stock,Inflow,Outflow,Present Stock,Shortage,Status,Notes
Sample Project A - PA System,AMP-RACK-01,10,PA-AMP-240W,240W 100V RMS,2U 19-inch Rack,Nos,2,10,20,30,0,8,22,0,Sufficient,Main concourse & platform distribution amplifiers
Sample Project A - PA System,SPK-CLG-01,10,PA-SPK-CLG-6W,6W 100V Fast Clamp,Ceiling Flush Mount,Nos,24,10,240,180,100,60,220,20,Shortage,Underground ticketing concourse speakers
Sample Project B - Surveillance & Access Control,CCTV-CAM-EXT,4,CCTV-CAM-4MP-DOM,4MP IR 30m PoE H.265+,Vandal Dome IP67,Nos,16,4,64,45,25,10,60,4,Shortage,Corridor and perimeter optical surveillance
Sample Project B - Surveillance & Access Control,ACS-FACE-01,4,ACS-BIO-FP-FACE,Face + FP + RFID TCP/IP,Wall Mount Touch,Nos,6,4,24,12,0,0,12,12,Critical Shortage,Turnstile & server room access
Sample Project C - Nurse Call System,NCS-STN-ICU,2,NCS-PANEL-32,32-Bed Digital LCD Station,Nurse Station Console,Nos,2,2,4,5,0,1,4,0,Sufficient,Ward central monitoring console
`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="project_stock_position_template.csv"');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(csvContent);
  }

  // ─── Finished Products (3-Tier) ─────────────────────────────────────────────

  @Get('products')
  async getProducts(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.getProducts(user);
  }

  @Post('seed-products')
  @Roles('tenant_admin', 'admin')
  async seedProducts(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.seedFinishedProducts(user);
  }

  // ─── Inventory Dashboard ─────────────────────────────────────────────────────

  @Get('dashboard')
  async getInventoryDashboard(@CurrentUser() user: ScopedUser) {
    return this.inventoryService.getInventoryDashboard(user);
  }

  // ─── Purchase Document Upload ────────────────────────────────────────────────

  @Post('purchase-documents/upload')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadPurchaseDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!file) throw new BadRequestException('File is required');

    validateUploadedFile(file, 'document_or_image', 10 * 1024 * 1024);

    const tenantId = requireTenantId(user);
    const tenantDir = path.resolve(process.cwd(), '../../purchase-documents', tenantId);
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });

    const ext = path.extname(file.originalname).toLowerCase();
    const randomName = `${crypto.randomUUID()}${ext}`;
    const destinationPath = path.resolve(tenantDir, randomName);

    fs.writeFileSync(destinationPath, file.buffer);

    const fileUrl = `/api/v1/inventory/purchase-documents/${tenantId}/${randomName}`;
    return {
      success: true,
      url: fileUrl,
      filename: randomName,
      tenantId,
      originalName: file.originalname,
    };
  }

  @Post('purchase-documents/extract')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async extractPurchaseDocument(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: ScopedUser,
  ) {
    if (!file) throw new BadRequestException('File is required for extraction');
    validateUploadedFile(file, 'document_or_image', 10 * 1024 * 1024);

    const extracted = await this.inventoryService.extractFromDocumentBuffer(file.buffer, file.originalname);
    return {
      success: true,
      extractedData: {
        ...extracted,
        filename: file.originalname,
      },
    };
  }

  // ─── Protected Streaming of Purchase Documents ──────────────────────────────


  @Get('purchase-documents/:filename')
  async streamPurchaseDoc(
    @Param('filename') filename: string,
    @CurrentUser() user: ScopedUser,
    @Res() res: Response,
  ) {
    const tenantId = requireTenantId(user);
    return this.serveSafeTenantDoc(tenantId, filename, user, res);
  }

  @Get('purchase-documents/:tenantId/:filename')
  async streamPurchaseDocWithTenant(
    @Param('tenantId') targetTenantId: string,
    @Param('filename') filename: string,
    @CurrentUser() user: ScopedUser,
    @Res() res: Response,
  ) {
    return this.serveSafeTenantDoc(targetTenantId, filename, user, res);
  }

  @Get('uploads/purchase-docs/:filename')
  async streamLegacyPurchaseDoc(
    @Param('filename') filename: string,
    @CurrentUser() user: ScopedUser,
    @Res() res: Response,
  ) {
    const tenantId = requireTenantId(user);
    return this.serveSafeTenantDoc(tenantId, filename, user, res);
  }

  private serveSafeTenantDoc(
    targetTenantId: string,
    filename: string,
    user: ScopedUser,
    res: Response,
  ) {
    const userTenantId = requireTenantId(user);
    if (user.role !== 'platform_super_admin' && userTenantId !== targetTenantId) {
      throw new ForbiddenException('Access denied to cross-tenant documents.');
    }

    const possibleDirs = [
      path.resolve(process.cwd(), '../../purchase-documents', targetTenantId),
      path.resolve(process.cwd(), '../purchase-documents', targetTenantId),
      path.resolve(process.cwd(), 'purchase-documents', targetTenantId),
    ];

    let safePath = '';
    for (const dir of possibleDirs) {
      const candidate = path.resolve(dir, path.basename(filename));
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        safePath = candidate;
        break;
      }
    }

    if (!safePath) {
      throw new NotFoundException('Requested document was not found.');
    }

    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(safePath);
  }

  // ─── Supplier Purchase History ───────────────────────────────────────────────

  @Get('suppliers/:supplierId/purchases')
  async getSupplierPurchases(
    @Param('supplierId') supplierId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.inventoryService.getSupplierPurchases(supplierId, user);
  }

  @Post('suppliers/:supplierId/purchase')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async recordSupplierPurchase(
    @Param('supplierId') supplierId: string,
    @Body() body: RecordPurchaseDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.inventoryService.recordSupplierPurchase(supplierId, body as any, user);
  }

  // ─── Purchase Bills & Soft Copies Repository ─────────────────────────────────

  @Get('purchase-bills')
  async getPurchaseBills(@CurrentUser() user: ScopedUser, @Query() query: any) {
    return this.inventoryService.getPurchaseBills(user, query);
  }

  @Get('purchase-bills/:id')
  async getPurchaseBill(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.getPurchaseBill(id, user);
  }

  @Post('purchase-bills')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async createPurchaseBill(@Body() body: CreatePurchaseBillDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.createPurchaseBill(body, user);
  }

  @Delete('purchase-bills/:id')
  @Roles('tenant_admin', 'admin')
  async deletePurchaseBill(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.deletePurchaseBill(id, user);
  }

  @Post('purchase-bills/scan-ocr')
  async scanBillOcr(@Body() body: ScanBillOcrDto) {
    return this.inventoryService.scanBillOcr(body);
  }

  // ─── High-Speed Bulk Component Editing ──────────────────────────────────────

  @Post('bulk-edit')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  async bulkEditComponents(@Body() body: BulkEditComponentsDto, @CurrentUser() user: ScopedUser) {
    return this.inventoryService.bulkEditComponents(body, user);
  }
}




