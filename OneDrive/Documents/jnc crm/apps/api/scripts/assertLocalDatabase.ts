// assertLocalDatabase.ts
// Utility to enforce that scripts only run against a local/allowed database host.

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

export function assertLocalDatabase(contextName: string = 'Script') {
  const raw = process.env.DATABASE_URL || '';
  const cleaned = raw.trim().replace(/^['\"]|['\"]$/g, '');
  if (!cleaned) {
    throw new Error(`[SECURITY ERROR] ${contextName} has no DATABASE_URL set`);
  }
  try {
    const hostname = new URL(cleaned).hostname;
    const isLocal = LOCAL_HOSTS.includes(hostname);
    const allowProd = process.argv.includes('--allow-production') || process.env.ALLOW_PRODUCTION === 'true';
    if (!isLocal && !allowProd) {
      throw new Error(`[SECURITY ERROR] ${contextName} refused to run on non‑local database host ${hostname}. Pass --allow-production to override.`);
    }
  } catch (e) {
    // URL parsing failed or other error
    throw new Error(`[SECURITY ERROR] ${contextName} has an invalid DATABASE_URL: ${e instanceof Error ? e.message : e}`);
  }
}
