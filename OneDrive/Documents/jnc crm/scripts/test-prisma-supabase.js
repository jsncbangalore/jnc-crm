const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function testPrismaConnect() {
  const pass = 'Jnc2026crmlive';
  const projectRef = 'aybysdzuwwtqhnzhgiwp';

  const testConfigs = [
    {
      name: 'Direct Port 5432 - db.aybysdzuwwtqhnzhgiwp.supabase.co',
      dbUrl: `postgresql://postgres:${pass}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    },
    {
      name: 'Pooler Port 6543 - db.aybysdzuwwtqhnzhgiwp.supabase.co',
      dbUrl: `postgresql://postgres:${pass}@db.${projectRef}.supabase.co:6543/postgres?pgbouncer=true&sslmode=require`,
    },
    {
      name: 'Pooler Port 6543 - aws-0-ap-south-1.pooler.supabase.com',
      dbUrl: `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require`,
    },
    {
      name: 'Pooler Port 5432 - aws-0-ap-south-1.pooler.supabase.com',
      dbUrl: `postgresql://postgres.${projectRef}:${pass}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    },
  ];

  for (const cfg of testConfigs) {
    console.log(`\nTesting: ${cfg.name}...`);
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: cfg.dbUrl,
        },
      },
    });

    try {
      await prisma.$connect();
      const count = await prisma.user.count();
      console.log('🎉 SUCCESS! Connected to Supabase via Prisma!');
      console.log('User count in Supabase DB:', count);
      await prisma.$disconnect();
      return cfg;
    } catch (err) {
      console.log('❌ FAILED:', err.message);
      try { await prisma.$disconnect(); } catch {}
    }
  }
}

testPrismaConnect();
