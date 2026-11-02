const fs = require('fs');
let Client;
try {
  Client = require('./apps/api/node_modules/pg').Client;
} catch {
  Client = require('pg').Client;
}

function getPgSslConfig(urlStr) {
  let sslmode = 'require';
  try {
    const parsed = new URL(urlStr);
    const mode = parsed.searchParams.get('sslmode');
    if (mode) sslmode = mode.toLowerCase();
  } catch {}

  if (sslmode === 'disable') {
    return false;
  }

  const sslConfig = {
    rejectUnauthorized: true,
  };

  const caPath = process.env.PG_CA_FILE || process.env.NODE_EXTRA_CA_CERTS;
  if (caPath && fs.existsSync(caPath)) {
    sslConfig.ca = fs.readFileSync(caPath, 'utf8');
  }

  return sslConfig;
}

async function testDirect() {
  const pass = process.env.PGPASSWORD || '';
  const projectRef = process.env.PROJECT_REF || 'local';

  const testConfigs = [
    {
      name: 'Direct Port 5432 - db host',
      connectionString: `postgresql://postgres:${encodeURIComponent(pass)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    },
  ];

  for (const cfg of testConfigs) {
    console.log(`\nTesting: ${cfg.name}...`);
    const ssl = getPgSslConfig(cfg.connectionString);
    const client = new Client({
      connectionString: cfg.connectionString,
      ssl,
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      const res = await client.query('SELECT current_database(), current_user, version()');
      console.log('[SUCCESS] SUCCESS! Connected to Supabase!');
      console.log('Details:', res.rows[0]);
      await client.end();
      return cfg;
    } catch (err) {
      console.log('[ERROR] FAILED:', err.message);
      try { await client.end(); } catch {}
    }
  }
}

testDirect();
