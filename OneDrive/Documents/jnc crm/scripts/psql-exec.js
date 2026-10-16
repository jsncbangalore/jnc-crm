const fs = require('fs');
const path = require('path');
const { Client } = require('C:/Users/JNC R&D/.gemini/antigravity/brain/35af9003-1b6b-4a84-aff8-4a7e38775824/scratch/pg-runner/node_modules/pg');

async function main() {
  const args = process.argv.slice(2);
  let file = null;
  let database = 'postgres';
  let host = '127.0.0.1';
  let port = 5432;
  let user = 'postgres';
  let command = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-f' && args[i + 1]) file = args[++i];
    else if (args[i] === '-d' && args[i + 1]) database = args[++i];
    else if (args[i] === '-c' && args[i + 1]) command = args[++i];
    else if (args[i] === '-h' && args[i + 1]) host = args[++i];
    else if (args[i] === '-p' && args[i + 1]) port = parseInt(args[++i], 10);
    else if (args[i] === '-U' && args[i + 1]) user = args[++i];
    else if (!args[i].startsWith('-') && !file && !command) database = args[i];
  }

  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(`[psql] REFUSED: Non-local host "${host}" is strictly forbidden.`);
    process.exit(1);
  }

  const client = new Client({
    host,
    port,
    database,
    user,
    password: 'postgres',
  });

  client.on('notice', (msg) => {
    console.log(`NOTICE: ${msg.message}`);
  });

  await client.connect();

  try {
    let sql = command;
    if (file) {
      const fullPath = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
      sql = fs.readFileSync(fullPath, 'utf8');
      console.log(`[psql] Executing file: ${file} on database: ${database} @ ${host}:${port}`);
    }

    if (!sql) {
      console.error('[psql] No SQL file (-f) or command (-c) specified.');
      process.exit(1);
    }

    const start = Date.now();
    const result = await client.query(sql);
    const duration = Date.now() - start;

    if (Array.isArray(result)) {
      result.forEach((r) => {
        if (r.command) console.log(r.command + (r.rowCount !== null ? ` ${r.rowCount}` : ''));
      });
    } else if (result && result.command) {
      console.log(result.command + (result.rowCount !== null ? ` ${result.rowCount}` : ''));
    }

    console.log(`[psql] Execution completed successfully in ${duration}ms.`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    if (err.detail) console.error(`DETAIL: ${err.detail}`);
    if (err.where) console.error(`WHERE: ${err.where}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[psql FATAL]:', err.message);
  process.exit(1);
});
