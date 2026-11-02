/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';
import * as net from 'net';
import * as tls from 'tls';
import * as dns from 'dns';

// Strict Read-Only Mail Account & TLS Handshake Inspector
// NEVER reads or prints passwords, tokens, or private secrets.
// Supports READONLY_DATABASE_URL for safe production diagnostic runs.

interface PortInspection {
  port: number;
  dnsOk: boolean;
  dnsDetails: string;
  tcpOk: boolean;
  tcpDetails: string;
  tlsOk: boolean;
  tlsDetails: string;
  certOk: boolean;
  certDetails: string;
}

function probeSmtpPort(host: string, port: number, timeoutMs = 8000): Promise<PortInspection> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (res: PortInspection) => {
      if (!resolved) {
        resolved = true;
        resolve(res);
      }
    };

    const overallTimer = setTimeout(() => {
      finish({
        port,
        dnsOk: true,
        dnsDetails: 'Resolved',
        tcpOk: false,
        tcpDetails: 'port blocked or no route (probe timeout after 8000ms)',
        tlsOk: false,
        tlsDetails: 'skipped',
        certOk: false,
        certDetails: 'skipped',
      });
    }, timeoutMs);

    dns.lookup(host, (dnsErr, ip) => {
      if (dnsErr || !ip) {
        clearTimeout(overallTimer);
        return finish({
          port,
          dnsOk: false,
          dnsDetails: `DNS resolution failed: ${dnsErr?.message || 'unknown'}`,
          tcpOk: false,
          tcpDetails: 'skipped',
          tlsOk: false,
          tlsDetails: 'skipped',
          certOk: false,
          certDetails: 'skipped',
        });
      }

      const dnsDetails = `ok (${ip})`;

      if (port === 465) {
        // Direct SSL / Implicit TLS
        const socket = tls.connect(
          {
            host: ip,
            port,
            servername: host,
            rejectUnauthorized: true,
            timeout: 5000,
          },
          () => {
            clearTimeout(overallTimer);
            const cert = socket.getPeerCertificate();
            const protocol = socket.getProtocol() || 'unknown';
            const cipher = socket.getCipher()?.name || 'unknown';
            socket.destroy();
            finish({
              port,
              dnsOk: true,
              dnsDetails,
              tcpOk: true,
              tcpDetails: 'ok',
              tlsOk: true,
              tlsDetails: `ok (${protocol} / ${cipher})`,
              certOk: Boolean(cert?.subject),
              certDetails: cert?.subject
                ? `ok (CN: ${cert.subject.CN || 'Unknown'}, Issuer: ${cert.issuer?.O || cert.issuer?.CN || 'Unknown'}, Valid To: ${cert.valid_to || 'Unknown'})`
                : 'Certificate missing',
            });
          },
        );

        socket.on('timeout', () => {
          clearTimeout(overallTimer);
          socket.destroy();
          finish({
            port,
            dnsOk: true,
            dnsDetails,
            tcpOk: false,
            tcpDetails: 'port blocked or no route (connect timeout)',
            tlsOk: false,
            tlsDetails: 'skipped',
            certOk: false,
            certDetails: 'skipped',
          });
        });

        socket.on('error', (err: any) => {
          clearTimeout(overallTimer);
          socket.destroy();
          const isNetworkError =
            err.code === 'ECONNREFUSED' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'EHOSTUNREACH' ||
            err.code === 'ENETUNREACH';

          if (isNetworkError) {
            finish({
              port,
              dnsOk: true,
              dnsDetails,
              tcpOk: false,
              tcpDetails: `port blocked or no route (${err.code})`,
              tlsOk: false,
              tlsDetails: 'skipped',
              certOk: false,
              certDetails: 'skipped',
            });
          } else {
            finish({
              port,
              dnsOk: true,
              dnsDetails,
              tcpOk: true,
              tcpDetails: 'ok',
              tlsOk: false,
              tlsDetails: `TLS failed: ${err.message}`,
              certOk: false,
              certDetails: `untrusted or invalid (${err.message})`,
            });
          }
        });
      } else {
        // Port 587 or 2525: STARTTLS probe
        const plainSocket = net.connect({ host: ip, port });
        plainSocket.setTimeout(5000);

        plainSocket.on('timeout', () => {
          clearTimeout(overallTimer);
          plainSocket.destroy();
          finish({
            port,
            dnsOk: true,
            dnsDetails,
            tcpOk: false,
            tcpDetails: 'port blocked or no route (connect timeout)',
            tlsOk: false,
            tlsDetails: 'skipped',
            certOk: false,
            certDetails: 'skipped',
          });
        });

        plainSocket.on('error', (err: any) => {
          clearTimeout(overallTimer);
          plainSocket.destroy();
          const isNetworkError =
            err.code === 'ECONNREFUSED' ||
            err.code === 'ETIMEDOUT' ||
            err.code === 'EHOSTUNREACH' ||
            err.code === 'ENETUNREACH';
          finish({
            port,
            dnsOk: true,
            dnsDetails,
            tcpOk: false,
            tcpDetails: isNetworkError
              ? `port blocked or no route (${err.code})`
              : `port blocked or no route (${err.message})`,
            tlsOk: false,
            tlsDetails: 'skipped',
            certOk: false,
            certDetails: 'skipped',
          });
        });

        plainSocket.on('connect', () => {
          let buffer = '';
          let state: 'WAIT_BANNER' | 'WAIT_EHLO' | 'WAIT_STARTTLS_REPLY' = 'WAIT_BANNER';

          const onData = (data: Buffer) => {
            buffer += data.toString('utf8');

            if (state === 'WAIT_BANNER') {
              if (buffer.startsWith('220') && buffer.includes('\r\n')) {
                buffer = '';
                state = 'WAIT_EHLO';
                plainSocket.write('EHLO crm.local\r\n');
              }
            } else if (state === 'WAIT_EHLO') {
              if (buffer.includes('\r\n')) {
                const lines = buffer.split('\r\n').filter(Boolean);
                const lastLine = lines[lines.length - 1];
                if (lastLine && lastLine.startsWith('250 ')) {
                  if (buffer.includes('STARTTLS')) {
                    buffer = '';
                    state = 'WAIT_STARTTLS_REPLY';
                    plainSocket.write('STARTTLS\r\n');
                  } else {
                    clearTimeout(overallTimer);
                    plainSocket.destroy();
                    finish({
                      port,
                      dnsOk: true,
                      dnsDetails,
                      tcpOk: true,
                      tcpDetails: 'ok',
                      tlsOk: false,
                      tlsDetails: 'TLS failed: Server does not advertise STARTTLS capability',
                      certOk: false,
                      certDetails: 'skipped',
                    });
                  }
                }
              }
            } else if (state === 'WAIT_STARTTLS_REPLY') {
              if (buffer.includes('\r\n')) {
                plainSocket.removeListener('data', onData);
                if (buffer.startsWith('220')) {
                  const secureSocket = tls.connect(
                    {
                      socket: plainSocket,
                      servername: host,
                      rejectUnauthorized: true,
                    },
                    () => {
                      clearTimeout(overallTimer);
                      const cert = secureSocket.getPeerCertificate();
                      const protocol = secureSocket.getProtocol() || 'unknown';
                      const cipher = secureSocket.getCipher()?.name || 'unknown';
                      secureSocket.destroy();
                      finish({
                        port,
                        dnsOk: true,
                        dnsDetails,
                        tcpOk: true,
                        tcpDetails: 'ok',
                        tlsOk: true,
                        tlsDetails: `ok (${protocol} / ${cipher})`,
                        certOk: Boolean(cert?.subject),
                        certDetails: cert?.subject
                          ? `ok (CN: ${cert.subject.CN || 'Unknown'}, Issuer: ${cert.issuer?.O || cert.issuer?.CN || 'Unknown'}, Valid To: ${cert.valid_to || 'Unknown'})`
                          : 'Certificate missing',
                      });
                    },
                  );

                  secureSocket.on('error', (tlsErr: any) => {
                    clearTimeout(overallTimer);
                    secureSocket.destroy();
                    finish({
                      port,
                      dnsOk: true,
                      dnsDetails,
                      tcpOk: true,
                      tcpDetails: 'ok',
                      tlsOk: false,
                      tlsDetails: `TLS failed: ${tlsErr.message}`,
                      certOk: false,
                      certDetails: `untrusted or invalid (${tlsErr.message})`,
                    });
                  });
                } else {
                  clearTimeout(overallTimer);
                  plainSocket.destroy();
                  finish({
                    port,
                    dnsOk: true,
                    dnsDetails,
                    tcpOk: true,
                    tcpDetails: 'ok',
                    tlsOk: false,
                    tlsDetails: `TLS failed: STARTTLS command rejected (${buffer.trim()})`,
                    certOk: false,
                    certDetails: 'skipped',
                  });
                }
              }
            }
          };

          plainSocket.on('data', onData);
        });
      }
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('       CRM MAIL ACCOUNTS & TLS STATUS PRE-DEPLOY INSPECTOR      ');
  console.log('================================================================\n');

  const effectiveDbUrl = process.env.READONLY_DATABASE_URL || process.env.DATABASE_URL;
  if (process.env.READONLY_DATABASE_URL) {
    console.log('[Database Mode] Using READONLY_DATABASE_URL replica connection.');
  } else {
    console.log('[Database Mode] Using default DATABASE_URL connection.');
  }

  const prisma = new PrismaClient(
    effectiveDbUrl ? { datasources: { db: { url: effectiveDbUrl } } } : undefined,
  );

  try {
    let accounts: any[] = [];
    try {
      accounts = await prisma.$queryRawUnsafe<any[]>(`
        SELECT id, "tenantId", name, email, "smtpHost", "smtpPort", "isSecure", purpose, "isActive", "createdAt"
        FROM "MailAccount"
        ORDER BY "createdAt" DESC
      `);
    } catch (e: any) {
      console.log(`Note: Direct query on MailAccount returned: ${e.message}`);
      accounts = [];
    }

    console.log(`Found ${accounts.length} registered MailAccount rows in database.\n`);

    // 1. Always inspect system fallback SMTP on ports 465, 587, and 2525
    const sysHost = process.env.SMTP_HOST || 'smtpout.secureserver.net';
    console.log(`[SYSTEM SMTP CONFIGURATION] Host: ${sysHost}`);
    console.log(`Testing ports 465, 587, and 2525 one by one:`);

    for (const port of [465, 587, 2525]) {
      const probe = await probeSmtpPort(sysHost, port);
      console.log(`\n  * Port ${port}:`);
      console.log(`      DNS:         ${probe.dnsOk ? 'ok' : 'failed'} (${probe.dnsDetails})`);
      console.log(`      TCP connect: ${probe.tcpDetails}`);
      console.log(`      TLS:         ${probe.tlsDetails}`);
      console.log(`      Certificate: ${probe.certDetails}`);
    }
    console.log('\n----------------------------------------------------------------');

    // 2. Inspect tenant accounts if present
    if (accounts.length > 0) {
      console.log(`[TENANT MAIL ACCOUNTS INSPECTION]`);
      for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        const effectiveEncryption = acc.encryption || (acc.isSecure || acc.smtpPort === 465 ? 'ssl' : 'starttls');

        console.log(`\nAccount [${i + 1}/${accounts.length}]: ${acc.name} (${acc.email})`);
        console.log(`  ID:             ${acc.id}`);
        console.log(`  Tenant ID:      ${acc.tenantId}`);
        console.log(`  SMTP Host:      ${acc.smtpHost}`);
        console.log(`  SMTP Port:      ${acc.smtpPort}`);
        console.log(`  Old isSecure:   ${acc.isSecure}`);
        console.log(`  New Encryption: ${effectiveEncryption}`);
        console.log(`  Active:         ${acc.isActive}`);
        console.log(`  Purpose:        ${acc.purpose}`);

        const probe = await probeSmtpPort(acc.smtpHost, acc.smtpPort);
        console.log(`  Port ${acc.smtpPort} Probe:`);
        console.log(`    DNS:          ${probe.dnsOk ? 'ok' : 'failed'} (${probe.dnsDetails})`);
        console.log(`    TCP connect:  ${probe.tcpDetails}`);
        console.log(`    TLS:          ${probe.tlsDetails}`);
        console.log(`    Certificate:  ${probe.certDetails}`);
      }
      console.log('\n----------------------------------------------------------------');
    }

    console.log('\nInspection completed successfully. Zero passwords or secret keys printed.');
  } catch (err: any) {
    console.error(`Inspection error: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
