const fs=require('node:fs');
const path=require('node:path');
const lucide=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/lucide');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
execFileSync(process.execPath,[path.join(root,'work/qingji/build.cjs')],{stdio:'inherit'});
fs.mkdirSync(path.join(__dirname,'assets'),{recursive:true});
const csp="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'; connect-src 'none'";
let html=fs.readFileSync(path.join(root,'outputs/qingji.html'),'utf8');
html=html.replace('<meta charset="utf-8">',`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">`);
const mobileCss=`
.android { -webkit-text-size-adjust:100%; }
.android button { touch-action:manipulation; }
.android .sidebar { width:270px; padding-top:22px; }
.android .drawer-close { width:40px; height:40px; }
.android .bottom-tools .icon-button { width:42px; height:42px; }
.android .nav-row { min-height:43px; font-size:14px; }
.android .category-line { min-height:40px; }
.android .category-pick { font-size:13px; }
.android .category-menu { opacity:1; position:static; width:30px; height:32px; background:none; }
.android .category-pick .count { display:none; }
.android .tag-filter { min-height:30px; }
.android .editor-topbar { padding:0 13px; }
.android .editor-actions .icon-button { width:36px; height:40px; }
.android .editor-trail { max-width:100px; }
.android .mobile-menu,.android .mobile-back { width:38px; height:40px; }
.android .list-heading { padding:16px 18px 14px; }
.android .search-wrap input { min-height:43px; font-size:13px; }
.android .writing-toolbar { min-height:84px; }
.android .writing-toolbar .icon-button { width:34px; height:38px; }
.android .sidebar-command { min-height:46px; font-size:14px; }
.android .note-title { font-size:24px; }
.android .note-body { font-size:16px; line-height:1.8; }
.android .note-tags { min-height:32px; }
.android #tagInput { min-height:30px; font-size:12px; }
.android .tag-chip { font-size:11px; min-height:27px; }
.android .tag-chip button { width:20px; height:20px; }
.android .modal input,.android .modal select,.android .unlock-form input { font-size:16px; }
.android .modal .primary,.android .modal .secondary { min-height:43px; }
.android .modal-tabs button { min-height:46px; font-size:13px; }
.android .swatch { width:34px; height:34px; }
.android .popup-menu button { min-height:46px; }
.android .app { min-height:0; }
@media(max-height:550px) {
  .android .editor-content { padding-top:12px; }
  .android .note-meta { margin-bottom:5px; }
  .android .note-title { height:38px; margin-bottom:4px; }
  .android .note-tags { margin-bottom:6px; }
  .android .writing-toolbar { margin-bottom:9px; }
  .android .note-body { min-height:45px; padding-bottom:15px; }
  .android .editor-footer { min-height:28px; }
  .android .sidebar { overflow-y:auto; }
}
`;
html=html.replace('</style>',`${mobileCss}</style>`);
fs.writeFileSync(path.join(__dirname,'assets/index.html'),html);
fs.copyFileSync('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/lucide/LICENSE',path.join(__dirname,'assets/LUCIDE-LICENSE.txt'));
fs.copyFileSync(path.join(root,'work/qingji/vendor/MATHJS-LICENSE.txt'),path.join(__dirname,'assets/MATHJS-LICENSE.txt'));
const paths=lucide.icons.NotebookPen.map(([name,attrs])=>`<${name} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`).join('');
fs.writeFileSync(path.join(__dirname,'res/drawable/icon_foreground.xml'),`<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><group android:translateX="29" android:translateY="29" android:scaleX="2.08" android:scaleY="2.08">${lucide.icons.NotebookPen.filter(([name])=>name==='path').map(([,attrs])=>`<path android:pathData="${attrs.d}" android:fillColor="@android:color/transparent" android:strokeColor="#FFFFFF" android:strokeWidth="1.4" android:strokeLineCap="round" android:strokeLineJoin="round"/>`).join('')}</group></vector>\n`);
console.log('Prepared offline Android assets');
