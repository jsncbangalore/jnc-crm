/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

function extractSupabaseProjectRef(urlStr) {
  if (!urlStr) return null;
  try {
    const parsed = new URL(urlStr);
    const user = decodeURIComponent(parsed.username || '');
    if (user.includes('.')) {
      return user.split('.').slice(1).join('.').toLowerCase();
    }
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.supabase.co')) {
      const parts = host.split('.');
      if (parts.length >= 3 && parts[0] === 'db') {
        return parts[1].toLowerCase();
      }
    }
  } catch (_) {
    const matchUser = urlStr.match(/:\/\/([^:/@]+)(?::[^@]*)?@/);
    if (matchUser && matchUser[1].includes('.')) {
      return matchUser[1].split('.').slice(1).join('.').toLowerCase();
    }
    const matchDirectHost = urlStr.match(/@db\.([a-z0-9_-]+)\.supabase\.co/i);
    if (matchDirectHost) {
      return matchDirectHost[1].toLowerCase();
    }
  }
  return null;
}

function assertNotProductionDb(contextName = 'Script/Test') {
  const dbUrl = (process.env.DATABASE_URL || '').trim().replace(/^['\"]|['\"]$/g, '');
  if (!dbUrl) return;

  try {
    const parsed = new URL(dbUrl);
    const hostname = parsed.hostname.toLowerCase();
    const isLocal = LOCAL_HOSTS.includes(hostname);

    const blockedRefs = (process.env.BLOCKED_DB_PROJECT_REFS || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    const allowedRefs = (process.env.ALLOWED_DB_PROJECT_REFS || '')
      .split(',')
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);

    const allowedHosts = (process.env.ALLOWED_DB_HOSTS || '')
      .split(',')
      .map(h => h.trim().toLowerCase())
      .filter(Boolean);

    const projectRef = extractSupabaseProjectRef(dbUrl);
    const isSupabase = hostname.endsWith('supabase.com') || hostname.endsWith('supabase.co');

    if (projectRef) {
      if (blockedRefs.includes(projectRef)) {
        throw new Error(`[SECURITY ERROR] ${contextName} refused: project reference "${projectRef}" is in BLOCKED_DB_PROJECT_REFS.`);
      }
      if (!allowedRefs.includes(projectRef)) {
        throw new Error(`[SECURITY ERROR] ${contextName} refused: project reference "${projectRef}" is not in ALLOWED_DB_PROJECT_REFS.`);
      }
      return;
    }

    if (isSupabase) {
      throw new Error(`[SECURITY ERROR] ${contextName} refused: Supabase connection requires project reference in user name (postgres.<project-ref>), but none was found.`);
    }

    if (!isLocal && !allowedHosts.includes(hostname)) {
      throw new Error(`[SECURITY ERROR] ${contextName} refused: host "${hostname}" is neither local nor in ALLOWED_DB_HOSTS, and no project reference was provided.`);
    }
  } catch (err) {
    if (err.message && err.message.includes('[SECURITY ERROR]')) throw err;
    const errorMsg = `\n[SECURITY ERROR] ${contextName} has invalid DATABASE_URL: ${err.message}\n`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

module.exports = { assertNotProductionDb, extractSupabaseProjectRef, LOCAL_HOSTS };
