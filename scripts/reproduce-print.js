const http = require('http');
const fs = require('fs');
const { chromium, firefox, webkit } = require('playwright');

const htaccess = fs.readFileSync('apps/web/dist/.htaccess', 'utf8');
const cspMatch = htaccess.match(/Content-Security-Policy\s+"([^"]+)"/);
const csp = cspMatch ? cspMatch[1] : '';
console.log('Current Production CSP:\n', csp, '\n');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'DENY'
  });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>Print Test</title></head>
    <body>
      <h1>Print Test Under Real Production Headers</h1>
      <script>
        window.cspViolations = [];
        window.addEventListener('securitypolicyviolation', (e) => {
          window.cspViolations.push({
            blockedURI: e.blockedURI,
            violatedDirective: e.violatedDirective,
            effectiveDirective: e.effectiveDirective
          });
        });
      </script>
    </body>
    </html>
  `);
});

server.listen(5099, async () => {
  console.log('Test server started on http://localhost:5099\n');
  for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:5099');
    const result = await page.evaluate(async () => {
      const blob = new Blob(['%PDF-1.4 dummy pdf'], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.top = '-1000px';
      iframe.src = url;
      document.body.appendChild(iframe);
      await new Promise(r => setTimeout(r, 400));
      return {
        violations: window.cspViolations,
        iframeSrc: iframe.src
      };
    });

    console.log(`[${name}] CSP Violations:`, JSON.stringify(result.violations));
    console.log(`[${name}] Console Errors:`, JSON.stringify(consoleErrors));
    await browser.close();
  }
  server.close();
});
