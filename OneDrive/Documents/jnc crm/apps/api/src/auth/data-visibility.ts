/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

export type VisibilityLevel = 'all' | 'team' | 'own' | 'none';

export type ModelName =
  | 'Lead' | 'Company' | 'Contact' | 'Quotation' | 'Order'
  | 'Invoice' | 'Supplier' | 'Inventory' | 'Activity';

export type RoleName =
  | 'platform_super_admin' | 'tenant_admin' | 'admin' | 'sub_admin'
  | 'employee' | 'store_manager' | 'project_manager' | 'developer_lead' | 'developer';

export type CustomerListScope = 'own' | 'company';

export function getCustomerListScope(): CustomerListScope {
  const envVal = process.env.CUSTOMER_LIST_SCOPE?.trim().toLowerCase();
  return envVal === 'company' ? 'company' : 'own';
}

export const VISIBILITY_TABLE_OWN: Record<RoleName, Record<ModelName, VisibilityLevel>> = {
  platform_super_admin: { Lead:'all', Company:'all', Contact:'all', Quotation:'all', Order:'all', Invoice:'all', Supplier:'all', Inventory:'all', Activity:'all' },
  tenant_admin:         { Lead:'all', Company:'all', Contact:'all', Quotation:'all', Order:'all', Invoice:'all', Supplier:'all', Inventory:'all', Activity:'all' },
  admin:                { Lead:'all', Company:'all', Contact:'all', Quotation:'all', Order:'all', Invoice:'all', Supplier:'all', Inventory:'all', Activity:'all' },
  sub_admin:            { Lead:'team', Company:'team', Contact:'team', Quotation:'team', Order:'team', Invoice:'team', Supplier:'all', Inventory:'all', Activity:'team' },
  employee:             { Lead:'own', Company:'own', Contact:'own', Quotation:'own', Order:'own', Invoice:'own', Supplier:'none', Inventory:'all', Activity:'own' },
  store_manager:        { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'all', Inventory:'all', Activity:'own' },
  project_manager:      { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'none', Inventory:'none', Activity:'team' },
  developer_lead:       { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'none', Inventory:'none', Activity:'team' },
  developer:            { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'none', Inventory:'none', Activity:'own' },
};

export const VISIBILITY_TABLE_COMPANY: Record<RoleName, Record<ModelName, VisibilityLevel>> = {
  platform_super_admin: { Lead:'all', Company:'all', Contact:'all', Quotation:'all', Order:'all', Invoice:'all', Supplier:'all', Inventory:'all', Activity:'all' },
  tenant_admin:         { Lead:'all', Company:'all', Contact:'all', Quotation:'all', Order:'all', Invoice:'all', Supplier:'all', Inventory:'all', Activity:'all' },
  admin:                { Lead:'all', Company:'all', Contact:'all', Quotation:'all', Order:'all', Invoice:'all', Supplier:'all', Inventory:'all', Activity:'all' },
  sub_admin:            { Lead:'team', Company:'team', Contact:'team', Quotation:'team', Order:'team', Invoice:'team', Supplier:'all', Inventory:'all', Activity:'team' },
  employee:             { Lead:'own', Company:'all', Contact:'all', Quotation:'own', Order:'own', Invoice:'own', Supplier:'none', Inventory:'all', Activity:'own' },
  store_manager:        { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'all', Inventory:'all', Activity:'own' },
  project_manager:      { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'none', Inventory:'none', Activity:'team' },
  developer_lead:       { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'none', Inventory:'none', Activity:'team' },
  developer:            { Lead:'none', Company:'none', Contact:'none', Quotation:'none', Order:'none', Invoice:'none', Supplier:'none', Inventory:'none', Activity:'own' },
};

export function getVisibilityTable(scopeMode?: CustomerListScope): Record<RoleName, Record<ModelName, VisibilityLevel>> {
  const mode = scopeMode ?? getCustomerListScope();
  return mode === 'company' ? VISIBILITY_TABLE_COMPANY : VISIBILITY_TABLE_OWN;
}

export const VISIBILITY_TABLE: Record<RoleName, Record<ModelName, VisibilityLevel>> = new Proxy(VISIBILITY_TABLE_OWN, {
  get(target, prop: string) {
    const table = getVisibilityTable();
    return (table as any)[prop];
  },
});

export function getVisibility(role: string, model: ModelName, scopeMode?: CustomerListScope): VisibilityLevel {
  const table = getVisibilityTable(scopeMode);
  const row = table[role as RoleName];
  if (!row) return 'none';
  return row[model] ?? 'none';
}
