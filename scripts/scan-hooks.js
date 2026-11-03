// Finds React components that call hooks after an early 'return' or inside a condition/loop.
// That is what causes: 'Rendered more hooks than during the previous render.'
// Usage (from the project folder):  node scripts/scan-hooks.js            (scans apps/web/src)
// Exit code 1 when something suspicious is found, so it can run in CI.
const ts = require('typescript');
const fs = require('fs'), path = require('path');
const root = process.argv[2] || 'apps/web/src';
const files = [];
(function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); const s = fs.statSync(p);
  if (s.isDirectory()) { if (!/node_modules|dist/.test(f)) walk(p); } else if (/\.tsx$/.test(f)) files.push(p); } })(root);
const isHook = n => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^use[A-Z0-9]/.test(n.expression.text);
let findings = [];
function hasEarlyReturn(stmt){ // statement that can return early
  let found = false;
  (function v(n){ if (found) return; if (ts.isFunctionLike(n) && n !== stmt) return; if (ts.isReturnStatement(n)) { found = true; return; } ts.forEachChild(n, v); })(stmt);
  return found;
}
function hooksIn(node, cb, depthCond){ // hooks not inside nested functions
  (function v(n, cond){ if (ts.isFunctionLike(n) && n !== node) return;
    if (isHook(n)) cb(n, cond);
    const c = cond || ts.isIfStatement(n) || ts.isConditionalExpression(n) || ts.isForStatement(n) || ts.isWhileStatement(n) || ts.isForOfStatement(n) || ts.isSwitchStatement(n) || (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken));
    ts.forEachChild(n, ch => v(ch, c && !(ts.isIfStatement(n) && false)));
  })(node, false);
}
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  (function visit(n){
    let body = null, name = '';
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n)) && n.body && ts.isBlock(n.body)) {
      body = n.body;
      name = (n.name && n.name.text) || (n.parent && ts.isVariableDeclaration(n.parent) && n.parent.name.getText()) || '(anonymous)';
    }
    if (body && /^[A-Z]/.test(name)) { // component or hook-like component name
      let returned = false, retLine = 0;
      for (const st of body.statements) {
        if (returned) hooksIn(st, h => findings.push({file, line: line(h), name, why: `hook ${h.expression.text} AFTER an early return (line ${retLine})`}));
        else {
          hooksIn(st, (h, cond) => { if (cond) findings.push({file, line: line(h), name, why: `hook ${h.expression.text} inside a condition/loop`}); });
          if (hasEarlyReturn(st)) { returned = true; retLine = line(st); }
        }
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}
const seen = new Set();
findings = findings.filter(f => { const k = f.file+f.line; if (seen.has(k)) return false; seen.add(k); return true; });
console.log(`scanned ${files.length} .tsx files, ${findings.length} suspicious spots`);
for (const f of findings) console.log(`${path.relative(root,f.file)}:${f.line}  <${f.name}>  ${f.why}`);
if (findings.length) process.exit(1);
