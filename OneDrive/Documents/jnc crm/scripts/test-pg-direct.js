const { Client } = require('./apps/api/node_modules/pg');

async function testDirect() {
  const pass = 'Jnc2026crmlive';
  const projectRef = 'aybysdzuwwtqhnzhgiwp';

  const testConfigs = [
    {
      name: 'Direct Port 5432 - db.aybysdzuwwtqhnzhgiwp.supabase.co',
      connectionString: `postgresql://postgres:${encodeURIComponent(pass)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    },
    {
      name: 'Pooler Port 6543 - db.aybysdzuwwtqhnzhgiwp.supabase.co',
      connectionString: `postgresql://postgres:${encodeURIComponent(pass)}@db.${projectRef}.supabase.co:6543/postgres?pgbouncer=true&sslmode=require`,
    },
    {
      name: 'Pooler Port 6543 - aws-0-ap-south-1.pooler.supabase.com',
      connectionString: `postgresql://postgres.${projectRef}:${encodeURIComponent(pass)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`,
    },
    {
      name: 'Pooler Port 5432 - aws-0-ap-south-1.pooler.supabase.com',
      connectionString: `postgresql://postgres.${projectRef}:${encodeURIComponent(pass)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    },
  ];

  for (const cfg of testConfigs) {
    console.log(`\nTesting: ${cfg.name}...`);
    const client = new Client({
      connectionString: cfg.connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      const res = await client.query('SELECT current_database(), current_user, version()');
      console.log('🎉 SUCCESS! Connected to Supabase!');
      console.log('Details:', res.rows[0]);
      await client.end();
      return cfg;
    } catch (err) {
      console.log('❌ FAILED:', err.message);
      try { await client.end(); } catch {}
    }
  }
}

testDirect();
