(() => {
  'use strict';
  const STORAGE_KEY = 'qingji.v1';
  const ANDROID = typeof window.QingjiAndroid !== 'undefined';
  const readStorage = () => ANDROID ? window.QingjiAndroid.readVault() : localStorage.getItem(STORAGE_KEY);
  const writeStorage = raw => {
    if (ANDROID) { if (!window.QingjiAndroid.writeVault(raw)) throw Error('应用存储写入失败'); }
    else localStorage.setItem(STORAGE_KEY,raw);
  };
  const documentRequests = new Map();
  const Tables = window.QingjiTables;
  const Vault = window.QingjiVault;
  const COLORS = ['#668e75', '#718eac', '#bd9b57', '#a8869c', '#849b59', '#bf8675'];
  const FONT_SIZES = [12,14,16,18,20,24,28,32];
  const TEXT_COLORS = [['#30363d','黑色'],['#d13b40','红色'],['#236ac1','蓝色'],['#24735b','绿色'],['#8253b3','紫色'],['#bc661e','橙色'],['#707782','灰色'],['#bd3f79','玫红']];
  const FONT_FAMILIES = {system:'system-ui, sans-serif',serif:'serif',mono:'monospace'};
  const DEFAULT_EDITOR = {fontSize:16,color:'#30363d',fontFamily:'system',lineHeight:1.8};
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<i data-lucide="${name}"></i>`;
  const uid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const date = (value, options = {month:'long', day:'numeric'}) => new Date(value).toLocaleDateString('zh-CN', options);
  const clone = value => JSON.parse(JSON.stringify(value));
  let data, vaultSession = null, activeVault = null, lastRaw = null;
  let view = {type:'all', id:null}, selectedId = null, search = '';
  let editRev = 0, savedRev = 0, saveTimer, saveQueue = Promise.resolve(), savePending = 0, saveError = '', conflict = false;
  let expanded = new Set(), lockTimer, toastTimer, historyTimer, lastActive = Date.now();
  let history = new Map(), categoryDraftColor = COLORS[0];
  let editorRange = null, composing = false, pendingFontSize = null, toolsGesture = null, toolsNoteId = null;
  let reordering = false, categoryReordering = false, securityBusy = false, locking = false, pauseRequested = false, modalCleanup = null;
  const icons = () => window.lucide.createIcons({attrs:{'aria-hidden':'true'}});

  function colorHex(value,fallback='#30363d') {
    if(/^#[\da-f]{6}$/i.test(value||''))return value.toLowerCase();
    const match=/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*1)?\s*\)$/i.exec(value||'');
    return match&&match.slice(1).every(v=>Number(v)<=255)?`#${match.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join('')}`:fallback;
  }
  function editorSettings(input) {
    return {fontSize:FONT_SIZES.includes(input?.fontSize)?input.fontSize:16,color:colorHex(input?.color),fontFamily:Object.hasOwn(FONT_FAMILIES,input?.fontFamily)?input.fontFamily:'system',lineHeight:[1.4,1.6,1.8,2,2.2].includes(input?.lineHeight)?input.lineHeight:1.8};
  }
  const plainHtml = text => escape(text).replace(/\n/g,'<br>');
  function bodyText(root) {
    const blocks=new Set(['DIV','P','LI','UL','OL','BLOCKQUOTE']);
    function read(node) {
      if(node.nodeType===Node.TEXT_NODE)return node.nodeValue;
      if(node.nodeName==='BR')return '\n';
      let result='';
      const children=[...node.childNodes];
      children.forEach((child,index)=>{
        const block=blocks.has(child.nodeName);
        if(block&&result&&!result.endsWith('\n'))result+='\n';
        result+=read(child);
        if(block&&index<children.length-1&&!result.endsWith('\n'))result+='\n';
      });
      return result;
    }
    // Chromium uses a single BR as the empty editable placeholder.
    return root.innerHTML==='<br>'?'':read(root).replace(/\u00a0/g,' ');
  }
  function sanitizeBody(html) {
    const source=new DOMParser().parseFromString(html,'text/html');
    const target=document.createElement('div');
    const allowed=new Set(['B','STRONG','I','EM','U','S','STRIKE','SPAN','FONT','DIV','P','BR','UL','OL','LI','BLOCKQUOTE']);
    const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','NOSCRIPT']);
    function copy(node,parent,depth) {
      if(node.nodeType===Node.TEXT_NODE){parent.append(document.createTextNode(node.nodeValue));return;}
      if(node.nodeType!==Node.ELEMENT_NODE||blocked.has(node.tagName)||depth>80)return;
      const el=allowed.has(node.tagName)?document.createElement(node.tagName==='FONT'?'span':node.tagName.toLowerCase()):parent;
      if(el!==parent){
        const style=node.style;
        for(const property of ['color','backgroundColor']) {
          const value=style[property]||(property==='color'?node.getAttribute('color'):'');
          if(value)el.style[property]=colorHex(value,property==='color'?'#30363d':'transparent');
        }
        const size=Number.parseFloat(style.fontSize);
        if(/^\d+(?:\.\d+)?px$/.test(style.fontSize)&&size>=12&&size<=32)el.style.fontSize=`${size}px`;
        const family=style.fontFamily.replace(/["']/g,'');
        if(Object.values(FONT_FAMILIES).includes(family))el.style.fontFamily=family;
        if(['bold','700'].includes(style.fontWeight))el.style.fontWeight='700';
        if(style.fontStyle==='italic')el.style.fontStyle='italic';
        if(/\bunderline\b/.test(style.textDecorationLine||style.textDecoration))el.style.textDecoration='underline';
        parent.append(el);
      }
      for(const child of node.childNodes)copy(child,el,depth+1);
    }
    for(const node of source.body.childNodes)copy(node,target,0);
    return target.innerHTML;
  }
  function noteHtml(n) {return n.bodyHtml??plainHtml(n.body);}
  function bodySnapshot(n) {return JSON.stringify({body:n.body,bodyHtml:noteHtml(n)});}
  function applyEditorDefaults() {
    const settings=data.settings.editor||DEFAULT_EDITOR,el=$('noteBody');
    el.style.fontSize=`${settings.fontSize}px`;el.style.color=settings.color;
    el.style.fontFamily=FONT_FAMILIES[settings.fontFamily];el.style.lineHeight=settings.lineHeight;
    $('tableWorkspace').style.setProperty('--table-font-size',`${Math.min(settings.fontSize,24)}px`);
    $('tableWorkspace').style.setProperty('--table-text-color',settings.color);
    $('tableWorkspace').style.setProperty('--table-font-family',FONT_FAMILIES[settings.fontFamily]);
    $('fontSize').value=String(settings.fontSize);$('textColorIndicator').style.background=settings.color;
  }
  function rememberRange() {
    const selection=window.getSelection();
    if(selection.rangeCount&&$('noteBody').contains(selection.anchorNode)&&$('noteBody').contains(selection.focusNode))editorRange=selection.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    const el=$('noteBody');el.focus();
    const selection=window.getSelection();
    if(editorRange&&el.contains(editorRange.commonAncestorContainer)){selection.removeAllRanges();selection.addRange(editorRange);}
    else{const range=document.createRange();range.selectNodeContents(el);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}
  }
  function syncToolbar() {
    const n=selected();if(!n||n.deletedAt)return;
    const selection=window.getSelection();if(!$('noteBody').contains(selection.anchorNode))return;
    for(const command of ['bold','italic','underline']){
      const button=document.querySelector(`[data-action="${command}"]`),active=document.queryCommandState(command);
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    }
    const anchor=selection.anchorNode.nodeType===Node.ELEMENT_NODE?selection.anchorNode:selection.anchorNode.parentElement;
    const style=getComputedStyle(anchor),size=pendingFontSize&&document.queryCommandValue('fontSize')==='7'?pendingFontSize:Number.parseFloat(style.fontSize);
    $('fontSize').value=String(FONT_SIZES.reduce((a,b)=>Math.abs(b-size)<Math.abs(a-size)?b:a));
    $('textColorIndicator').style.background=style.color;
    const active=colorHex(document.queryCommandValue('hiliteColor'),'')==='#fff1a8';
    const highlight=document.querySelector('[data-action="highlight"]');highlight.classList.toggle('active',active);highlight.setAttribute('aria-pressed',String(active));
  }
  function syncBody() {
    const n=selected();if(!n||n.deletedAt)return;
    if(pendingFontSize)$('noteBody').querySelectorAll('font[size="7"],span[style]').forEach(el=>{
      if(el.getAttribute('size')==='7'||['xxx-large','-webkit-xxx-large'].includes(el.style.fontSize)){el.removeAttribute('size');el.style.fontSize=`${pendingFontSize}px`;}
    });
    const body=bodyText($('noteBody'));
    if(body.length>2000000){$('noteBody').innerHTML=noteHtml(n);toast('正文不能超过 200 万字符');return;}
    const bodyHtml=sanitizeBody($('noteBody').innerHTML);
    if(body!==n.body||bodyHtml!==noteHtml(n))updateNote({body,bodyHtml});
    rememberRange();syncToolbar();
  }
  function formatText(command,value=null) {
    const n=selected();if(!n||n.deletedAt||composing)return;
    restoreRange();recordHistory(n.id,bodySnapshot(n));
    document.execCommand('styleWithCSS',false,true);
    if(command==='fontSize'){
      pendingFontSize=value;
      document.execCommand('styleWithCSS',false,false);
      document.execCommand('fontSize',false,'7');
      $('noteBody').querySelectorAll('font[size="7"]').forEach(el=>{el.removeAttribute('size');el.style.fontSize=`${value}px`;});
      document.execCommand('styleWithCSS',false,true);
    }else document.execCommand(command,false,value);
    syncBody();
    if(command==='fontSize')$('fontSize').value=String(value);
    closeTextColor();
  }
  function closeTextColor() {$('textColorMenu').hidden=true;$('textColorButton').setAttribute('aria-expanded','false');}
  function setEditorTools(open) {
    if(open&&(!selected()||selected().deletedAt))return;
    rememberRange();
    if(!open){commitTag();closeTextColor();}
    $('editorTools').hidden=!open;
    const button=$('editorToolsToggle');button.setAttribute('aria-expanded',String(open));
    button.title=open?'收起编辑工具':'展开编辑工具';button.setAttribute('aria-label',button.title);
  }
  function colorMenu() {
    rememberRange();const menu=$('textColorMenu');menu.hidden=!menu.hidden;
    $('textColorButton').setAttribute('aria-expanded',String(!menu.hidden));
    if(!menu.hidden)menu.innerHTML=`<span class="color-menu-label">文字颜色</span><div class="text-swatches">${TEXT_COLORS.map(([color,label])=>`<button class="text-swatch" data-text-color="${color}" style="background:${color}" aria-label="${label}" title="${label}"></button>`).join('')}</div><form id="customColorForm"><input id="customTextColor" aria-label="自定义颜色" value="${colorHex($('textColorIndicator').style.backgroundColor)}" pattern="#[0-9a-fA-F]{6}" maxlength="7"><button type="submit" class="icon-button" aria-label="应用颜色" title="应用颜色">${icon('check')}</button></form>`;
    if(!menu.hidden)$('customColorForm').onsubmit=e=>{e.preventDefault();formatText('foreColor',colorHex($('customTextColor').value));};
    icons();
    if(!menu.hidden){
      const r=$('textColorButton').getBoundingClientRect();
      menu.style.left=`${Math.max(8,Math.min(r.right-212,innerWidth-220))}px`;
      menu.style.top=`${Math.max(8,Math.min(r.bottom+4,innerHeight-menu.offsetHeight-8))}px`;
    }
  }

  function seed() {
    const categories = [
      {id:'expenses',name:'消费',parentId:null,color:COLORS[0]},
      {id:'daily-cost',name:'日常开销',parentId:'expenses',color:COLORS[0]},
      {id:'fixed-cost',name:'固定支出',parentId:'expenses',color:COLORS[0]},
      {id:'shopping',name:'购物',parentId:'expenses',color:COLORS[2]},
      {id:'daily',name:'每日记录',parentId:null,color:COLORS[1]}
    ];
    return {categories,notes:[],orders:[],settings:{autoLock:5,editor:{...DEFAULT_EDITOR}}};
  }

  function validateData(input) {
    if (!input || !Array.isArray(input.notes) || !Array.isArray(input.categories) || input.notes.length > 50000 || input.categories.length > 3000) throw Error('备份格式不正确');
    const ids = new Set();
    const categories = input.categories.map(c => {
      if (!c || typeof c.id !== 'string' || !c.id || c.id.length > 100 || ids.has(c.id) || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 40 || !(c.parentId === null || typeof c.parentId === 'string')) throw Error('分类数据不正确');
      ids.add(c.id);
      return {id:c.id,name:c.name,parentId:c.parentId,color:COLORS.includes(c.color)?c.color:COLORS[0]};
    });
    const categoryMap = new Map(categories.map(c=>[c.id,c]));
    for (const c of categories) {
      const path = new Set([c.id]);
      let parent = c.parentId;
      while (parent !== null) {
        if (!categoryMap.has(parent) || path.has(parent)) throw Error('分类层级不正确');
        path.add(parent);
        parent = categoryMap.get(parent).parentId;
      }
    }
    const noteIds = new Set();
    const validStamp = s => typeof s === 'string' && Number.isFinite(Date.parse(s));
    const notes = input.notes.map(n => {
      if (!n || typeof n.id !== 'string' || !n.id || n.id.length > 100 || noteIds.has(n.id) || typeof n.title !== 'string' || n.title.length > 200 || typeof n.body !== 'string' || n.body.length > 2000000 || !Array.isArray(n.tags) || n.tags.length > 30 || n.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>30) || !validStamp(n.createdAt) || !validStamp(n.updatedAt) || (n.deletedAt !== null && !validStamp(n.deletedAt)) || (n.categoryId !== null && !categoryMap.has(n.categoryId))) throw Error('笔记数据不正确');
      noteIds.add(n.id);
      const result={id:n.id,title:n.title,body:n.body,categoryId:n.categoryId,tags:[...new Set(n.tags)],pinned:!!n.pinned,createdAt:n.createdAt,updatedAt:n.updatedAt,deletedAt:n.deletedAt};
      result.table=n.table===undefined?{kind:'numbered',rows:[]}:Tables.validate(n.table);
      if(typeof n.bodyHtml==='string'&&n.bodyHtml.length<=8000000){
        const html=sanitizeBody(n.bodyHtml),el=document.createElement('div');el.innerHTML=html;
        if(bodyText(el)===n.body)result.bodyHtml=html;
      }
      return result;
    });
    const orderKeys = new Set();
    let references = 0;
    if(input.orders!==undefined&&(!Array.isArray(input.orders)||input.orders.length>categories.length+2))throw Error('文件顺序数据不正确');
    const orders=(input.orders||[]).map(order=>{
      if(!order||typeof order.key!=='string'||orderKeys.has(order.key)||(!['all','uncategorized'].includes(order.key)&&(!order.key.startsWith('category:')||!categoryMap.has(order.key.slice(9))))||!Array.isArray(order.ids)||order.ids.length>50000)throw Error('文件顺序数据不正确');
      orderKeys.add(order.key);references+=order.ids.length;
      const unique=new Set();
      for(const id of order.ids){if(typeof id!=='string'||id.length>100||unique.has(id))throw Error('文件顺序数据不正确');unique.add(id);}
      if(references>500000)throw Error('文件顺序数据过大');
      return {key:order.key,ids:order.ids.filter(id=>noteIds.has(id))};
    });
    return {notes,categories,orders,settings:{autoLock:[0,1,5,15,30].includes(input.settings?.autoLock)?input.settings.autoLock:5,editor:editorSettings(input.settings?.editor)}};
  }
  function validateVault(v) {
    Vault.validate(v);
    if(!v.encrypted)validateData(v.data);
    return v;
  }
  async function decrypt(v,credential,recovery=false) {
    const result=await Vault.decrypt(v,credential,recovery);
    try{result.data=validateData(result.data);return result;}catch(error){Vault.clearSession(result.session);throw error;}
  }
  function setSession(session) {
    if(vaultSession?.bytes!==session?.bytes)Vault.clearSession(vaultSession);
    vaultSession=session;
  }
  const makeVault=(snapshot,session)=>session?Vault.encrypt(snapshot,session):Promise.resolve({format:'qingji',version:3,encrypted:false,data:snapshot,updatedAt:now()});
  async function persistState(snapshot,session) {
    const expected=lastRaw,vault=await makeVault(clone(snapshot),session);
    if(readStorage()!==expected)throw Error('其他窗口已更新笔记，请重新载入');
    const raw=JSON.stringify(vault);
    writeStorage(raw);lastRaw=raw;activeVault=vault;
  }
  function markChanged() {
    editRev++;
    saveError = '';
    clearTimeout(saveTimer);
    renderSaveStatus();
    saveTimer = setTimeout(()=>saveNow().catch(()=>{}),180);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    if (!data) return saveQueue;
    if (conflict) return Promise.reject(Error('其他窗口已更新笔记，请先处理冲突'));
    const snapshot = clone(data), session = vaultSession, rev = editRev;
    savePending++;
    renderSaveStatus();
    const op = saveQueue.then(async () => {
      if (readStorage() !== lastRaw) { showConflict(); throw Error('其他窗口已更新笔记'); }
      const vault = await makeVault(snapshot,session);
      if (readStorage() !== lastRaw) { showConflict(); throw Error('其他窗口已更新笔记'); }
      const raw = JSON.stringify(vault);
      writeStorage(raw);
      lastRaw = raw;
      activeVault = vault;
      savedRev = Math.max(savedRev,rev);
      saveError = '';
    }).catch(error => {
      saveError = conflict ? '其他窗口已更新' : '保存失败，请导出备份';
      toast(saveError);
      throw error;
    }).finally(()=>{savePending--;renderSaveStatus();});
    saveQueue = op.catch(()=>{});
    return op;
  }
  function renderSaveStatus() {
    const status = $('saveStatus');
    status.classList.toggle('error',!!saveError);
    status.innerHTML = saveError ? `${icon('circle-alert')}${escape(saveError)}` : savePending || editRev > savedRev ? `${icon('loader-circle')}保存中` : `${icon('check')}已保存`;
    icons();
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(()=>$('toast').hidden=true,3400);
  }
  const activeNotes = () => data.notes.filter(n=>!n.deletedAt);
  const selected = () => data?.notes.find(n=>n.id===selectedId);
  const category = id => data.categories.find(c=>c.id===id);
  function descendants(id) {
    const found = new Set([id]);
    const queue = [id];
    for(let i=0;i<queue.length;i++) for(const c of data.categories) if(c.parentId===queue[i]&&!found.has(c.id)){found.add(c.id);queue.push(c.id);}
    return found;
  }
  function categoryPath(id) {
    const names = [];
    let c = category(id);
    while(c){names.unshift(c.name);c=category(c.parentId);}
    return names.join(' / ') || '未分类';
  }
  function categoryOptions(value,exclude=new Set()) {
    let result = `<option value="">未分类</option>`;
    function visit(parentId,depth) {
      for(const c of data.categories.filter(c=>c.parentId===parentId)) {
        if(exclude.has(c.id))continue;
        result += `<option value="${escape(c.id)}"${value===c.id?' selected':''}>${'　'.repeat(Math.min(depth,8))}${escape(c.name)}</option>`;
        visit(c.id,depth+1);
      }
    }
    visit(null,0);
    return result;
  }
  function moveCategory(id,direction) {
    if(!categoryReordering||![-1,1].includes(direction))return;
    const c=category(id);if(!c)return;
    const siblings=data.categories.filter(item=>item.parentId===c.parentId);
    const index=siblings.findIndex(item=>item.id===id),neighbor=siblings[index+direction];
    if(!neighbor)return;
    const from=data.categories.indexOf(c),to=data.categories.indexOf(neighbor);
    [data.categories[from],data.categories[to]]=[data.categories[to],data.categories[from]];
    markChanged();renderNav();
    const n=selected();
    if(n){$('noteCategory').innerHTML=categoryOptions(n.categoryId);$('noteCategory').value=n.categoryId||'';}
    [...$('categoryTree').querySelectorAll('[data-move-category]')].find(button=>button.dataset.moveCategory===id&&Number(button.dataset.direction)===direction)?.focus({preventScroll:true});
  }
  const orderKey=()=>view.type==='category'?`category:${view.id}`:view.type==='uncategorized'?'uncategorized':'all';
  const canReorder=()=>!search.trim()&&['all','category','uncategorized'].includes(view.type);
  const defaultOrder=(a,b)=>a.pinned!==b.pinned?(a.pinned?-1:1):Date.parse(b.createdAt)-Date.parse(a.createdAt);
  function orderedNotes(notes,key) {
    const order=data.orders.find(item=>item.key===key);
    if(!order)return notes.sort(defaultOrder);
    const positions=new Map(order.ids.map((id,index)=>[id,index]));
    return notes.sort((a,b)=>(positions.get(a.id)??Infinity)-(positions.get(b.id)??Infinity)||defaultOrder(a,b));
  }
  function notesForOrder(key) {
    if(key==='all')return [...data.notes];
    if(key==='uncategorized')return data.notes.filter(n=>n.categoryId===null);
    const set=descendants(key.slice(9));
    return data.notes.filter(n=>set.has(n.categoryId));
  }
  function placeNewNote(n) {
    const keys=new Set(['all']);
    if(n.categoryId===null)keys.add('uncategorized');
    const categories=new Map(data.categories.map(c=>[c.id,c]));
    let c=categories.get(n.categoryId);
    while(c){keys.add(`category:${c.id}`);c=categories.get(c.parentId);}
    for(const order of data.orders)if(keys.has(order.key)&&!order.ids.includes(n.id))order.ids.unshift(n.id);
  }
  function pruneOrders() {
    const ids=new Set(data.notes.map(n=>n.id)),categories=new Set(data.categories.map(c=>`category:${c.id}`));
    data.orders=data.orders.filter(order=>['all','uncategorized'].includes(order.key)||categories.has(order.key));
    for(const order of data.orders)order.ids=order.ids.filter(id=>ids.has(id));
  }
  function moveNote(id,direction) {
    if(!reordering||!canReorder()||![-1,1].includes(direction))return;
    const visible=filteredNotes(),index=visible.findIndex(n=>n.id===id),neighbor=visible[index+direction];
    if(index<0||!neighbor)return;
    const key=orderKey();
    let order=data.orders.find(item=>item.key===key);
    // Keep recycled and moved-away IDs so restoring a file preserves its position.
    if(!order){order={key,ids:orderedNotes(notesForOrder(key),key).map(n=>n.id)};data.orders.push(order);}
    const present=new Set(order.ids);
    for(const n of visible)if(!present.has(n.id)){order.ids.push(n.id);present.add(n.id);}
    const from=order.ids.indexOf(id),to=order.ids.indexOf(neighbor.id);
    [order.ids[from],order.ids[to]]=[order.ids[to],order.ids[from]];
    markChanged();renderList();
    [...$('noteList').querySelectorAll('[data-move-note]')].find(button=>button.dataset.moveNote===id&&Number(button.dataset.direction)===direction)?.focus({preventScroll:true});
  }
  function filteredNotes() {
    const set = view.type==='category' ? descendants(view.id) : null;
    const query = search.normalize('NFKC').toLocaleLowerCase().trim();
    const notes=data.notes.filter(n=>{
      if(view.type==='trash' ? !n.deletedAt : !!n.deletedAt)return false;
      if(view.type==='pinned'&&!n.pinned)return false;
      if(view.type==='uncategorized'&&n.categoryId)return false;
      if(set&&!set.has(n.categoryId))return false;
      if(view.type==='tag'&&!n.tags.includes(view.id))return false;
      if(['numbered','timed'].includes(view.type)&&n.table.kind!==view.type)return false;
      return !query || `${n.title}\n${n.body}\n${Tables.text(n.table)}\n${n.tags.join(' ')}`.normalize('NFKC').toLocaleLowerCase().includes(query);
    });
    return view.type==='trash'?notes.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)):orderedNotes(notes,orderKey());
  }
  function viewName() {
    return ({all:'全部表格',numbered:'序号表',timed:'时间表',pinned:'置顶表格',uncategorized:'未分类',trash:'回收站',category:category(view.id)?.name,tag:`# ${view.id}`})[view.type] || '全部表格';
  }
  function renderNav() {
    const notes = activeNotes();
    const siblingCounts=new Map();
    for(const c of data.categories)siblingCounts.set(c.parentId,(siblingCounts.get(c.parentId)||0)+1);
    const canOrder=[...siblingCounts.values()].some(count=>count>1);
    if(!canOrder)categoryReordering=false;
    $('categoryOrderToggle').hidden=!canOrder;
    $('categoryOrderToggle').setAttribute('aria-pressed',String(categoryReordering));
    $('categoryOrderToggle').title=categoryReordering?'完成分类调整':'调整分类位置';
    $('categoryOrderToggle').setAttribute('aria-label',$('categoryOrderToggle').title);
    $('mainNav').innerHTML = [['all','notebook-text','全部表格',notes.length],['numbered','list-ordered','序号表',notes.filter(n=>n.table.kind==='numbered').length],['timed','clock-3','时间表',notes.filter(n=>n.table.kind==='timed').length]].map(([type,ic,label,count])=>`<button class="nav-row${view.type===type?' active':''}" data-view="${type}"${view.type===type?' aria-current="page"':''}>${icon(ic)}<span>${label}</span><span class="count">${count}</span></button>`).join('');
    let tree='';
    function visit(parentId,depth) {
      const siblings=data.categories.filter(c=>c.parentId===parentId);
      for(const [index,c] of siblings.entries()) {
        const hasChildren = data.categories.some(x=>x.parentId===c.id);
        const isOpen = expanded.has(c.id);
        const set = descendants(c.id);
        const controls=categoryReordering?`<div class="category-order-controls"><button class="icon-button" data-move-category="${escape(c.id)}" data-direction="-1" aria-label="上移${escape(c.name)}" title="上移"${index===0?' disabled':''}>${icon('arrow-up')}</button><button class="icon-button" data-move-category="${escape(c.id)}" data-direction="1" aria-label="下移${escape(c.name)}" title="下移"${index===siblings.length-1?' disabled':''}>${icon('arrow-down')}</button></div>`:`<button class="icon-button small category-menu" data-edit-category="${escape(c.id)}" aria-label="编辑${escape(c.name)}" title="编辑分类">${icon('ellipsis')}</button>`;
        tree += `<div class="category-line${view.type==='category'&&view.id===c.id?' active':''}${!isOpen?' collapsed':''}${categoryReordering?' ordering':''}" style="padding-left:${Math.min(depth,8)*15}px"><button class="category-open" data-expand="${escape(c.id)}" aria-label="${isOpen?'折叠':'展开'}${escape(c.name)}" aria-expanded="${isOpen}"${hasChildren?'':' style="visibility:hidden" tabindex="-1"'}>${icon('chevron-down')}</button><button class="category-pick" data-category="${escape(c.id)}" title="${escape(c.name)}"><span style="color:${c.color};display:flex">${icon(hasChildren?'folder-open':'folder')}</span><span>${escape(c.name)}</span><span class="count">${notes.filter(n=>set.has(n.categoryId)).length||''}</span></button>${controls}</div>`;
        if(isOpen)visit(c.id,depth+1);
      }
    }
    visit(null,0);
    $('categoryTree').innerHTML=tree||'<div class="empty-label">暂无分类</div>';
    const tags = [...new Set(notes.flatMap(n=>n.tags))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
    $('tagTotal').textContent=tags.length||'';
    $('tagNav').innerHTML=tags.map(t=>`<button class="tag-filter${view.type==='tag'&&view.id===t?' active':''}" data-tag="${escape(t)}"><b>#</b>${escape(t)}</button>`).join('')||'<span class="empty-label">暂无标签</span>';
    $('tagSuggestions').innerHTML=tags.map(t=>`<option value="${escape(t)}"></option>`).join('');
    $('trashNav').classList.toggle('active',view.type==='trash');
    $('trashNav').querySelector('.count').textContent=data.notes.filter(n=>n.deletedAt).length||'';
    icons();
  }
  function renderList() {
    const notes = filteredNotes();
    const available=canReorder()&&notes.length>1;
    if(!available)reordering=false;
    $('reorderToggle').hidden=!available;
    $('reorderToggle').setAttribute('aria-pressed',String(reordering));
    $('reorderToggle').title=reordering?'完成位置调整':'调整文件位置';
    $('reorderToggle').setAttribute('aria-label',$('reorderToggle').title);
    $('viewTitle').textContent=viewName();
    $('viewTitle').title=viewName();
    $('viewCount').textContent=notes.length;
    $('listLabel').textContent=search?'搜索结果':view.type==='trash'?'已删除的记录':view.type==='category'?categoryPath(view.id):'所有记录';
    $('listLabel').title=$('listLabel').textContent;
    document.querySelectorAll('[data-table-view]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tableView===view.type)));
    $('noteList').innerHTML=notes.map((n,index)=>{
      const total=Tables.summary(n.table),preview=n.table.rows.map(r=>r.description.trim()).filter(Boolean).slice(0,2).join(' · ')||n.body.trim().split('\n').filter(Boolean).slice(0,2).join(' ');
      const card=`<button class="note-card${n.id===selectedId?' selected':''}" data-note="${escape(n.id)}" aria-label="${escape(n.title||'未命名表格')}"${n.id===selectedId?' aria-current="true"':''}><h2><span>${escape(n.title||'未命名表格')}</span>${n.pinned?icon('pin'):''}</h2><p>${escape(preview||`${n.table.kind==='timed'?'时间表':'序号表'} · ${total.count} 条记录`)}</p><div class="note-card-footer"><span class="note-card-folder">${icon('folder')}${escape(category(n.categoryId)?.name||'未分类')}</span><span class="note-card-total">${total.text} 元${total.pending?' · 待计算':''}</span></div></button>`;
      return reordering?`<div class="note-order-row">${card}<div class="note-order-controls"><button class="icon-button" data-move-note="${escape(n.id)}" data-direction="-1" title="上移" aria-label="上移${escape(n.title||'未命名表格')}"${index===0?' disabled':''}>${icon('arrow-up')}</button><button class="icon-button" data-move-note="${escape(n.id)}" data-direction="1" title="下移" aria-label="下移${escape(n.title||'未命名表格')}"${index===notes.length-1?' disabled':''}>${icon('arrow-down')}</button></div></div>`:card;
    }).join('')||`<div class="list-empty">${icon(search?'search-x':view.type==='trash'?'trash-2':'notebook-pen')}<p>${search?'没有找到相关记录':view.type==='trash'?'回收站是空的':'暂无表格'}</p>${!search&&view.type!=='trash'?'<button class="text-button" data-action="new-note">新建表格</button>':''}</div>`;
    $('listFooter').textContent=`${notes.length} 张表格${view.type==='category'?' · 含子分类':''}`;
    $('emptyTrash').hidden=view.type!=='trash'||!notes.length;
    icons();
  }
  function renderEditorTags(n) {
    $('editorTags').innerHTML=n.tags.map(t=>`<span class="tag-chip"># ${escape(t)}${n.deletedAt?'':`<button data-remove-tag="${escape(t)}" aria-label="移除标签${escape(t)}">${icon('x')}</button>`}</span>`).join('');
    $('tagInput').hidden=!!n.deletedAt||n.tags.length>=30;
    icons();
  }
  function renderEditor() {
    const n=selected();
    if(toolsNoteId!==n?.id||n?.deletedAt){setEditorTools(false);toolsNoteId=n?.id||null;}
    $('editorEmpty').hidden=!!n;
    $('editorContent').hidden=!n;
    $('editorActions').hidden=!n;
    if(!n){$('editorTrail').textContent='笔记';$('editorUpdated').textContent='';$('charCount').textContent='';return;}
    $('editorTrail').textContent=categoryPath(n.categoryId);
    $('noteTitle').value=n.title;
    editorRange=null;pendingFontSize=null;closeTextColor();
    $('noteBody').innerHTML=noteHtml(n);applyEditorDefaults();
    $('noteCategory').innerHTML=categoryOptions(n.categoryId);
    $('noteCategory').value=n.categoryId||'';
    $('noteDate').textContent='';
    $('createdDate').textContent=`创建于 ${date(n.createdAt)}`;
    $('pinButton').classList.toggle('active',n.pinned);
    $('pinButton').title=n.pinned?'取消置顶':'置顶笔记';
    $('pinLabel').textContent=$('pinButton').title;
    $('pinButton').setAttribute('aria-label',$('pinButton').title);
    $('pinButton').disabled=!!n.deletedAt;
    $('editorToolsToggle').disabled=!!n.deletedAt;
    $('noteTitle').readOnly=!!n.deletedAt;
    $('noteBody').contentEditable='false';
    $('noteBody').setAttribute('aria-readonly','true');
    $('legacyNote').hidden=!n.body;
    $('legacyNote').open=false;
    $('writingToolbar').hidden=true;
    $('noteCategory').disabled=!!n.deletedAt;
    document.querySelectorAll('.writing-toolbar button,.writing-toolbar select').forEach(b=>b.disabled=!!n.deletedAt);
    document.querySelectorAll('.format-button').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
    $('trashBanner').hidden=!n.deletedAt;
    $('tagInput').value='';
    renderEditorTags(n);
    Tables.render();
    renderEditorFooter();
    renderSaveStatus();
    icons();
  }
  function renderEditorFooter() {
    const n=selected();
    if(!n)return;
    $('editorUpdated').textContent='';
    $('charCount').textContent=`${n.table.rows.length} 条`;
    $('lockState').innerHTML=`${icon(vaultSession?'shield-check':'hard-drive')}${vaultSession?'加密保存':'本地保存'}`;
    icons();
  }
  function renderAll() {renderNav();renderList();renderEditor();}
  function chooseView(type,id=null) {
    commitTag();setEditorTools(false);
    reordering=false;
    view={type,id};
    search='';$('search').value='';
    const list=filteredNotes();
    selectedId=list.some(n=>n.id===selectedId)?selectedId:list[0]?.id||null;
    $('app').classList.remove('show-editor');
    closeSidebar();closeMenu();renderAll();
  }
  function selectNote(id) {
    commitTag();setEditorTools(false);reordering=false;selectedId=id;closeMenu();
    $('app').classList.add('show-editor');
    renderList();renderEditor();
  }
  function updateNote(fields) {
    const n=selected();if(!n||n.deletedAt)return;
    Object.assign(n,fields,{updatedAt:now()});
    markChanged();renderList();renderEditorFooter();
  }
  function newNote() {
    commitTag();
    if(['numbered','timed'].includes(view.type)){createTable(view.type);return;}
    showModal(`${modalHead('新建表格')}<div class="modal-body new-table-options"><button class="new-table-option" data-create-table="numbered">${icon('list-ordered')}序号表</button><button class="new-table-option" data-create-table="timed">${icon('clock-3')}时间表</button></div>`);
  }
  function createTable(kind) {
    if(!['numbered','timed'].includes(kind))return;
    const n={id:uid(),title:kind==='timed'?'每日记录':'消费记录',body:'',table:Tables.create(kind),categoryId:view.type==='category'?view.id:null,tags:view.type==='tag'?[view.id]:[],pinned:false,createdAt:now(),updatedAt:now(),deletedAt:null};
    data.notes.unshift(n);
    placeNewNote(n);reordering=false;
    if(view.type==='trash')view={type:'all',id:null};
    search='';$('search').value='';selectedId=n.id;
    markChanged();renderAll();closeSidebar();$('app').classList.add('show-editor');
    $('modal').close();$('noteTitle').focus();$('noteTitle').select();
  }
  function commitTag() {
    const n=selected(), raw=$('tagInput').value;
    if(!n||n.deletedAt||!raw.trim())return;
    const additions=raw.split(/[,，;；\n]/).map(t=>t.trim().replace(/^#+\s*/, '').slice(0,30)).filter(Boolean);
    const tags=[...new Set([...n.tags,...additions])].slice(0,30);
    $('tagInput').value='';
    if(JSON.stringify(tags)!==JSON.stringify(n.tags)){updateNote({tags});renderNav();renderEditorTags(n);}
  }
  function recordHistory(id,value) {
    const h=history.get(id)||{undo:[],redo:[],last:null};
    if(h.last!==value){h.undo.push(value);if(h.undo.length>100)h.undo.shift();h.redo=[];h.last=value;}
    history.set(id,h);
  }
  function historyAction(redo=false) {
    const n=selected();if(!n||n.deletedAt)return;
    const h=history.get(n.id);if(!h)return;
    const from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;
    if(!from.length)return;
    to.push(bodySnapshot(n));const value=JSON.parse(from.pop());h.last=null;
    updateNote(value);$('noteBody').innerHTML=value.bodyHtml;editorRange=null;pendingFontSize=null;restoreRange();rememberRange();syncToolbar();
  }
  function insertText(text,line=false) {
    const n=selected();if(!n||n.deletedAt)return;
    restoreRange();
    if(line){
      const selection=window.getSelection(),range=selection.getRangeAt(0).cloneRange();range.collapse(true);
      selection.removeAllRanges();selection.addRange(range);selection.modify('move','backward','lineboundary');rememberRange();
    }
    formatText('insertText',text);
  }
  function closeMenu(){ $('noteMenu').hidden=true;document.querySelector('[data-action="note-menu"]').setAttribute('aria-expanded','false'); }
  function closeSidebar(){$('app').classList.remove('sidebar-open');$('drawerShade').hidden=true;if(categoryReordering){categoryReordering=false;if(data)renderNav();}}
  function showModal(html,cleanup=null) {modalCleanup?.();modalCleanup=cleanup;$('modalContent').innerHTML=html;if(!$('modal').open)$('modal').showModal();icons();}
  function modalHead(title){return `<div class="modal-head"><h2>${escape(title)}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="关闭">${icon('x')}</button></div>`;}
  function confirmDialog(title,message,onConfirm,label='确认',danger=false,onCancel=null) {
    let accepted=false;
    showModal(`${modalHead(title)}<div class="modal-body"><p class="confirm-message">${escape(message)}</p><div class="modal-footer"><button class="secondary" data-action="close-modal">取消</button><button class="${danger?'secondary danger':'primary'}" id="confirmAction">${escape(label)}</button></div></div>`,()=>{if(!accepted)onCancel?.();});
    $('confirmAction').onclick=async()=>{accepted=true;$('modal').close();try{await onConfirm();}catch(error){toast(error.message||'操作失败');}};
  }
  function categoryDialog(id=null,parentId=null) {
    const c=id?category(id):null;categoryDraftColor=c?.color||category(parentId)?.color||COLORS[0];
    showModal(`${modalHead(c?'编辑分类':'新建分类')}<form class="modal-body" id="categoryForm"><label class="field-label" for="categoryName">分类名称</label><input class="field" id="categoryName" maxlength="40" required value="${escape(c?.name||'')}" autocomplete="off"><label class="field-label" for="categoryParent">上级分类</label><select class="field" id="categoryParent">${categoryOptions(c?.parentId||parentId,c?descendants(c.id):new Set()).replace('未分类','无 · 顶级分类')}</select><label class="field-label">分类颜色</label><div class="swatches">${COLORS.map(color=>`<button type="button" class="swatch${color===categoryDraftColor?' active':''}" data-color="${color}" style="background:${color};color:${color}" aria-label="${({'#668e75':'绿色','#718eac':'蓝色','#bd9b57':'黄色','#a8869c':'紫色','#849b59':'草绿','#bf8675':'珊瑚'})[color]}" aria-pressed="${color===categoryDraftColor}"></button>`).join('')}</div><p id="categoryError" class="form-error" role="alert"></p><div class="modal-footer">${c?`<button type="button" class="text-button danger" id="deleteCategory" style="margin-right:auto">删除分类</button><button type="button" class="secondary" id="addChild">添加子分类</button>`:'<button type="button" class="secondary" data-action="close-modal">取消</button>'}<button class="primary" type="submit">保存</button></div></form>`);
    $('categoryForm').onsubmit=e=>{
      e.preventDefault();const name=$('categoryName').value.trim(),parent=$('categoryParent').value||null;
      if(!name)return;
      if(data.categories.some(x=>x.id!==id&&x.parentId===parent&&x.name===name)){$('categoryError').textContent='同级分类中已存在这个名称';return;}
      if(c)Object.assign(c,{name,parentId:parent,color:categoryDraftColor});else data.categories.push({id:uid(),name,parentId:parent,color:categoryDraftColor});
      if(parent)expanded.add(parent);markChanged();renderAll();$('modal').close();toast('分类已保存');
    };
    if(c){
      $('addChild').onclick=()=>categoryDialog(null,c.id);
      $('deleteCategory').onclick=()=>{
        const set=descendants(c.id),count=data.notes.filter(n=>set.has(n.categoryId)).length;
        confirmDialog('删除分类',`删除「${c.name}」及其 ${set.size-1} 个子分类，${count} 篇笔记将移入「未分类」。`,()=>{
          for(const n of data.notes)if(set.has(n.categoryId))n.categoryId=null;
          data.categories=data.categories.filter(x=>!set.has(x.id));
          pruneOrders();reordering=false;
          if(view.type==='category'&&set.has(view.id))view={type:'uncategorized',id:null};
          markChanged();renderAll();toast('分类已删除');
        },'删除分类',true);
      };
    }
    setTimeout(()=>$('categoryName')?.focus(),0);
  }
  function settingsDialog(tab='general') {
    const locked=!!vaultSession;
    let content='';
    if(tab==='general')content=`<div class="setting-row"><span>${icon('notebook-text')}笔记</span><b class="setting-value">${activeNotes().length} 篇</b></div><div class="setting-row"><span>${icon('folders')}分类</span><b class="setting-value">${data.categories.length} 个</b></div><div class="setting-row"><span>${icon('hard-drive')}存储位置</span><b class="setting-value">当前浏览器 · 此设备</b></div><div class="setting-row"><span>${icon('timer')}闲置自动锁定</span><select id="autoLock" class="setting-select" aria-label="闲置自动锁定"${locked?'':' disabled'}>${[[1,'1 分钟'],[5,'5 分钟'],[15,'15 分钟'],[30,'30 分钟'],[0,'不自动锁定']].map(([value,label])=>`<option value="${value}"${data.settings.autoLock===value?' selected':''}>${label}</option>`).join('')}</select></div><p>${locked?'密码锁已启用':'尚未设置密码锁'}</p><div class="modal-footer"><button class="secondary" data-action="close-modal">完成</button></div>`;
    if(tab==='security'){
      const recoveryReady=!!vaultSession?.envelope.recovery;
      const passwordForm=`<form id="passwordForm">${locked?'<label class="field-label" for="currentPassword">当前密码</label><input class="field" type="password" id="currentPassword" autocomplete="current-password" maxlength="128" required>':''}<label class="field-label" for="newPassword">${locked?'新密码':'设置密码'}</label><input class="field" id="newPassword" type="password" autocomplete="new-password" minlength="4" maxlength="128" required placeholder="至少 4 位"><label class="field-label" for="confirmPassword">确认密码</label><input class="field" id="confirmPassword" type="password" autocomplete="new-password" minlength="4" maxlength="128" required>${!locked?'<label class="check-label"><input type="checkbox" id="createRecovery" checked>同时生成备用恢复码</label>':''}<p class="password-warning">${recoveryReady?'忘记密码时，可用已保存的恢复码重设密码。':'请保存备用恢复码；未设置恢复码时，忘记密码将无法解锁。'}</p><p class="form-error" id="passwordError" role="alert"></p><div class="modal-footer">${locked?'<button class="text-button danger" type="button" id="removePassword" style="margin-right:auto">关闭密码锁</button>':''}<button class="primary" type="submit" id="passwordSubmit">${locked?'更改密码':'启用密码锁'}</button></div></form>`;
      content=`<div class="security-status">${icon(locked?'shield-check':'shield')}<span>${locked?'密码锁已启用 · AES-256 加密':'密码锁未启用'}</span></div>${locked?`<details class="security-options recovery-options"><summary>${icon('key-round')}备用恢复码<span>${recoveryReady?'已设置':'未设置'}</span></summary><p>${recoveryReady?'重新生成后，旧码无法解锁当前记录；旧备份仍需使用对应的恢复码。':'恢复码只显示一次，请单独保存。'}</p><form id="recoverySetupForm"><label class="field-label" for="recoveryCurrentPassword">当前密码</label><input class="field" type="password" id="recoveryCurrentPassword" autocomplete="current-password" maxlength="128" required><p class="form-error" id="recoverySetupError" role="alert"></p><div class="modal-footer"><button class="primary" id="generateRecovery" type="submit">${icon(recoveryReady?'refresh-cw':'key-round')}${recoveryReady?'重新生成恢复码':'生成恢复码'}</button></div></form></details><details class="security-options" id="passwordOptions"><summary>${icon('lock-keyhole')}修改密码</summary>${passwordForm}</details>`:passwordForm}`;
    }
    if(tab==='backup')content=`<div class="security-status">${icon('archive')}<span>${activeNotes().length} 篇笔记 · ${data.categories.length} 个分类${locked?' · 已加密':''}</span></div><div class="backup-buttons"><button class="backup-button" data-action="export-backup">${icon('download')}<span><b>导出备份</b><small>${locked?'加密 JSON 文件':'JSON 文件'}</small></span></button><button class="backup-button" data-action="import-backup">${icon('upload')}<span><b>导入备份</b><small>恢复笔记与分类</small></span></button></div><p class="password-warning">清除浏览器数据会移除本地笔记，请定期保留备份。</p><div class="modal-footer"><button class="secondary" data-action="close-modal">完成</button></div>`;
    if(tab==='editor'){
      const s=data.settings.editor||DEFAULT_EDITOR;
      content=`<div class="setting-row"><span>${icon('type')}默认字体</span><select id="defaultFont" class="setting-select" aria-label="默认字体">${[['system','系统字体'],['serif','衬线字体'],['mono','等宽字体']].map(([value,label])=>`<option value="${value}"${s.fontFamily===value?' selected':''}>${label}</option>`).join('')}</select></div><div class="setting-row"><span>${icon('a-large-small')}默认字号</span><select id="defaultSize" class="setting-select" aria-label="默认字号">${FONT_SIZES.map(value=>`<option value="${value}"${s.fontSize===value?' selected':''}>${value}</option>`).join('')}</select></div><div class="setting-row editor-color-setting"><span>${icon('palette')}默认文字颜色</span><div class="text-swatches">${TEXT_COLORS.map(([color,label])=>`<button class="text-swatch${s.color===color?' active':''}" data-default-color="${color}" style="background:${color}" aria-label="默认${label}" title="${label}" aria-pressed="${s.color===color}"></button>`).join('')}</div></div><div class="setting-row"><span>${icon('space')}行距</span><select id="defaultLineHeight" class="setting-select" aria-label="行距">${[1.4,1.6,1.8,2,2.2].map(value=>`<option value="${value}"${s.lineHeight===value?' selected':''}>${value}</option>`).join('')}</select></div><div class="modal-footer"><button class="secondary" data-action="reset-editor">恢复默认</button><button class="primary" data-action="close-modal">完成</button></div>`;
    }
    showModal(`${modalHead('设置')}<div class="modal-tabs" role="tablist" aria-label="设置">${[['general','常规'],['editor','编辑'],['security','密码锁'],['backup','备份']].map(([value,label])=>`<button role="tab" aria-selected="${tab===value}" class="${tab===value?'active':''}" data-settings-tab="${value}">${label}</button>`).join('')}</div><div class="modal-body">${content}</div>`);
    if(ANDROID) {
      const location=$('modalContent').querySelectorAll('.setting-value')[2];
      if(tab==='general'&&location)location.textContent='此手机 · 应用私有目录';
      const warning=$('modalContent').querySelector('.password-warning');
      if(tab==='backup'&&warning)warning.textContent='卸载应用或清除应用数据会移除笔记，请保留备份。';
    }
    if(tab==='general')$('autoLock').onchange=()=>{data.settings.autoLock=Number($('autoLock').value);markChanged();armLock();};
    if(tab==='editor'){
      for(const [id,key] of [['defaultFont','fontFamily'],['defaultSize','fontSize'],['defaultLineHeight','lineHeight']])$(id).onchange=()=>{data.settings.editor[key]=key==='fontFamily'?$(id).value:Number($(id).value);markChanged();applyEditorDefaults();};
    }
    if(tab==='security'){
      $('passwordForm').onsubmit=changePassword;
      if(locked){
        $('removePassword').onclick=removePassword;$('recoverySetupForm').onsubmit=generateRecovery;
        document.querySelectorAll('.security-options').forEach(section=>section.addEventListener('toggle',()=>{
          if(!section.open)return;
          for(const other of document.querySelectorAll('.security-options'))if(other!==section){other.open=false;other.querySelectorAll('input[type="password"]').forEach(input=>input.value='');}
        }));
      }
    }
  }
  function beginSecurity() {
    if(securityBusy||locking)return false;
    securityBusy=true;clearTimeout(lockTimer);$('app').dataset.busy='true';$('app').inert=true;$('lockScreen').inert=true;$('modalContent').inert=true;
    return true;
  }
  async function endSecurity() {
    securityBusy=false;$('app').dataset.busy='false';$('app').inert=false;$('lockScreen').inert=false;$('modalContent').inert=false;
    if(pauseRequested){pauseRequested=false;if(vaultSession)await lockNotes();else $('modal').close();}
    else armLock();
  }
  function newPasswordValue(passwordId,confirmationId,errorId) {
    const password=$(passwordId).value;
    if(password.length<4||password.length>128){$(errorId).textContent='密码需要 4 到 128 位';return null;}
    if(password!==$(confirmationId).value){$(errorId).textContent='两次输入的密码不一致';return null;}
    return password;
  }
  async function checkCurrentPassword(fieldId='currentPassword',errorId='passwordError') {
    if(!$(fieldId).value){$(errorId).textContent='请输入当前密码';return false;}
    try{const result=await decrypt(activeVault,$(fieldId).value);Vault.clearSession(result.session);return true;}
    catch{$(errorId).textContent='当前密码不正确';return false;}
  }
  async function changePassword(event) {
    event.preventDefault();
    const button=$('passwordSubmit'),password=newPasswordValue('newPassword','confirmPassword','passwordError');
    if(password===null||!beginSecurity())return;
    const wasLocked=!!vaultSession;
    let candidate=null,code=!wasLocked&&$('createRecovery').checked?Vault.generateCode():null;
    button.disabled=true;button.textContent='正在保存...';
    try {
      await saveNow();
      if(wasLocked&&!await checkCurrentPassword())return;
      candidate=wasLocked?await Vault.rewrapPassword(vaultSession,password):await Vault.createSession(password,code);
      await persistState(data,candidate);setSession(candidate);candidate=null;
      savedRev=editRev;renderEditorFooter();renderSaveStatus();
      if(code)showRecoveryCode(code);else $('modal').close();
      toast(wasLocked?'密码已更改':'密码锁已启用');
    } catch{$('passwordError').textContent='设置失败，原密码设置仍有效，请检查存储空间';}
    finally{if(candidate?.bytes!==vaultSession?.bytes)Vault.clearSession(candidate);code=null;button.disabled=false;button.textContent=wasLocked?'更改密码':'启用密码锁';await endSecurity();}
  }
  async function generateRecovery(event) {
    event.preventDefault();
    if(!beginSecurity())return;
    const button=$('generateRecovery');button.disabled=true;
    $('recoverySetupError').textContent='';
    let candidate=null,code=null;
    try {
      await saveNow();
      if(!await checkCurrentPassword('recoveryCurrentPassword','recoverySetupError'))return;
      code=Vault.generateCode();candidate=await Vault.createSession($('recoveryCurrentPassword').value,code);
      await persistState(data,candidate);setSession(candidate);candidate=null;
      savedRev=editRev;renderSaveStatus();showRecoveryCode(code);
    } catch{$('recoverySetupError').textContent='恢复码生成失败，原密码和恢复码仍有效';}
    finally{Vault.clearSession(candidate);code=null;button.disabled=false;await endSecurity();}
  }
  function showRecoveryCode(code) {
    showModal(`${modalHead('保存备用恢复码')}<div class="modal-body"><p>恢复码只显示这一次。请单独保存，它可以解锁全部记录。</p><textarea class="field recovery-code" id="generatedRecoveryCode" readonly aria-label="备用恢复码" rows="2" spellcheck="false">${escape(code)}</textarea><div class="recovery-code-actions"><button class="secondary" id="copyRecoveryCode">${icon('copy')}复制</button><button class="secondary" id="exportRecoveryCode">${icon('download')}保存文件</button></div><label class="check-label"><input type="checkbox" id="recoverySaved">我已单独保存恢复码</label><div class="modal-footer"><button class="primary" id="recoveryDone" data-action="close-modal" disabled>完成</button></div></div>`,()=>{code='';});
    $('recoverySaved').onchange=()=>{$('recoveryDone').disabled=!$('recoverySaved').checked;};
    $('copyRecoveryCode').onclick=async()=>{
      try{
        if(ANDROID&&window.QingjiAndroid.copyRecoveryCode){if(!window.QingjiAndroid.copyRecoveryCode(code))throw Error();}
        else await navigator.clipboard.writeText(code);
        toast('恢复码已复制');
      }catch{toast('复制失败，可使用保存文件');}
    };
    $('exportRecoveryCode').onclick=async()=>{
      const button=$('exportRecoveryCode');button.disabled=true;
      try{if(await download(`轻记恢复码-${new Date().toLocaleDateString('sv-SE')}.txt`,`轻记备用恢复码\n\n${code}\n\n此码可以解锁全部记录，请与笔记备份分开保存。\n旧备份需要使用导出时对应的恢复码。\n`,'text/plain;charset=utf-8'))toast('恢复码文件已保存');}
      catch(error){toast(error.message||'保存文件失败');}finally{button.disabled=false;}
    };
  }
  async function removePassword() {
    if(!beginSecurity())return;
    try{
      await saveNow();
      if(!await checkCurrentPassword())return;
      confirmDialog('关闭密码锁','关闭后，此设备上的笔记将以未加密形式保存。',async()=>{
        if(!beginSecurity())return;
        try{await saveNow();await persistState(data,null);setSession(null);savedRev=editRev;renderEditorFooter();renderSaveStatus();toast('密码锁已关闭');}
        finally{await endSecurity();}
      },'关闭密码锁');
    }catch(error){toast(error.message);}finally{await endSecurity();}
  }
  function armLock() {
    clearTimeout(lockTimer);
    if(!securityBusy&&vaultSession&&data?.settings.autoLock)lockTimer=setTimeout(()=>lockNotes().catch(()=>{}),data.settings.autoLock*60000);
  }
  async function lockNotes() {
    if(securityBusy){pauseRequested=true;return;}
    if(locking)return;
    if(!vaultSession){if(data)settingsDialog('security');return;}
    locking=true;
    commitTag();
    $('app').inert=true;$('modalContent').inert=true;
    try{await saveNow();}catch{locking=false;$('app').inert=false;$('modalContent').inert=false;toast('保存失败，暂未锁定；请先导出备份');return;}
    clearTimeout(lockTimer);clearTimeout(saveTimer);history.clear();
    Tables.clear();
    setEditorTools(false);toolsNoteId=null;
    closeSidebar();closeMenu();$('app').classList.remove('show-editor');
    setSession(null);data=null;selectedId=null;reordering=false;categoryReordering=false;
    $('app').hidden=true;$('lockScreen').hidden=false;
    $('modal').close();modalCleanup?.();modalCleanup=null;$('modalContent').innerHTML='';
    $('search').value='';$('noteTitle').value='';$('noteBody').innerHTML='';$('tagInput').value='';editorRange=null;pendingFontSize=null;closeTextColor();
    ['noteList','categoryTree','tagNav','editorTags','tagSuggestions','noteCategory','mainNav'].forEach(id=>$(id).innerHTML='');
    ['editorTrail','noteDate','createdDate','editorUpdated','charCount','viewTitle','viewCount','listLabel','listFooter','tagTotal'].forEach(id=>$(id).textContent='');
    search='';view={type:'all',id:null};expanded.clear();
    $('toast').hidden=true;$('unlockPassword').value='';$('unlockError').textContent='';
    $('unlockPassword').type='password';icons();$('unlockPassword').focus();
    locking=false;$('app').inert=false;$('modalContent').inert=false;
  }
  function refreshLockedVault() {
    const raw=readStorage();
    if(raw!==lastRaw){const vault=validateVault(JSON.parse(raw));lastRaw=raw;activeVault=vault;}
    return activeVault;
  }
  function showUnlocked(result) {
    data=result.data;setSession(result.session);savedRev=editRev;
    $('unlockPassword').value='';$('unlockError').textContent='';$('lockScreen').hidden=true;$('app').hidden=false;
    conflict=false;saveError='';reordering=false;categoryReordering=false;search='';$('search').value='';view={type:'all',id:null};
    expanded=new Set(data.categories.filter(c=>c.parentId===null).map(c=>c.id));
    selectedId=filteredNotes()[0]?.id||null;renderAll();
  }
  async function unlock(event) {
    event.preventDefault();if(!beginSecurity())return;
    const button=$('unlockButton'),password=$('unlockPassword').value;button.disabled=true;$('unlockError').textContent='';
    let result=null,stage='decrypt';
    try{
      if(!refreshLockedVault().encrypted){location.reload();return;}
      result=await decrypt(activeVault,password);stage='save';
      if(result.migrated)await persistState(result.data,result.session);
      showUnlocked(result);result=null;
    }catch{$('unlockError').textContent=stage==='decrypt'?'密码不正确，或备份数据已损坏':'升级保存失败，原密码仍有效，请检查存储空间';$('unlockPassword').select();}
    finally{Vault.clearSession(result?.session);button.disabled=false;await endSecurity();}
  }
  function forgotPassword() {
    const vault=refreshLockedVault();
    if(!vault.encrypted){location.reload();return;}
    if(!vault.recovery){
      showModal(`${modalHead('尚未设置恢复码')}<div class="modal-body"><p>需要先用原密码解锁，再到「设置 → 密码锁」生成备用恢复码。未提前设置时，无法绕过加密恢复记录。</p><div class="modal-footer"><button class="primary" data-action="close-modal">返回</button></div></div>`);return;
    }
    showModal(`${modalHead('用恢复码重设密码')}<form class="modal-body" id="recoveryForm"><label class="field-label" for="recoveryCode">备用恢复码</label><textarea class="field recovery-code" id="recoveryCode" rows="2" spellcheck="false" autocomplete="off" required></textarea><label class="field-label" for="recoveryPassword">新密码</label><input class="field" id="recoveryPassword" type="password" autocomplete="new-password" minlength="4" maxlength="128" required><label class="field-label" for="recoveryConfirm">确认新密码</label><input class="field" id="recoveryConfirm" type="password" autocomplete="new-password" minlength="4" maxlength="128" required><p class="form-error" id="recoveryError" role="alert"></p><div class="modal-footer"><button type="button" class="secondary" data-action="close-modal">取消</button><button class="primary" type="submit" id="recoverySubmit">${icon('unlock-keyhole')}重设并解锁</button></div></form>`);
    $('recoveryForm').onsubmit=resetPassword;
  }
  async function resetPassword(event) {
    event.preventDefault();
    const password=newPasswordValue('recoveryPassword','recoveryConfirm','recoveryError');
    let code;
    try{code=Vault.normalizeCode($('recoveryCode').value);}catch(error){$('recoveryError').textContent=error.message;return;}
    if(password===null||!beginSecurity())return;
    const button=$('recoverySubmit');button.disabled=true;
    let result=null,stage='decrypt';
    try {
      result=await decrypt(refreshLockedVault(),code,true);stage='save';
      result.session=await Vault.rewrapPassword(result.session,password);
      await persistState(result.data,result.session);
      showUnlocked(result);result=null;$('modal').close();toast('密码已重设，恢复码仍可使用');
    } catch{$('recoveryError').textContent=stage==='decrypt'?'恢复码不正确，或数据已损坏':'密码重设未保存，原密码和恢复码仍有效，请检查存储空间';}
    finally{Vault.clearSession(result?.session);code=null;button.disabled=false;await endSecurity();}
  }
  function download(filename,text,type='application/json') {
    if(ANDROID) {
      return new Promise((resolve,reject)=>{
        const requestId=uid();documentRequests.set(requestId,{resolve,reject});
        try{window.QingjiAndroid.saveDocument(requestId,filename,type.split(';')[0],text);}
        catch(error){documentRequests.delete(requestId);reject(error);}
      });
    }
    const url=URL.createObjectURL(new Blob([text],{type}));
    const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
    return Promise.resolve(true);
  }
  async function exportBackup() {
    commitTag();
    let vault;
    if(conflict||saveError){vault=await makeVault(clone(data),vaultSession);}
    else{await saveNow();vault=activeVault;}
    if(await download(`轻记备份-${new Date().toLocaleDateString('sv-SE')}${vault.encrypted?'-加密':''}.json`,JSON.stringify(vault,null,2)))toast('备份已保存');
  }
  async function importFile(file) {
    if(!file)return;
    if(file.size>22000000){toast('备份文件过大，最大支持 22 MB');return;}
    let vault;
    try{vault=validateVault(JSON.parse(await file.text()));}catch(error){toast(error.message||'备份文件无法读取');return;}
    const restore=async(result)=>{
      const incoming=validateData(result.data);
      confirmDialog('导入备份',`备份含 ${incoming.notes.length} 篇笔记、${incoming.categories.length} 个分类。导入将替换当前全部笔记及密码设置。`,async()=>{
        if(!beginSecurity()){Vault.clearSession(result.session);return;}
        try {
          await saveNow();await persistState(incoming,result.session);
          history.clear();editRev++;showUnlocked({data:incoming,session:result.session});result.session=null;
          toast('备份已导入');
        } finally {Vault.clearSession(result.session);result.session=null;await endSecurity();}
      },'替换并导入',false,()=>{Vault.clearSession(result.session);result.session=null;});
    };
    if(!vault.encrypted){await restore({data:vault.data,session:null});return;}
    const showImport=(useRecovery=false)=>{
      showModal(`${modalHead('导入加密备份')}<form class="modal-body" id="importPasswordForm">${vault.recovery?`<div class="import-modes" role="tablist" aria-label="备份解锁方式"><button type="button" role="tab" aria-selected="${!useRecovery}" data-import-mode="password">${icon('lock-keyhole')}密码</button><button type="button" role="tab" aria-selected="${useRecovery}" data-import-mode="recovery">${icon('key-round')}恢复码</button></div>`:''}${useRecovery?'<label for="importRecoveryCode" class="field-label">备份恢复码</label><textarea id="importRecoveryCode" class="field recovery-code" rows="2" spellcheck="false" autocomplete="off" required></textarea><label for="importRecoveryPassword" class="field-label">新密码</label><input id="importRecoveryPassword" class="field" type="password" autocomplete="new-password" minlength="4" maxlength="128" required><label for="importRecoveryConfirm" class="field-label">确认新密码</label><input id="importRecoveryConfirm" class="field" type="password" autocomplete="new-password" minlength="4" maxlength="128" required>':'<label for="importPassword" class="field-label">备份密码</label><input id="importPassword" type="password" class="field" autocomplete="off" required>'}<p class="form-error" id="importError" role="alert"></p><div class="modal-footer"><button type="button" class="secondary" data-action="close-modal">取消</button><button class="primary" type="submit" id="decryptImport">解密备份</button></div></form>`);
      document.querySelectorAll('[data-import-mode]').forEach(button=>button.onclick=()=>showImport(button.dataset.importMode==='recovery'));
      $('importPasswordForm').onsubmit=async e=>{
        e.preventDefault();
        const password=useRecovery?newPasswordValue('importRecoveryPassword','importRecoveryConfirm','importError'):null;
        if((useRecovery&&password===null)||!beginSecurity())return;
        const button=$('decryptImport');button.disabled=true;
        let result=null;
        try{
          result=await decrypt(vault,useRecovery?$('importRecoveryCode').value:$('importPassword').value,useRecovery);
          if(useRecovery)result.session=await Vault.rewrapPassword(result.session,password);
          await restore(result);result=null;
        }catch{if($('importError'))$('importError').textContent=useRecovery?'恢复码不正确，或备份数据已损坏':'密码不正确，或备份数据已损坏';}
        finally{Vault.clearSession(result?.session);button.disabled=false;await endSecurity();}
      };
    };
    showImport();
  }
  function showConflict() {
    if(conflict)return;conflict=true;clearTimeout(saveTimer);
    showModal(`${modalHead('笔记已在其他窗口更新')}<div class="modal-body"><p>请先保留当前窗口的内容，再载入最新笔记。</p><div class="conflict-actions"><button class="secondary" id="exportConflict">导出当前内容</button><button class="primary" id="reloadConflict">载入最新笔记</button></div></div>`);
    $('exportConflict').onclick=()=>exportBackup().catch(e=>toast(e.message));
    $('reloadConflict').onclick=()=>location.reload();
  }
  function removeSelected(permanent=false) {
    const n=selected();if(!n)return;
    if(permanent){data.notes=data.notes.filter(x=>x.id!==n.id);history.delete(n.id);pruneOrders();}else{n.deletedAt=now();}
    selectedId=filteredNotes()[0]?.id||null;markChanged();renderAll();toast(permanent?'笔记已永久删除':'笔记已移到回收站');
  }
  const actions = {
    'new-note':newNote,'new-category':()=>categoryDialog(null,view.type==='category'?view.id:null),
    'open-sidebar':()=>{$('app').classList.add('sidebar-open');$('drawerShade').hidden=false;},'close-sidebar':closeSidebar,
    'back-list':()=>{setEditorTools(false);$('app').classList.remove('show-editor');},
    'toggle-editor-tools':()=>setEditorTools($('editorTools').hidden),
    'toggle-reorder':()=>{if(canReorder()){reordering=!reordering;renderList();}},
    'toggle-category-order':()=>{categoryReordering=!categoryReordering;renderNav();},
    'forgot-password':forgotPassword,
    'settings':()=>{commitTag();closeSidebar();settingsDialog();},'lock':lockNotes,
    'pin':()=>{const n=selected();if(!n||n.deletedAt)return;closeMenu();updateNote({pinned:!n.pinned});renderNav();renderEditor();},
    'export-note':async()=>{closeMenu();const n=selected();if(n&&await download(`${(n.title||'未命名表格').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')}.txt`,`${n.title||'未命名表格'}\n\n${Tables.text(n.table)}${n.body?`\n\n原笔记\n${n.body}`:''}`,'text/plain;charset=utf-8'))toast('文本已导出');},
    'note-menu':()=>{const open=$('noteMenu').hidden;$('noteMenu').hidden=!open;document.querySelector('[data-action="note-menu"]').setAttribute('aria-expanded',open);},
    'duplicate':()=>{const n=selected();if(!n)return;const copy={...clone(n),id:uid(),title:`${n.title||'未命名笔记'}（副本）`.slice(0,200),deletedAt:null,createdAt:now(),updatedAt:now()};data.notes.unshift(copy);placeNewNote(copy);reordering=false;selectedId=copy.id;if(view.type==='trash')view={type:'all',id:null};markChanged();closeMenu();renderAll();toast('笔记已复制');},
    'delete-note':()=>{commitTag();closeMenu();removeSelected();},
    'restore':()=>{const n=selected();if(!n)return;n.deletedAt=null;selectedId=filteredNotes()[0]?.id||null;markChanged();renderAll();toast('笔记已恢复');},
    'permanent-delete':()=>confirmDialog('永久删除笔记','此笔记将永久删除，无法恢复。',()=>removeSelected(true),'永久删除',true),
    'empty-trash':()=>{const count=data.notes.filter(n=>n.deletedAt).length;confirmDialog('清空回收站',`永久删除回收站中的 ${count} 篇笔记，无法恢复。`,()=>{data.notes=data.notes.filter(n=>!n.deletedAt);pruneOrders();selectedId=null;history.clear();markChanged();renderAll();toast('回收站已清空');},'永久删除',true);},
    'insert-list':()=>insertText('• ',true),'insert-task':()=>insertText('☐ ',true),'insert-date':()=>insertText(date(now(),{year:'numeric',month:'long',day:'numeric'})),
    'bold':()=>formatText('bold'),'italic':()=>formatText('italic'),'underline':()=>formatText('underline'),
    'highlight':()=>{restoreRange();formatText('hiliteColor',colorHex(document.queryCommandValue('hiliteColor'),'')==='#fff1a8'?'transparent':'#fff1a8');},
    'clear-format':()=>formatText('removeFormat'),'text-color':colorMenu,
    'editor-settings':()=>{rememberRange();settingsDialog('editor');},
    'reset-editor':()=>{data.settings.editor={...DEFAULT_EDITOR};markChanged();applyEditorDefaults();settingsDialog('editor');},
    'undo':()=>historyAction(),'redo':()=>historyAction(true),'close-modal':()=>{$('modal').close();},
    'export-backup':exportBackup,'import-backup':()=>{if(ANDROID){window.QingjiAndroid.openBackup();return;}$('importFile').value='';$('importFile').click();},
    'show-password':()=>{const field=$('unlockPassword'),visible=field.type==='password';field.type=visible?'text':'password';const button=document.querySelector('[data-action="show-password"]');button.setAttribute('aria-label',visible?'隐藏密码':'显示密码');button.title=visible?'隐藏密码':'显示密码';button.innerHTML=icon(visible?'eye-off':'eye');icons();}
  };
  document.addEventListener('click',async event=>{
    if(securityBusy||locking)return;
    const button=event.target.closest('button');
    if(!event.target.closest('.menu-anchor'))closeMenu();
    if(!event.target.closest('.color-anchor'))closeTextColor();
    if(!button||button.disabled)return;
    try{
      if(button.dataset.action){if(!data&&!['show-password','forgot-password','close-modal'].includes(button.dataset.action))return;await actions[button.dataset.action]?.();}
      else if(button.dataset.view)chooseView(button.dataset.view);
      else if(button.dataset.category)chooseView('category',button.dataset.category);
      else if(button.dataset.expand){const id=button.dataset.expand;expanded.has(id)?expanded.delete(id):expanded.add(id);renderNav();}
      else if(button.dataset.editCategory)categoryDialog(button.dataset.editCategory);
      else if(button.dataset.tag)chooseView('tag',button.dataset.tag);
      else if(button.dataset.note)selectNote(button.dataset.note);
      else if(button.dataset.moveNote)moveNote(button.dataset.moveNote,Number(button.dataset.direction));
      else if(button.dataset.moveCategory)moveCategory(button.dataset.moveCategory,Number(button.dataset.direction));
      else if(button.dataset.removeTag){const n=selected();updateNote({tags:n.tags.filter(t=>t!==button.dataset.removeTag)});renderNav();renderEditorTags(n);}
      else if(button.dataset.color){categoryDraftColor=button.dataset.color;document.querySelectorAll('.swatch').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button);});}
      else if(button.dataset.textColor)formatText('foreColor',button.dataset.textColor);
      else if(button.dataset.defaultColor){data.settings.editor.color=button.dataset.defaultColor;markChanged();applyEditorDefaults();settingsDialog('editor');}
      else if(button.dataset.settingsTab)settingsDialog(button.dataset.settingsTab);
      else if(button.dataset.createTable)createTable(button.dataset.createTable);
      else if(button.dataset.tableView)chooseView(button.dataset.tableView);
    }catch(error){toast(error.message||'操作未完成');}
  });
  $('drawerShade').onclick=closeSidebar;
  $('unlockForm').onsubmit=unlock;
  $('noteTitle').addEventListener('input',()=>updateNote({title:$('noteTitle').value}));
  $('noteBody').addEventListener('beforeinput',event=>{
    const n=selected();if(!n||n.deletedAt)return;
    if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){event.preventDefault();historyAction(event.inputType==='historyRedo');return;}
    if(!composing)recordHistory(n.id,bodySnapshot(n));
  });
  $('noteBody').addEventListener('input',()=>{if(!composing)syncBody();});
  $('noteBody').addEventListener('compositionstart',()=>{const n=selected();if(n)recordHistory(n.id,bodySnapshot(n));composing=true;});
  $('noteBody').addEventListener('compositionend',()=>{composing=false;syncBody();});
  $('noteBody').addEventListener('paste',event=>{event.preventDefault();const n=selected();if(!n||n.deletedAt)return;rememberRange();formatText('insertText',event.clipboardData.getData('text/plain'));});
  $('noteBody').addEventListener('drop',event=>event.preventDefault());
  $('noteBody').addEventListener('dblclick',()=>{
    const n=selected(),selection=window.getSelection();if(!n||n.deletedAt||!selection.rangeCount)return;
    const node=selection.anchorNode;if(node.nodeType!==Node.TEXT_NODE)return;
    const start=node.nodeValue.lastIndexOf('\n',selection.anchorOffset-1)+1;
    if(/^[☐☑]/.test(node.nodeValue.slice(start,start+1))){recordHistory(n.id,bodySnapshot(n));node.nodeValue=node.nodeValue.slice(0,start)+(node.nodeValue[start]==='☐'?'☑':'☐')+node.nodeValue.slice(start+1);syncBody();}
  });
  document.addEventListener('selectionchange',()=>{rememberRange();syncToolbar();});
  $('writingToolbar').addEventListener('pointerdown',event=>{rememberRange();if(event.target.closest('button'))event.preventDefault();});
  $('editorToolsToggle').addEventListener('pointerdown',event=>{rememberRange();event.preventDefault();});
  $('editorTools').addEventListener('scroll',closeTextColor,{passive:true});
  document.querySelector('.editor-topbar').addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'&&!event.target.closest('button,.popup-menu')&&data&&!$('modal').open)toolsGesture={id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  document.addEventListener('pointerup',event=>{
    if(!toolsGesture||toolsGesture.id!==event.pointerId)return;
    const gesture=toolsGesture;toolsGesture=null;
    const delta=event.clientY-gesture.y;
    if(Math.abs(event.clientX-gesture.x)<40&&Math.abs(delta)>40)setEditorTools(delta>0);
  });
  document.addEventListener('pointercancel',()=>{toolsGesture=null;});
  $('fontSize').onchange=()=>formatText('fontSize',Number($('fontSize').value));
  $('noteCategory').onchange=()=>{updateNote({categoryId:$('noteCategory').value||null});placeNewNote(selected());renderNav();renderList();$('editorTrail').textContent=categoryPath(selected().categoryId);};
  $('tagInput').onkeydown=event=>{if(['Enter',',','，',';','；'].includes(event.key)&&!event.isComposing){event.preventDefault();commitTag();}};
  $('tagInput').onblur=commitTag;
  $('search').oninput=()=>{search=$('search').value;reordering=false;renderList();};
  $('importFile').onchange=()=>importFile($('importFile').files[0]).catch(e=>toast(e.message));
  $('modal').addEventListener('click',event=>{if(!securityBusy&&event.target===$('modal')){const r=$('modal').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('modal').close();}});
  $('modal').addEventListener('cancel',event=>{if(securityBusy)event.preventDefault();});
  $('modal').addEventListener('close',()=>{if($('modal').open)return;modalCleanup?.();modalCleanup=null;$('modalContent').innerHTML='';});
  document.addEventListener('keydown',event=>{
    if(securityBusy||locking){if(event.key==='Escape')event.preventDefault();return;}
    if(event.key==='Escape'){closeMenu();closeTextColor();closeSidebar();setEditorTools(false);}
    if(!data||$('modal').open)return;
    if(event.key==='Escape'&&reordering){reordering=false;renderList();}
    if(event.ctrlKey||event.metaKey){
      if(event.key.toLowerCase()==='s'){event.preventDefault();commitTag();saveNow().catch(()=>{});}
      if(event.key.toLowerCase()==='k'){event.preventDefault();$('app').classList.remove('show-editor');$('search').focus();}
      if(event.key.toLowerCase()==='n'){event.preventDefault();newNote();}
      if(event.key.toLowerCase()==='l'&&event.shiftKey){event.preventDefault();lockNotes();}
      if(event.key.toLowerCase()==='z'&&document.activeElement===$('noteBody')){event.preventDefault();historyAction(event.shiftKey);}
      if(event.key.toLowerCase()==='y'&&document.activeElement===$('noteBody')){event.preventDefault();historyAction(true);}
      if(['b','i','u'].includes(event.key.toLowerCase())&&document.activeElement===$('noteBody')){event.preventDefault();formatText(({b:'bold',i:'italic',u:'underline'})[event.key.toLowerCase()]);}
    }
  });
  for(const type of ['pointerdown','keydown','input'])document.addEventListener(type,()=>{if(Date.now()-lastActive>1000){lastActive=Date.now();armLock();}},{passive:true});
  window.addEventListener('storage',event=>{if(event.key===STORAGE_KEY&&event.newValue!==lastRaw&&data)showConflict();});
  window.addEventListener('beforeunload',event=>{if(data&&(editRev>savedRev||savePending)){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&data&&editRev>savedRev)saveNow().catch(()=>{});
    if(!document.hidden&&data&&vaultSession&&data.settings.autoLock&&Date.now()-lastActive>=data.settings.autoLock*60000)lockNotes();
  });
  if(ANDROID) {
    window.qingjiDocumentResult=(requestId,success,error)=>{
      const pending=documentRequests.get(requestId);if(!pending)return;
      documentRequests.delete(requestId);error?pending.reject(Error(error)):pending.resolve(success);
    };
    window.qingjiReceiveBackup=(text,name)=>importFile(new File([text],name||'轻记备份.json',{type:'application/json'})).catch(error=>toast(error.message));
    window.qingjiNativeError=message=>toast(message);
    window.qingjiAndroidPause=async()=>{
      if(securityBusy){pauseRequested=true;return;}
      if(!data)return;
      composing=false;
      commitTag();
      if(vaultSession)await lockNotes();else await saveNow().catch(()=>{});
    };
    window.qingjiAndroidBack=()=>{
      if(securityBusy||locking)return true;
      if($('modal').open){$('modal').close();return true;}
      if(!$('textColorMenu').hidden){closeTextColor();return true;}
      if(categoryReordering){categoryReordering=false;renderNav();return true;}
      if($('app').classList.contains('sidebar-open')){closeSidebar();return true;}
      if(!$('noteMenu').hidden){closeMenu();return true;}
      if(reordering){reordering=false;renderList();return true;}
      if(!$('editorTools').hidden){setEditorTools(false);return true;}
      if($('app').classList.contains('show-editor')){commitTag();$('app').classList.remove('show-editor');return true;}
      return false;
    };
    document.documentElement.classList.add('android');
  }
  async function boot() {
    icons();
    try{
      lastRaw=readStorage();
      if(lastRaw){activeVault=validateVault(JSON.parse(lastRaw));if(activeVault.encrypted){$('lockScreen').hidden=false;$('unlockPassword').focus();return;}data=validateData(activeVault.data);}
      else data=seed();
      $('app').hidden=false;expanded=new Set(data.categories.filter(c=>c.parentId===null).map(c=>c.id));selectedId=filteredNotes()[0]?.id||null;
      renderAll();if(!lastRaw){editRev++;await saveNow();}
    }catch(error){
      if(data){saveError='保存失败，请导出备份';renderSaveStatus();toast(saveError);return;}
      showModal(`${modalHead('无法读取本地笔记')}<div class="modal-body"><p>本地数据无法读取，原始数据已保留。</p><div class="conflict-actions"><button class="secondary" id="exportRaw">导出原始数据</button><button class="secondary" id="reloadError">重新载入</button></div></div>`);
      $('exportRaw').onclick=()=>download('轻记原始数据.json',lastRaw||'');$('reloadError').onclick=()=>location.reload();
    }
  }
  Tables.init({selected,icons,toast,modal:showModal,modalHead,confirm:confirmDialog,changed:()=>{const n=selected();if(!n||n.deletedAt)return;n.updatedAt=now();markChanged();renderList();renderEditorFooter();}});
  boot();
})();
