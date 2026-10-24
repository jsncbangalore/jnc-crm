const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const srcDir = path.resolve(__dirname, '../apps/api/src');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results = results.concat(getFiles(full));
    else if (file.endsWith('.controller.ts')) results.push(full);
  }
  return results;
}

const HTTP_VERBS = ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options', 'All'];

function getDecoratorNameAndArgs(decorator) {
  const expr = decorator.expression;
  if (ts.isCallExpression(expr)) {
    const name = expr.expression.getText();
    const args = expr.arguments.map((arg) => {
      if (ts.isStringLiteral(arg)) return arg.text;
      return arg.getText();
    });
    return { name, args };
  } else if (ts.isIdentifier(expr)) {
    return { name: expr.getText(), args: [] };
  }
  return { name: '', args: [] };
}

function getDecorators(node) {
  if (!node.modifiers) return [];
  return node.modifiers.filter(ts.isDecorator);
}

const files = getFiles(srcDir);
const routes = [];

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isClassDeclaration(node)) {
      const classDecorators = getDecorators(node).map(getDecoratorNameAndArgs);
      const controllerDec = classDecorators.find((d) => d.name === 'Controller');
      if (!controllerDec) return;

      const controllerPrefix = controllerDec.args[0] || '';
      const classIsPublic = classDecorators.some((d) => d.name === 'Public');
      const classIsAuthOnly = classDecorators.some((d) => d.name === 'AuthOnly');
      const classPageAccess = classDecorators.find((d) => d.name === 'PageAccess')?.args || null;
      const classRoles = classDecorators.find((d) => d.name === 'Roles')?.args || null;

      node.members.forEach((member) => {
        if (ts.isMethodDeclaration(member)) {
          const methodDecorators = getDecorators(member).map(getDecoratorNameAndArgs);
          const httpDec = methodDecorators.find((d) => HTTP_VERBS.includes(d.name));
          if (!httpDec) return;

          const verb = httpDec.name.toUpperCase();
          const subPath = httpDec.args[0] || '';
          const fullPath = ('/' + controllerPrefix + (subPath ? '/' + subPath : '')).replace(/\/+/g, '/');

          const methodIsPublic = methodDecorators.some((d) => d.name === 'Public');
          const methodIsAuthOnly = methodDecorators.some((d) => d.name === 'AuthOnly');
          const methodPageAccess = methodDecorators.find((d) => d.name === 'PageAccess')?.args || null;
          const methodRoles = methodDecorators.find((d) => d.name === 'Roles')?.args || null;

          const isPublic = methodIsPublic || (classIsPublic && !methodIsAuthOnly && !methodPageAccess);
          const isAuthOnly = (methodIsAuthOnly || classIsAuthOnly) && !isPublic;
          const pageAccess = methodPageAccess || classPageAccess;
          const roles = methodRoles || classRoles;

          routes.push({
            controller: path.basename(file),
            methodName: member.name.getText(),
            verb,
            path: fullPath,
            isPublic,
            isAuthOnly,
            pageAccess,
            roles,
          });
        }
      });
    }
  });
}

console.log('Total routes scanned:', routes.length);

console.log('\n--- PUBLIC ROUTES ---');
routes.filter((r) => r.isPublic).forEach((r) => console.log(`${r.verb}\t${r.path}\t${r.controller}`));

console.log('\n--- AUTH ONLY ROUTES ---');
routes.filter((r) => r.isAuthOnly && !r.pageAccess).forEach((r) => console.log(`${r.verb}\t${r.path}\t${r.controller}`));

console.log('\n--- ROUTES WITH PAGE ACCESS ---');
routes.filter((r) => r.pageAccess).forEach((r) => console.log(`${r.verb}\t${r.path}\t${r.controller}\t[${r.pageAccess.join(', ')}]`));

console.log('\n--- ROUTES WITHOUT PAGEACCESS OR AUTHONLY OR PUBLIC ---');
routes
  .filter((r) => !r.isPublic && !r.isAuthOnly && !r.pageAccess)
  .forEach((r) => console.log(`${r.verb}\t${r.path}\t${r.controller}\tRoles: [${r.roles ? r.roles.join(', ') : 'none'}]`));
