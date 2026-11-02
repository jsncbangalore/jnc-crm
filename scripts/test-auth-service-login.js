const fs = require('fs');
const path = require('path');
const envPath = path.resolve('apps/api/.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const t = l.trim();
    if (t && !t.startsWith('#') && t.includes('=')) {
      const idx = t.indexOf('=');
      process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

// Instantiate Nest application context
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require(path.resolve('apps/api/dist/app.module'));
const { AuthService } = require(path.resolve('apps/api/dist/auth/auth.service'));

async function test() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const authService = app.get(AuthService);

  try {
    const res = await authService.login({
      identifier: 'admin@zzclienttest.com',
      password: 'DevPassword@123'
    });
    console.log('Direct AuthService.login SUCCESS:', Boolean(res.accessToken));
  } catch (err) {
    console.error('Direct AuthService.login FAILED:', err);
  } finally {
    await app.close();
  }
}

test();
