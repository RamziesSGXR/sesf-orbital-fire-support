// Lists string literals that look like English text (two or more words), to find text that skipped the language tables.
const ts = require('typescript'); const fs = require('fs');
for (const file of process.argv.slice(2)) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const walk = (n) => {
    let txt = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) txt = n.text;
    else if (ts.isTemplateExpression(n)) txt = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
    if (txt !== null) {
      const words = txt.replace(/<[^>]+>/g, ' ').match(/[A-Za-z]{2,}/g) || [];
      const p = n.parent;
      const isImport = p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p));
      const isKeyCall = p && ts.isCallExpression(p) && ts.isIdentifier(p.expression) && ['t', 'tr', 'tl', 'tEn'].includes(p.expression.text);
      if (!isImport && !isKeyCall && words.length >= 2 && !/^[a-z0-9_.:\-]+$/.test(txt) && !/(px|rgba|monospace|#[0-9a-f]{3})/i.test(txt)) {
        const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
        console.log(`${file}:${line + 1}: ${txt.slice(0, 90)}`);
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sf);
}
