const fs = require('fs');

// =========================================================================
// 1. PATCH settings.controller.ts
// =========================================================================
const ctrlPath = 'apps/api/src/settings/settings.controller.ts';
let ctrl = fs.readFileSync(ctrlPath, 'utf8');

const oldPortalLogoGet = ctrl.substring(
  ctrl.indexOf("@Get('branding/portal-logo')"),
  ctrl.indexOf("@Post('branding/portal-logo')")
);

const newPortalLogoGet = `@Get('branding/portal-logo')
  @UseGuards(AuthGuard('jwt'))
  async getPortalLogoDefault(@CurrentUser() user: ScopedUser, @Req() req: any, @Res() res: Response) {
    let tenantKey = req.query?.tenantKey || req.query?.tenantId || user?.tenantId;
    return this.settingsService.servePortalLogo(tenantKey, user, res);
  }

  @Get('branding/portal-logo/:tenantKey')
  @UseGuards(AuthGuard('jwt'))
  async getPortalLogo(
    @Param('tenantKey') tenantKey: string,
    @CurrentUser() user: ScopedUser,
    @Res() res: Response,
  ) {
    return this.settingsService.servePortalLogo(tenantKey, user, res);
  }

  /**
   * `;

ctrl = ctrl.replace(oldPortalLogoGet, newPortalLogoGet);
fs.writeFileSync(ctrlPath, ctrl, 'utf8');
console.log('Patched settings.controller.ts');

// =========================================================================
// 2. PATCH settings.service.ts
// =========================================================================
const srvPath = 'apps/api/src/settings/settings.service.ts';
let srv = fs.readFileSync(srvPath, 'utf8');

// Add import
if (!srv.includes("import { isPlatformOwner } from '../auth/roles';")) {
  srv = srv.replace(
    "import { ScopedUser } from '../auth/scoping.service';",
    "import { ScopedUser } from '../auth/scoping.service';\r\nimport { isPlatformOwner } from '../auth/roles';"
  );
}

// Replace apps/web/public/uploads/branding with uploads/branding
srv = srv.replaceAll("'apps/web/public/uploads/branding'", "'uploads/branding'");

// Remove __IS_TEST__
srv = srv.replace(
  "if (process.env.NODE_ENV === 'test' || Boolean((global as any).__IS_TEST__) || buffer.length < 150) {",
  "if (process.env.NODE_ENV === 'test' || buffer.length < 150) {"
);

// Update uploadLogo sharp handling
const oldUploadLogoSharp = `    // Convert every uploaded logo (PNG, JPEG, WebP) to standardized PNG
    let processedBuffer = file.buffer;
    let processedMime = 'image/png';
    try {
      processedBuffer = await sharp(file.buffer).png().toBuffer();
    } catch (e: any) {
      this.logger.warn(\`Could not convert image to PNG via sharp: \${e.message}\`);
      processedBuffer = file.buffer;
      processedMime = mime;
    }`;

const newUploadLogoSharp = `    // Convert every uploaded logo (PNG, JPEG, WebP) to standardized PNG, max 600x200
    let processedBuffer = file.buffer;
    let processedMime = 'image/png';
    try {
      processedBuffer = await sharp(file.buffer, { limitInputPixels: 268402689 })
        .resize({ width: 600, height: 200, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (e: any) {
      this.logger.warn(\`Could not convert image to PNG via sharp: \${e.message}\`);
      processedBuffer = file.buffer;
      processedMime = mime;
    }`;

srv = srv.replace(oldUploadLogoSharp, newUploadLogoSharp);

// Update uploadPortalLogo sharp handling
const oldPortalLogoSharp = `    // Convert every uploaded portal logo to standardized PNG
    let processedBuffer = file.buffer;
    let processedMime = 'image/png';
    try {
      processedBuffer = await sharp(file.buffer).png().toBuffer();
    } catch (e: any) {
      this.logger.warn(\`Could not convert portal logo to PNG via sharp: \${e.message}\`);
      processedBuffer = file.buffer;
      processedMime = mime;
    }`;

const newPortalLogoSharp = `    // Convert every uploaded portal logo to standardized PNG, max 600x200
    let processedBuffer = file.buffer;
    let processedMime = 'image/png';
    try {
      processedBuffer = await sharp(file.buffer, { limitInputPixels: 268402689 })
        .resize({ width: 600, height: 200, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch (e: any) {
      this.logger.warn(\`Could not convert portal logo to PNG via sharp: \${e.message}\`);
      processedBuffer = file.buffer;
      processedMime = mime;
    }`;

srv = srv.replace(oldPortalLogoSharp, newPortalLogoSharp);

// Update servePortalLogo signature and cross-tenant check
const oldServePortalLogo = `  async servePortalLogo(tenantKey: string | undefined, res: any) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!tenantKey) {
      return res.status(404).json({ message: 'No portal logo set or unauthenticated access' });
    }

    let tenant: any = null;
    try {
      tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantKey }, { code: tenantKey }, { slug: tenantKey }],
          deletedAt: null,
        },
        select: { id: true, portalLogoUrl: true },
      });
    } catch {}`;

const newServePortalLogo = `  async servePortalLogo(tenantKey: string | undefined, user: ScopedUser | undefined, res: any) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!tenantKey) {
      return res.status(404).json({ message: 'No portal logo set or unauthenticated access' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    let tenant: any = null;
    try {
      tenant = await this.prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantKey }, { code: tenantKey }, { slug: tenantKey }],
          deletedAt: null,
        },
        select: { id: true, code: true, slug: true, portalLogoUrl: true },
      });
    } catch {}

    if (!tenant) {
      return res.status(404).json({ message: 'Tenant not found' });
    }

    // Cross-tenant access protection
    if (!isPlatformOwner(user) && user.tenantId !== tenant.id) {
      throw new ForbiddenException('Cross-tenant access forbidden');
    }`;

// Since lines might have CRLF, let's normalize or use substring
const idxStart = srv.indexOf("async servePortalLogo(tenantKey: string | undefined, res: any)");
if (idxStart !== -1) {
  const idxCatch = srv.indexOf("} catch {}", idxStart);
  if (idxCatch !== -1) {
    const endOfBlock = idxCatch + "} catch {}".length;
    const oldBlock = srv.substring(idxStart, endOfBlock);
    srv = srv.replace(oldBlock, newServePortalLogo.trim());
  }
}

fs.writeFileSync(srvPath, srv, 'utf8');
console.log('Patched settings.service.ts');

// =========================================================================
// 3. PATCH pdf-generator.ts
// =========================================================================
const pdfGenPath = 'apps/api/src/invoicing/pdf-generator.ts';
let pdfGen = fs.readFileSync(pdfGenPath, 'utf8');
if (!pdfGen.includes("path.resolve(process.cwd(), 'uploads/branding')")) {
  pdfGen = pdfGen.replace(
    "const candidateDirs = [",
    "const candidateDirs = [\r\n          path.resolve(process.cwd(), 'uploads/branding'),\r\n          path.resolve(process.cwd(), '../../uploads/branding'),"
  );
  fs.writeFileSync(pdfGenPath, pdfGen, 'utf8');
  console.log('Patched pdf-generator.ts');
}
