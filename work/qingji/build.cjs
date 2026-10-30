const fs = require('node:fs');
const path = require('node:path');
const runtime = 'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const sharp = require(path.join(runtime,'sharp'));
const lucide = require(path.join(runtime,'lucide'));
async function build() {
  const iconPath = lucide.icons.NotebookPen.map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="23" fill="#24735b"/><g transform="translate(21 21) scale(2.25)" fill="none" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${iconPath}</g></svg>`;
  const bitmap = await sharp(Buffer.from(svg)).png().toBuffer();
  const image = `data:image/png;base64,${bitmap.toString('base64')}`;
  const library = fs.readFileSync(path.join(runtime,'lucide/dist/umd/lucide.min.js'),'utf8').replace(/\/\/# sourceMappingURL=.*$/gm,'');
  const css = ['styles.css','refinements.css','tables.css'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8')).join('\n');
  const math = fs.readFileSync(path.join(__dirname,'vendor/math.js'),'utf8').replace(/\/\/# sourceMappingURL=.*$/gm,'');
  const html = fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replaceAll('__ICON__',image).replace('/*__CSS__*/',()=>css).replace('/*__LUCIDE__*/',()=>library).replace('/*__MATH__*/',()=>math).replace('/*__TABLES__*/',()=>fs.readFileSync(path.join(__dirname,'tables.js'),'utf8')).replace('/*__VAULT__*/',()=>fs.readFileSync(path.join(__dirname,'vault.js'),'utf8')).replace('/*__JS__*/',()=>fs.readFileSync(path.join(__dirname,'app.js'),'utf8'));
  const target=path.resolve(__dirname,'../../outputs/qingji.html');
  fs.writeFileSync(target,html,'utf8');
  console.log(`Built ${target} (${(Buffer.byteLength(html)/1024).toFixed(1)} KB)`);
}
build().catch(error=>{console.error(error);process.exitCode=1;});
