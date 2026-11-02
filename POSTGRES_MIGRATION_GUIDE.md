# PostgreSQL Migration & Production Concurrency Guide

## Overview

For local single-developer testing, JNC-CRM defaults to SQLite (`dev.db`). However, in production or multi-user testing where multiple sales employees concurrently confirm orders and reserve stock on the same SKU, **PostgreSQL with Row-Level Locking (`SELECT ... FOR UPDATE`)** is strongly recommended to prevent race conditions and overselling.

---

## 1. Switching from SQLite to PostgreSQL (3 Steps)

### Step 1: Update Prisma Datasource Provider
In `apps/api/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### Step 2: Update Connection String in `.env`
In `apps/api/.env`:

```env
# PostgreSQL connection string format:
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/jnc_crm?schema=public"
```

### Step 3: Run Prisma Migrations & Seed
```powershell
cd "apps/api"
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
```

---

## 2. Row-Level Stock Locking in Orders Service

When PostgreSQL is active, `OrdersService.createOrder()` can utilize Prisma interactive transactions with pessimistic row-locking (`SELECT ... FOR UPDATE`) to guarantee atomic stock reservation:

```ts
await this.prisma.$transaction(async (tx) => {
  for (const line of dto.lines) {
    // Pessimistic lock on the StockItem row in PostgreSQL:
    const stockItems = await tx.$queryRaw<StockItem[]>`
      SELECT * FROM "StockItem"
      WHERE "skuId" = ${line.skuId}
      FOR UPDATE
    `;

    const totalAvailable = stockItems.reduce(
      (sum, s) => sum + s.quantityOnHand - s.quantityReserved,
      0
    );

    if (totalAvailable < line.quantity) {
      throw new BadRequestException(
        `Insufficient stock for SKU: available ${totalAvailable}, requested ${line.quantity}`
      );
    }

    // Atomic reservation increment
    await tx.stockItem.update({
      where: { id: stockItems[0].id },
      data: { quantityReserved: { increment: line.quantity } },
    });
  }
});
```

---

## 3. Production Password Hardening & Forced Reset Flow

The API includes `POST /api/v1/auth/change-password`:

```http
POST /api/v1/auth/change-password
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "currentPassword": "<CURRENT_PASSWORD>",
  "newPassword": "<NEW_STRONG_PASSWORD>"
}
```

### Best Practice Before Go-Live:
1. Log in with each seeded user (`JNC-SA-001`, `JNC-ADM-001`, `JNC-EMP-001`, `JNC-EMP-002`).
2. Call `/auth/change-password` to assign distinct, encrypted production credentials.
3. Rotate `JWT_SECRET` and `JWT_REFRESH_SECRET` in `apps/api/.env`.
