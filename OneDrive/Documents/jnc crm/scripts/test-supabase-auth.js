const { Client } = require('pg');

async function testSupabaseAuth() {
  const pass = 'Jnc2026crmlive';
  const projectRef = 'aybysdzuwwtqhnzhgiwp';
  
  // Test variations
  const testConfigs = [
    {
      name: 'Direct Port 5432 - user postgres',
      connectionString: `postgresql://postgres:${encodeURIComponent(pass)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    },
    {
      name: 'Direct Port 5432 - user postgres.aybysdzuwwtqhnzhgiwp',
      connectionString: `postgresql://postgres.${projectRef}:${encodeURIComponent(pass)}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    },
    {
      name: 'Pooler Port 6543 - user postgres.aybysdzuwwtqhnzhgiwp',
      connectionString: `postgresql://postgres.${projectRef}:${encodeURIComponent(pass)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require`,
    },
  ];

  for (const cfg of testConfigs) {
    console.log(`\n--- Testing ${cfg.name} ---`);
    const client = new Client({ connectionString: cfg.connectionString });
    try {
      await client.connect();
      const res = await client.query('SELECT current_database(), current_user, version()');
      console.log('SUCCESS! Result:', res.rows[0]);
      await client.end();
      return cfg;
    } catch (err) {
      console.log('FAILED:', err.message);
      try { await client.end(); } catch {}
    }
  }
}

testSupabaseAuth();
