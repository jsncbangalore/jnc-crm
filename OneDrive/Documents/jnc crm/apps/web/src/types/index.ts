/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export type Role =
  | 'platform_super_admin'
  | 'platform_admin'
  | 'platform_support'
  | 'platform_billing'
  | 'platform_developer'
  | 'tenant_admin'
  | 'admin'
  | 'sub_admin'
  | 'employee'
  | 'store_manager'
  | 'project_manager'
  | 'developer_lead'
  | 'developer'
  | 'finance'
  | 'accountant'
  | 'client'
  | 'customer';
export type LeadSource = 'indiamart' | 'web' | 'whatsapp' | 'manual';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost';
export type OrderStatus = 'confirmed' | 'processing' | 'dispatched' | 'delivered' | 'cancelled';
export type ShipmentStatus = 'dispatched' | 'in_transit' | 'out_for_delivery' | 'delivered';

export interface Tenant {
  id: string;
  code: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'expired';
  planTier: 'starter' | 'standard' | 'professional' | 'enterprise';
  maxUsers: number;
  logoUrl?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  currency?: string;
  lutBondNo?: string;
  lutValidity?: string;
  invoicePrefix?: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    users?: number;
    leads?: number;
    orders?: number;
    invoices?: number;
    skus?: number;
    projects?: number;
    mailAccounts?: number;
  };
}

export interface User {
  id: string;
  tenantId?: string;
  tenant?: Tenant;
  employeeCode: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  role: Role;
  teamId?: string;
  team?: string;
  teamRef?: { id: string; name: string; allowedPages?: string };
  warehouseId?: string;
  isActive: boolean;
  mustResetPassword?: boolean;
  lastLoginAt?: string;
  lastPasswordChangeAt?: string;
  createdById?: string;
  createdBy?: { id: string; name: string; employeeCode: string };
  createdAt?: string;
}

export interface Lead {
  id: string;
  leadNumber: string;
  source: LeadSource;
  status: LeadStatus;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  city?: string;
  productCategory?: string;
  productName?: string;
  quantity?: number;
  estimatedValue?: number;
  urgency?: 'urgent' | 'standard' | 'planning';
  queryMessage?: string;
  isDuplicate: boolean;
  companyId?: string;
  company?: { id: string; name: string };
  companyName?: string;
  assignedToId?: string;
  assignedTo?: Partial<User>;
  capturedAt: string;
  createdAt: string;
  activities?: LeadActivity[];
}

export interface LeadActivity {
  id: string;
  leadId: string;
  userId?: string;
  type: 'call' | 'email' | 'note' | 'meeting' | 'reminder' | 'task' | 'status_change';
  title: string;
  description?: string;
  scheduledAt?: string;
  completedAt?: string;
  isCompleted: boolean;
  createdAt: string;
  performedBy?: Partial<User>;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  notes?: string;
  leadTimeDays: number;
  isActive: boolean;
  _count?: {
    stockMovements?: number;
    preferredSkus?: number;
  };
}

export interface Sku {
  id: string;
  skuCode: string;
  name: string;
  category: string;
  hsnCode?: string;
  packageType?: string;
  taxRate?: number;
  unitPrice: number;
  costPrice: number;
  reorderPoint: number;
  reorderQty: number;
  preferredSupplierId?: string;
  preferredSupplier?: Supplier;
  // Computed in API
  totalOnHand?: number;
  totalReserved?: number;
  totalAvailable?: number;
  isLowStock?: boolean;
  stockPercent?: number;
}

export interface PaymentRecord {
  id: string;
  orderId?: string;
  invoiceId?: string;
  amount: number;
  paymentType: 'advance' | 'milestone' | 'final_settlement' | 'full_payment' | string;
  paymentMethod: 'NEFT' | 'RTGS' | 'IMPS' | 'Cheque' | 'UPI' | 'Cash' | string;
  transactionRef?: string;
  paymentDate: string;
  notes?: string;
  recordedBy?: { id: string; name: string; employeeCode: string };
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: 'pending' | 'partial' | 'paid';
  advancePercent?: number;
  advanceAmount?: number;
  paidAmount?: number;
  balanceAmount?: number;
  paymentRef?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress?: string;
  notes?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  confirmedAt: string;
  lines: OrderLine[];
  shipments: Shipment[];
  invoices?: Invoice[];
  payments?: PaymentRecord[];
}

export interface OrderLine {
  id: string;
  skuId: string;
  sku: Sku;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl?: string;
  status: ShipmentStatus;
  dispatchedAt: string;
  deliveredAt?: string;
}

export interface Company {
  id: string;
  name: string;
  gstin?: string;
  industry?: string;
  address?: string;
  city?: string;
  state?: string;
  website?: string;
  billingEmail?: string;
  createdAt?: string;
  contacts?: Array<{
    id: string;
    name: string;
    email?: string;
    phone: string;
    designation?: string;
    isPrimary: boolean;
  }>;
}

export interface SignatorySettings {
  companyName?: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatureImage?: string | null;
  stampImage?: string | null;
}

export interface BrandingSettings {
  companyDisplayName: string;
  companyPhone: string;
  companyLogoUrl: string | null;
}

export type DocumentType = 'tax_invoice' | 'sez_invoice' | 'proforma_invoice' | 'delivery_challan' | 'credit_note' | 'purchase_order';

export interface CompanyInvoiceProfile {
  companyName: string;
  tradingName: string;
  logoUrl?: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  pincode: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  msmeUdyamNo: string;
  lutBondNo: string;
  lutValidity: string;
  bankDetails: {
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifscCode: string;
    branch: string;
  };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  docType?: DocumentType;
  orderId?: string;
  companyId?: string;
  createdById?: string;
  invoiceDate: string;
  dueDate?: string;
  poDate?: string;
  buyerOrderNo?: string;
  referenceNo?: string;
  deliverySchedule?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerGstin?: string;
  customerState: string;
  billingAddress?: string;
  deliveryAddress?: string;
  lutBondNo?: string;
  lutValidity?: string;
  isSez?: boolean;
  advancePercent?: number;
  advanceAmount?: number;
  advanceAdjusted?: number;
  balanceDue?: number;
  paymentMethod?: string;
  transactionRef?: string;
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  roundOff?: number;
  paymentTerms?: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  pdfUrl?: string;
  isVoided: boolean;
  voidedAt?: string;
  voidReason?: string;
  notes?: string;
  createdAt: string;
  order?: Order;
  company?: Company;
  defaultBillingEmail?: string;
  signatorySettings?: SignatorySettings;
  companyProfile?: CompanyInvoiceProfile;
  createdBy?: Partial<User>;
  lines: InvoiceLine[];
  payments?: PaymentRecord[];
}

export interface InvoiceLine {
  id: string;
  invoiceId?: string;
  skuId?: string;
  hsnCode?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  lineTotal: number;
  sku?: Sku;
}

export interface DashboardKpis {
  isPlatformOwner?: boolean;
  platformMetrics?: {
    totalCompanies: number;
    activeCompanies: number;
    totalUsers: number;
  } | null;
  clientTenantInfo?: {
    id: string;
    code: string;
    name: string;
    isOnboarded: boolean;
    gstin: string | null;
    city: string | null;
  } | null;
  leadsToday: {
    total: number;
    breakdown: {
      indiamart: number;
      web: number;
      whatsapp: number;
      manual: number;
    };
  };
  pendingFollowUps: number;
  ordersInTransit: number;
  lowStockSkus: number;
  activeSuppliers: number;
  leadsByStatus: Record<string, number>;
  leadTrend: Array<{
    date: string;
    indiamart: number;
    web: number;
    whatsapp: number;
    manual: number;
    total: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    status: OrderStatus;
    confirmedAt: string;
  }>;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string;
  city?: string;
  isActive?: boolean;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  skuId: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  quantity: number;
  status: 'in_transit' | 'completed' | 'cancelled';
  notes?: string;
  initiatedById?: string;
  initiatedAt: string;
  receivedById?: string;
  receivedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  sku?: Sku;
  sourceWarehouse?: Warehouse;
  destinationWarehouse?: Warehouse;
  initiatedBy?: { id: string; name: string; employeeCode: string };
  receivedBy?: { id: string; name: string; employeeCode: string };
}

export type AutomationStepType =
  | 'send_email'
  | 'send_sms'
  | 'create_in_app_task'
  | 'update_lead_field'
  | 'reassign_record'
  | 'wait_then_continue';

export interface AutomationStep {
  id?: string;
  ruleId?: string;
  stepOrder: number;
  stepType: AutomationStepType;
  config: string | Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerEvent: string;
  conditionJson: string;
  actionType?: string;
  actionPayloadJson?: string;
  steps: AutomationStep[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'checkbox'
  | 'picklist'
  | 'lookup'
  | 'email'
  | 'phone'
  | 'url';

export interface CustomField {
  id: string;
  objectId: string;
  apiName: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired: boolean;
  isUnique: boolean;
  picklistValues?: string; // JSON string array
  lookupTargetObject?: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface CustomObject {
  id: string;
  apiName: string;
  label: string;
  pluralLabel: string;
  description?: string;
  type: 'Custom Object' | 'Standard Object';
  isStandard?: boolean;
  fieldsCount?: number;
  fields?: CustomField[];
  createdById?: string;
  createdAt?: string;
  updatedAt?: string;
  lastModified?: string;
  createdBy?: { id: string; name: string; employeeCode: string };
}

export interface ProjectStockPosition {
  id: string;
  project: string;
  reference: string;
  quantity: number;
  itemCode: string;
  partValue?: string | null;
  package?: string | null;
  unit: string;
  bomQtyPerUnit: number;
  batchQty: number;
  plannedRequirement: number;
  openingStock: number;
  inflow: number;
  outflow: number;
  presentStock: number;
  shortage: number;
  status: 'Sufficient' | 'Shortage' | 'Critical Shortage' | 'Surplus' | string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MailAccount {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  senderName?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  encryption: 'starttls' | 'ssl';
  isSecure?: boolean;
  purpose: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DomainHealthResult {
  domain: string;
  spf: {
    status: 'found' | 'missing' | 'invalid';
    record?: string;
    fix: string;
  };
  dkim: {
    status: 'found' | 'missing' | 'invalid';
    selector?: string;
    record?: string;
    fix: string;
  };
  dmarc: {
    status: 'found' | 'missing' | 'invalid';
    record?: string;
    fix: string;
  };
}
