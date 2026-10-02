/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import axios from 'axios';

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return '/api/v1';
    }
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.jsnc.co.in/api/v1';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jnc_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('jnc_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');
        const refreshUrl = `${getApiBaseUrl()}/auth/refresh`;
        const { data } = await axios.post(refreshUrl, { refreshToken });
        localStorage.setItem('jnc_access_token', data.accessToken);
        localStorage.setItem('jnc_refresh_token', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('jnc_access_token');
        localStorage.removeItem('jnc_refresh_token');
        localStorage.removeItem('jnc_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string, companyCode?: string) =>
    api.post('/auth/login', { username, password, companyCode }),
  me: () => api.get('/auth/me'),
  updateProfile: (data: { name?: string; phone?: string }) =>
    api.patch('/auth/profile', data),
  changePassword: (currentPass: string, newPass: string) =>
    api.post('/auth/change-password', { currentPass, newPass }),
};

// ─── Platform Multi-Tenant Master Portal ──────────────────────────────────────
export const platformApi = {
  listTenants: () => api.get('/platform/tenants'),
  getTenant: (id: string) => api.get(`/platform/tenants/${id}`),
  createTenant: (data: any) => api.post('/platform/tenants', data),
  updateTenant: (id: string, data: any) => api.put(`/platform/tenants/${id}`, data),
  deleteTenant: (id: string) => api.delete(`/platform/tenants/${id}`),
  impersonateTenant: (id: string) => api.post(`/platform/tenants/${id}/impersonate`),
  resetAdminPassword: (id: string, data?: { newPassword?: string; sendEmail?: boolean; appUrl?: string; adminEmail?: string }) =>
    api.post(`/platform/tenants/${id}/reset-admin-password`, data || {}),
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const dashboardApi = {
  getKpis: () => api.get('/dashboard/kpis'),
  getConversion: () => api.get('/dashboard/conversion'),
};

// ─── Notifications & Email Log ───────────────────────────────────────────────
export const notificationsApi = {
  list: (params?: Record<string, any>) => api.get('/notifications', { params }),
  syncGoDaddy: () => api.post('/notifications/sync-godaddy'),
  postInboundReply: (data: any) => api.post('/notifications/inbound-email', data),
};

// ─── Leads ───────────────────────────────────────────────────────────────────
export const leadsApi = {
  list: (params?: Record<string, any>) => api.get('/leads', { params }),
  get: (id: string) => api.get(`/leads/${id}`),
  create: (data: any) => api.post('/leads', data),
  updateStatus: (id: string, data: any) => api.patch(`/leads/${id}/status`, data),
  addActivity: (id: string, data: any) => api.post(`/leads/${id}/activities`, data),
  shareLead: (id: string, targetUserId: string) => api.post(`/leads/${id}/share`, { targetUserId }),
  previewSpreadsheet: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/leads/import-preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  previewJson: (records: any[]) => api.post('/leads/import-preview-json', { records }),
  commitImport: (records: any[]) => api.post('/leads/import-commit', { records }),
};

// ─── Orders ──────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, any>) => api.get('/orders', { params }),
  get: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  update: (id: string, data: any) => api.patch(`/orders/${id}`, data),
  updateStatus: (id: string, data: any) => api.patch(`/orders/${id}/status`, data),
  listShipments: (params?: Record<string, any>) => api.get('/orders/shipments/list', { params }),
  createShipment: (data: any) => api.post('/orders/shipments', data),
  updateShipmentStatus: (id: string, status: string) =>
    api.patch(`/orders/shipments/${id}/status`, { status }),
  recordPayment: (id: string, data: any) => api.post(`/orders/${id}/payments`, data),
};

// ─── Quotations ───────────────────────────────────────────────────────────────
export const quotationsApi = {
  list: (params?: Record<string, any>) => api.get('/quotations', { params }),
  get: (id: string) => api.get(`/quotations/${id}`),
  create: (data: any) => api.post('/quotations', data),
  update: (id: string, data: any) => api.patch(`/quotations/${id}`, data),
  updateStatus: (id: string, status: string) => api.patch(`/quotations/${id}/status`, { status }),
  convertToOrder: (id: string) => api.post(`/quotations/${id}/convert-to-order`),
};

// ─── Inventory ───────────────────────────────────────────────────────────────
export const inventoryApi = {
  getStock: (params?: Record<string, any>) => api.get('/inventory/stock', { params }),
  recordMovement: (data: any) => api.post('/inventory/movements', data),
  getReorderAlerts: () => api.get('/inventory/reorder-alerts'),
  getWarehouses: () => api.get('/inventory/warehouses'),
  createWarehouse: (data: any) => api.post('/inventory/warehouses', data),
  getSkus: (search?: string) => api.get('/inventory/skus', { params: { search } }),
  getSku: (id: string) => api.get(`/inventory/skus/${id}`),
  createSku: (data: any) => api.post('/inventory/skus', data),
  updateSku: (id: string, data: any) => api.patch(`/inventory/skus/${id}`, data),
  deleteSku: (id: string) => api.delete(`/inventory/skus/${id}`),
  bulkDeleteSkus: (ids: string[]) => api.post('/inventory/skus/bulk-delete', { ids }),
  importCsv: (file: File, warehouseCode?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/import-csv', fd, {
      params: { warehouseCode },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importSpreadsheetFile: (file: File, warehouseCode?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/import-csv', fd, {
      params: { warehouseCode },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importJson: (records: any[], warehouseCode?: string) =>
    api.post('/inventory/import-json', { records, warehouseCode }),
  importSpreadsheetJson: (records: any[], warehouseCode?: string) =>
    api.post('/inventory/import-json', { records, warehouseCode }),
  getTransfers: (params?: Record<string, any>) => api.get('/inventory/transfers', { params }),
  getTransfersSummary: () => api.get('/inventory/transfers/summary'),
  initiateTransfer: (data: any) => api.post('/inventory/transfers', data),
  receiveTransfer: (id: string) => api.patch(`/inventory/transfers/${id}/receive`),
  cancelTransfer: (id: string) => api.patch(`/inventory/transfers/${id}/cancel`),
  getProjectStock: (params?: Record<string, any>) => api.get('/inventory/project-stock', { params }),
  getProjectStockSummary: () => api.get('/inventory/project-stock/summary'),
  createProjectStock: (data: any) => api.post('/inventory/project-stock', data),
  createProjectStockPosition: (data: any) => api.post('/inventory/project-stock', data),
  updateProjectStock: (id: string, data: any) => api.patch(`/inventory/project-stock/${id}`, data),
  updateProjectStockPosition: (id: string, data: any) => api.patch(`/inventory/project-stock/${id}`, data),
  deleteProjectStock: (id: string) => api.delete(`/inventory/project-stock/${id}`),
  deleteProjectStockPosition: (id: string) => api.delete(`/inventory/project-stock/${id}`),
  recordProjectStockPurchase: (id: string, data: any) =>
    api.post(`/inventory/project-stock/${id}/purchase`, data),
  bulkImportProjectStock: (rows: any[]) => api.post('/inventory/project-stock/bulk', { rows }),
  clearAll: () => api.delete('/inventory/clear-all'),
  getProducts: () => api.get('/inventory/products'),
  seedProducts: () => api.post('/inventory/seed-products'),
  getDashboard: () => api.get('/inventory/dashboard'),
  uploadPurchaseDocument: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/inventory/purchase-documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getSupplierPurchases: (supplierId: string) => api.get(`/inventory/suppliers/${supplierId}/purchases`),
  recordSupplierPurchase: (supplierId: string, data: any) => api.post(`/inventory/suppliers/${supplierId}/purchase`, data),
  getPurchaseBills: (params?: Record<string, any>) => api.get('/inventory/purchase-bills', { params }),
  getPurchaseBill: (id: string) => api.get(`/inventory/purchase-bills/${id}`),
  createPurchaseBill: (data: any) => api.post('/inventory/purchase-bills', data),
  deletePurchaseBill: (id: string) => api.delete(`/inventory/purchase-bills/${id}`),
  scanBillOcr: (data: any) => api.post('/inventory/purchase-bills/scan-ocr', data),
  bulkEditComponents: (data: {
    items?: Array<{ id: string; skuId?: string; updates: Record<string, any> }>;
    ids?: string[];
    skuIds?: string[];
    updates?: Record<string, any>;
  }) => api.post('/inventory/bulk-edit', data),
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersApi = {
  list: (params?: Record<string, any>) => api.get('/suppliers', { params }),
  get: (id: string) => api.get(`/suppliers/${id}`),
  create: (data: any) => api.post('/suppliers', data),
  update: (id: string, data: any) => api.patch(`/suppliers/${id}`, data),
  delete: (id: string) => api.delete(`/suppliers/${id}`),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoicesApi = {
  list: (params?: Record<string, any>) => api.get('/invoices', { params }),
  get: (id: string) => api.get(`/invoices/${id}`),
  getNextNumber: (docType?: string, prefix?: string) =>
    api.get('/invoices/generate-number', { params: { docType, prefix } }),
  createDirect: (data: any) => api.post('/invoices/create-direct', data),
  update: (id: string, data: any) => api.patch(`/invoices/${id}`, data),
  generateFromOrder: (orderId: string, data?: any) =>
    api.post(`/invoices/order/${orderId}/generate`, data),
  voidInvoice: (id: string, reason: string) => api.patch(`/invoices/${id}/void`, { reason }),
  recordPayment: (id: string, data: any) => api.post(`/invoices/${id}/payments`, data),
  emailInvoice: (id: string, data?: { recipientEmail?: string; customNote?: string; templateType?: string }) =>
    api.post(`/invoices/${id}/email`, data || {}),
  downloadPdf: (id: string, templateType?: string) =>
    api.get(`/invoices/${id}/pdf`, {
      params: { templateType },
      responseType: 'blob',
    }),
  getCompanyProfile: () => api.get('/invoices/company-profile'),
  getSignatorySettings: () => api.get('/invoices/settings/signatory'),
  updateSignatorySettings: (data: {
    signatoryName?: string;
    signatoryDesignation?: string;
    signatureImage?: string | null;
    stampImage?: string | null;
  }) => api.post('/invoices/settings/signatory', data),
};

// ─── Company Branding & Settings ───────────────────────────────────────────────
export const brandingApi = {
  get: () => api.get('/settings/branding'),
  update: (data: {
    companyDisplayName?: string;
    companyPhone?: string;
    companyLogoUrl?: string | null;
  }) => api.post('/settings/branding', data),
  getProfile: () => api.get('/settings/company-profile'),
  updateProfile: (data: any) => api.post('/settings/company-profile', data),
};

export const mailAccountsApi = {
  list: () => api.get('/settings/mail-accounts'),
  create: (data: any) => api.post('/settings/mail-accounts', data),
  update: (id: string, data: any) => api.put(`/settings/mail-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/settings/mail-accounts/${id}`),
};

// ─── Companies / Accounts ─────────────────────────────────────────────────────
export const companiesApi = {
  list: (params?: Record<string, any>) => api.get('/companies', { params }),
  get: (id: string) => api.get(`/companies/${id}`),
  create: (data: any) => api.post('/companies', data),
  update: (id: string, data: any) => api.patch(`/companies/${id}`, data),
  delete: (id: string) => api.delete(`/companies/${id}`),
};

// ─── Users & Team Management ──────────────────────────────────────────────────
export const usersApi = {
  list: (params?: Record<string, any>) => api.get('/users', { params }),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  resetCredentials: (id: string) => api.post(`/users/${id}/reset-credentials`),
  forceResetAllPasswords: () => api.post('/users/force-reset-all'),
  toggleActive: (id: string, isActive: boolean) =>
    api.patch(`/users/${id}/toggle-active`, { isActive }),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// ─── Audit ───────────────────────────────────────────────────────────────────
export const auditApi = {
  getLogs: (params?: Record<string, any>) => api.get('/audit-logs', { params }),
};

// ─── Automation Rules ─────────────────────────────────────────────────────────
export const automationApi = {
  getRules: (params?: Record<string, any>) => api.get('/automation/rules', { params }),
  getMetrics: () => api.get('/automation/metrics'),
  getRule: (id: string) => api.get(`/automation/rules/${id}`),
  createRule: (data: any) => api.post('/automation/rules', data),
  updateRule: (id: string, data: any) => api.patch(`/automation/rules/${id}`, data),
  toggleRule: (id: string, isActive?: boolean) =>
    api.patch(`/automation/rules/${id}/toggle`, { isActive }),
  deleteRule: (id: string) => api.delete(`/automation/rules/${id}`),
  runNightlyReorderCheck: () => api.post('/automation/run-nightly-reorder'),
};

// ─── Custom Objects (Object Manager Metadata) ─────────────────────────────────
export const customObjectsApi = {
  getAll: () => api.get('/custom-objects'),
  get: (id: string) => api.get(`/custom-objects/${id}`),
  create: (data: { apiName: string; label: string; pluralLabel?: string; description?: string }) =>
    api.post('/custom-objects', data),
  update: (id: string, data: { label?: string; pluralLabel?: string; description?: string }) =>
    api.patch(`/custom-objects/${id}`, data),
  delete: (id: string) => api.delete(`/custom-objects/${id}`),

  // Field designer endpoints
  getFields: (objectId: string, includeDeleted = false) =>
    api.get(`/custom-objects/${objectId}/fields`, { params: { includeDeleted } }),
  createField: (objectId: string, data: any) =>
    api.post(`/custom-objects/${objectId}/fields`, data),
  updateField: (objectId: string, fieldId: string, data: any) =>
    api.patch(`/custom-objects/${objectId}/fields/${fieldId}`, data),
  softDeleteField: (objectId: string, fieldId: string) =>
    api.delete(`/custom-objects/${objectId}/fields/${fieldId}`),
  restoreField: (objectId: string, fieldId: string) =>
    api.patch(`/custom-objects/${objectId}/fields/${fieldId}/restore`),

  // Generic Record CRUD endpoints (Phase 2)
  getRecords: (objectApiName: string, params?: Record<string, any>) =>
    api.get(`/custom-objects/${objectApiName}/records`, { params }),
  getRecord: (objectApiName: string, recordId: string) =>
    api.get(`/custom-objects/${objectApiName}/records/${recordId}`),
  createRecord: (objectApiName: string, data: Record<string, any>) =>
    api.post(`/custom-objects/${objectApiName}/records`, data),
  updateRecord: (objectApiName: string, recordId: string, data: Record<string, any>) =>
    api.patch(`/custom-objects/${objectApiName}/records/${recordId}`, data),
  deleteRecord: (objectApiName: string, recordId: string) =>
    api.delete(`/custom-objects/${objectApiName}/records/${recordId}`),
  getLookupOptions: (targetObject: string, search?: string) =>
    api.get(`/custom-objects/lookups/${targetObject}`, { params: { search } }),
};

// ─── Daily Activities ─────────────────────────────────────────────────────────
export const activitiesApi = {
  listProjects: () => api.get('/activities/projects'),
  createProject: (data: { name: string; description?: string; status?: string }) =>
    api.post('/activities/projects', data),
  updateProject: (id: string, data: { name?: string; description?: string; status?: string }) =>
    api.put(`/activities/projects/${id}`, data),
  deleteProject: (id: string) => api.delete(`/activities/projects/${id}`),

  getAssignableUsers: () => api.get('/activities/assignable-users'),
  assignMembers: (projectId: string, memberIds: string[]) =>
    api.post(`/activities/projects/${projectId}/assign`, { memberIds }),

  listLogs: (projectId: string) => api.get(`/activities/projects/${projectId}/logs`),
  uploadLog: (projectId: string, formData: FormData) =>
    api.post(`/activities/projects/${projectId}/logs/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteLog: (projectId: string, logId: string) =>
    api.delete(`/activities/projects/${projectId}/logs/${logId}`),
};



