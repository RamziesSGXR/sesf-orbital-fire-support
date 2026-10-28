// Finds calls to the translation function (t or tr) made where a local variable or parameter of the same name hides it.
// node tools/tcheck.cjs files...  (needs the typescript package, used only as a parser)
const ts = require('typescript');
const fs = require('fs');
const NAMES = ['t', 'tr'];
let bad = 0;
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/\btr?\(/.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declared = (node) => {
    const out = new Set();
    const bind = (n) => { if (!n) return; if (ts.isIdentifier(n)) { if (NAMES.includes(n.text)) out.add(n.text); } else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) n.elements.forEach((e) => e.name && bind(e.name)); };
    if (ts.isFunctionLike(node) && node.parameters) node.parameters.forEach((p) => bind(p.name));
    const stmts = ts.isBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node) ? node.statements : null;
    if (stmts) for (const st of stmts) if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => bind(d.name));
    if ((ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) && node.initializer && ts.isVariableDeclarationList(node.initializer)) node.initializer.declarations.forEach((d) => bind(d.name));
    if (ts.isCatchClause(node) && node.variableDeclaration) bind(node.variableDeclaration.name);
    return out;
  };
  const walk = (node, shadow) => {
    let sh = shadow;
    if (!ts.isSourceFile(node)) { const d = declared(node); if (d.size) sh = new Set([...shadow, ...d]); }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && sh.has(node.expression.text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      console.log(`${file}:${line + 1}: ${node.expression.text}() called where a local ${node.expression.text} hides it`); bad++;
    }
    ts.forEachChild(node, (c) => walk(c, sh));
  };
  walk(sf, new Set());
}
if (bad) { console.log(`${bad} shadowed call(s)`); process.exit(1); }
console.log('translator check: clean');
