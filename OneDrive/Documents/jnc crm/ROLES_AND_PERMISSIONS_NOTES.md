# SYSTEM ROLES, PERMISSIONS & DATABASE BOUNDARIES

> **PERMANENT SYSTEM POLICY & REMINDER**
> 
> 1. **NEVER modify or elevate user roles in the database without explicit user permission.**
> 2. **NEVER create shadow or unauthorized platform super-admin accounts.**
> 3. **Tenant admins have strict tenant scoping (`tenantId !== null`). They are NOT platform super admins and must NEVER be assigned the platform super-admin role.**
> 4. **`<OWNER_EMAIL>` is the configured Platform Super Admin for the multi-tenant system.**

---

## 1. System Role Hierarchy & Portals

| Role | Scope | Designated Identity | Employee Code | Login URL | Purpose |
|---|---|---|---|---|---|
| **`platform_super_admin`** | Global (`tenantId: null`) | **`<OWNER_EMAIL>`** | `PLATFORM-ADMIN-001` | `/platform/login` | Multi-tenant company management, platform billing, global system health. |
| **`tenant_admin`** | Company Tenant (`tenantId: '<TENANT_UUID>'`) | **`<TENANT_ADMIN_EMAIL>`** | `<TENANT_CODE>-SA-001` | `/login` | Company Owner & Administrator for tenant workspace. Manages company staff, inventory, orders, leads, and automations. |
| **`admin`** | Company Tenant | (Tenant Staff) | (e.g. `<TENANT_CODE>-ADM-001`) | `/login` | Operational company administrator. |
| **`sub_admin`** | Company Tenant | (Department Leads) | (e.g. `<TENANT_CODE>-SUB-001`) | `/login` | Department management. |
| **`employee`** | Company Tenant | (Sales/Field Staff) | (e.g. `<TENANT_CODE>-EMP-001`) | `/login` | Daily operations, lead handling, quotation drafting. |
| **`project_manager` / `store_manager` / `accountant`** | Company Tenant | Specialized Staff | (Scoped to Tenant) | `/login` | Role-specific modules (Inventory, Dispatch, Finance). |

---

## 2. Portal Separation Rules

### A. Platform Administration Portal (`/platform/login` or `http://localhost:5173/platform/login`)
- **Permitted Role**: `role: "platform_super_admin"` (`tenantId: null`) ONLY.
- **Authorized User**: `<OWNER_EMAIL>` (`PLATFORM-ADMIN-001`).
- **Forbidden**: Any tenant user attempting to log in here will receive `Invalid credentials.` by design (enforced in `PlatformAuthController` to prevent account disclosure).

### B. Company / Team Workspace Portal (`/login` or `http://localhost:5173/login`)
- **Permitted Roles**: All company staff (`tenant_admin`, `admin`, `sub_admin`, `employee`, `project_manager`, `store_manager`, etc.).
- **Authorized User**: `<TENANT_ADMIN_EMAIL>` (`<TENANT_CODE>-SA-001`) and company employees.
- **Forbidden**: `platform_super_admin` without a tenant cannot log in here.

### C. Flowchart Automation Lab
- Scoped to authenticated tenant credentials.
- Accessible via configured system environment variables.

---

## 3. Mandatory Agent Rules & Constraints

1. **Explicit Permission Required**:
   - Do NOT run database scripts (`prisma.user.create`, `prisma.user.update`, etc.) that assign roles, create administrative credentials, or promote accounts unless the user explicitly requests it.
2. **Respect Multi-Tenant Boundary**:
   - `tenantId: null` indicates a global platform super-admin.
   - `tenantId != null` indicates a company tenant user.
   - Never cross these boundaries automatically.
3. **Password Management**:
   - If a user encounters login issues, guide them to the correct portal first (`/login` vs `/platform/login`).
   - If a password reset is needed, confirm with the user before applying database modifications.
