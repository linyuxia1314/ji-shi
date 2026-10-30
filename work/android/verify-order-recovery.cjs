const {chromium}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');
const qa=process.env.QINGJI_QA_DIR||'C:/Users/admin/Documents/Codex/2026-10-29/codex-threads-01a18542-03d4-7451-a416/work';
const categories=[{id:'expenses',name:'消费',parentId:null,color:'#668e75'},{id:'daily-cost',name:'日常开销',parentId:'expenses',color:'#668e75'},{id:'fixed-cost',name:'固定支出',parentId:'expenses',color:'#668e75'},{id:'daily',name:'每日记录',parentId:null,color:'#718eac'}];
const makeNote=(id,title,categoryId,day,pinned=false,kind='numbered')=>({id,title,categoryId,pinned,body:'',tags:[],createdAt:`2026-10-${day}T00:00:00Z`,updatedAt:`2026-10-${day}T00:00:00Z`,deletedAt:null,table:{kind,rows:[{id:`row-${id}`,time:'2026-10-29T10:00',description:`${title}项目`,amount:'12+8*2',note:''}]}});
const seed={format:'qingji',version:2,encrypted:false,data:{categories,notes:[makeNote('a','早饭','daily-cost',25),makeNote('b','交通','daily-cost',26,true),makeNote('c','房租','fixed-cost',27),makeNote('d','日记','daily',28,false,'timed')],settings:{autoLock:5}}};
async function openApp(browser,initial){
  const context=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://appassets.androidplatform.net/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.addInitScript(vault=>{
    if(!localStorage.getItem('orderingVault'))localStorage.setItem('orderingVault',JSON.stringify(vault));
    window.__writes=0;
    window.QingjiAndroid={
      readVault:()=>localStorage.getItem('orderingVault'),
      writeVault:raw=>{window.__writes++;if(window.__failWrite||window.__failAt&&window.__writes>=window.__failAt)return false;localStorage.setItem('orderingVault',raw);return true;},
      copyRecoveryCode:code=>{window.__copied=code;return true;},
      saveDocument:(request,name,mime,text)=>{window.__exported={name,mime,text};setTimeout(()=>window.qingjiDocumentResult(request,true,''),5);},
      openBackup:()=>window.qingjiReceiveBackup(window.__exported.text,window.__exported.name)
    };
  },initial);
  await page.goto('https://appassets.androidplatform.net/index.html');
  return {context,page,errors};
}
async function legacyVault(data){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=310000;
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('legacy123'),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(data)));
  return {format:'qingji',version:2,encrypted:true,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),payload:Buffer.from(encrypted).toString('base64'),iterations};
}
async function main(){
  fs.mkdirSync(qa,{recursive:true});
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const {page,errors}=await openApp(browser,seed);
    const action=name=>page.locator(`[data-action="${name}"]:visible`).first();
    const titles=()=>page.locator('.note-card h2 span').allTextContents();
    const raw=()=>page.evaluate(()=>QingjiAndroid.readVault());
    const vault=async()=>JSON.parse(await raw());
    const saved=()=>page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存');
    const back=async()=>{if(await action('back-list').isVisible())await action('back-list').click();};
    const view=async(type,id)=>{await back();await action('open-sidebar').click();await page.waitForTimeout(230);await page.locator(id?`[data-category="${id}"]`:`[data-view="${type}"]`).click();};
    const settings=async(tab,section='password')=>{await back();await action('open-sidebar').click();await page.waitForTimeout(230);await action('settings').click();await page.locator(`[data-settings-tab="${tab}"]`).click();if(tab==='security'&&await page.locator('#passwordOptions').count())await page.locator(section==='recovery'?'.recovery-options summary':'#passwordOptions summary').click();};
    const move=async(id,direction)=>{await page.locator(`[data-move-note="${id}"][data-direction="${direction}"]`).click();};
    const select=async(id)=>{await page.locator(`[data-note="${id}"]`).click();};
    const finishCode=async()=>{const code=await page.locator('#generatedRecoveryCode').inputValue();await page.locator('#recoverySaved').check();await page.locator('#recoveryDone').click();await page.waitForFunction(()=>!document.querySelector('#modal').open&&document.querySelector('#modalContent').innerHTML==='');return code;};
    const lock=async()=>{await page.evaluate(()=>qingjiAndroidPause());await page.locator('#lockScreen').waitFor({state:'visible'});};
    const unlock=async(password)=>{await page.locator('#unlockPassword').fill(password);await page.locator('#unlockButton').click();await page.locator('#app').waitFor({state:'visible'});};
    const recoveryFields=async(code,password)=>{await page.locator('#recoveryCode').fill(code);await page.locator('#recoveryPassword').fill(password);await page.locator('#recoveryConfirm').fill(password);};
    const failCommit=()=>page.evaluate(()=>window.__failAt=window.__writes+2);
    const clearFailure=()=>page.evaluate(()=>{window.__failAt=0;window.__failWrite=false;});
    const close=()=>action('close-modal').click();
    assert.deepEqual(await titles(),['交通','日记','房租','早饭']);assert.equal(await page.locator('[data-move-note]').count(),0);
    await action('toggle-reorder').click();assert.equal(await page.locator('.note-order-row').count(),4);assert.equal(await page.locator('button button').count(),0);
    assert.equal(await page.locator('[data-move-note="b"][data-direction="-1"]').isDisabled(),true);
    for(let i=0;i<3;i++)await move('a',-1);
    assert.deepEqual(await titles(),['早饭','交通','日记','房租']);await saved();
    await page.locator('#search').fill('早饭');assert.equal(await page.locator('#reorderToggle').isVisible(),false);
    await page.locator('#search').fill('');assert.equal(await page.locator('#reorderToggle').getAttribute('aria-pressed'),'false');
    await view('category','expenses');assert.deepEqual(await titles(),['交通','房租','早饭']);
    await action('toggle-reorder').click();await move('a',-1);assert.deepEqual(await titles(),['交通','早饭','房租']);await saved();
    await view('category','daily-cost');assert.deepEqual(await titles(),['交通','早饭']);await action('toggle-reorder').click();await move('a',-1);await saved();
    await view('all');assert.deepEqual(await titles(),['早饭','交通','日记','房租']);
    await page.reload();assert.deepEqual(await titles(),['早饭','交通','日记','房租']);
    await view('category','expenses');assert.deepEqual(await titles(),['交通','早饭','房租']);
    await view('category','daily-cost');assert.deepEqual(await titles(),['早饭','交通']);
    await view('all');await select('a');await action('note-menu').click();await action('delete-note').click();await back();
    assert.deepEqual(await titles(),['交通','日记','房租']);await view('trash');assert.equal(await page.locator('#reorderToggle').isVisible(),false);
    await select('a');await action('restore').click();await view('all');assert.deepEqual(await titles(),['早饭','交通','日记','房租']);await saved();
    await select('b');await action('toggle-editor-tools').click();await page.locator('#noteCategory').selectOption('fixed-cost');await saved();
    await view('category','daily-cost');assert.deepEqual(await titles(),['早饭']);
    await view('all');await select('b');await action('toggle-editor-tools').click();await page.locator('#noteCategory').selectOption('daily-cost');await saved();
    await view('category','daily-cost');assert.deepEqual(await titles(),['早饭','交通']);
    await page.locator('.list-heading [data-action="new-note"]').click();await page.locator('[data-create-table="numbered"]').click();await page.locator('#noteTitle').fill('新增');await saved();
    const newId=(await vault()).data.notes.find(n=>n.title==='新增').id;
    await view('category','daily-cost');assert.deepEqual(await titles(),['新增','早饭','交通']);
    await view('category','expenses');assert.deepEqual(await titles(),['新增','交通','早饭','房租']);
    await view('all');assert.deepEqual(await titles(),['新增','早饭','交通','日记','房租']);
    await select(newId);await action('note-menu').click();await action('delete-note').click();await view('trash');await select(newId);
    await action('permanent-delete').click();await page.locator('#confirmAction').click();await saved();
    assert.ok((await vault()).data.orders.every(order=>!order.ids.includes(newId)));await view('all');
    await page.evaluate(()=>window.__failWrite=true);await action('toggle-reorder').click();await move('a',1);
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存失败'));
    assert.deepEqual((await vault()).data.orders.find(o=>o.key==='all').ids,['a','b','d','c']);
    await clearFailure();await page.locator('#search').press('Control+s');await saved();await page.reload();assert.deepEqual(await titles(),['交通','早饭','日记','房租']);
    await action('toggle-reorder').click();await move('a',-1);await saved();await action('toggle-reorder').click();
    for(const size of [{width:360,height:800},{width:412,height:892},{width:451,height:976},{width:1280,height:800}]){
      await page.setViewportSize(size);await action('toggle-reorder').click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      for(const box of await page.locator('.list-actions,.note-order-controls').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};})))assert.ok(box.left>=0&&box.right<=size.width);
      if(size.width===412)await page.screenshot({path:path.join(qa,'ordering-1.4.png')});await action('toggle-reorder').click();
    }
    await page.setViewportSize({width:412,height:892});
    console.log('PASS independent all/folder/parent ordering, persistence, restore, folder moves, new files, permanent deletion, failed writes, mobile layout');

    await settings('security');await page.locator('#newPassword').fill('first123');await page.locator('#confirmPassword').fill('first123');await failCommit();await page.locator('#passwordSubmit').click();
    await page.waitForFunction(()=>document.querySelector('#passwordError').textContent.includes('设置失败'));
    assert.equal((await vault()).encrypted,false);assert.equal(await page.locator('#generatedRecoveryCode').count(),0);
    await clearFailure();await page.locator('#passwordSubmit').click();await page.locator('#generatedRecoveryCode').waitFor();
    const code1=await page.locator('#generatedRecoveryCode').inputValue();assert.match(code1,/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/);
    assert.ok(!(await raw()).includes(code1));assert.ok(!(await raw()).includes('早饭项目'));
    await page.locator('#copyRecoveryCode').click();assert.equal(await page.evaluate(()=>window.__copied),code1);
    await page.locator('#exportRecoveryCode').click();await page.waitForFunction(()=>!!window.__exported);assert.equal(await page.evaluate(()=>window.__exported.mime),'text/plain');assert.ok((await page.evaluate(()=>window.__exported.text)).includes(code1));
    await finishCode();await lock();assert.equal(await page.locator('#recordTable').innerHTML(),'');assert.ok(!(await page.locator('body').textContent()).includes('早饭项目'));
    const beforeReset=await raw();await action('forgot-password').click();await recoveryFields('bad code','second123');await page.locator('#recoverySubmit').click();assert.match(await page.locator('#recoveryError').textContent(),/格式不正确/);
    await recoveryFields('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA','second123');await page.locator('#recoverySubmit').click();await page.waitForFunction(()=>document.querySelector('#recoveryError').textContent.includes('恢复码不正确'));assert.equal(await raw(),beforeReset);
    await recoveryFields(code1.toLowerCase().replaceAll('-',' '),'second123');await page.evaluate(()=>window.__failWrite=true);await page.locator('#recoverySubmit').click();
    await page.waitForFunction(()=>document.querySelector('#recoveryError').textContent.includes('未保存'));assert.equal(await raw(),beforeReset);assert.equal(await page.locator('#app').isVisible(),false);
    await clearFailure();await page.locator('#recoverySubmit').click();await page.locator('#app').waitFor({state:'visible'});assert.deepEqual(await titles(),['早饭','交通','日记','房租']);
    await lock();await page.locator('#unlockPassword').fill('first123');await page.locator('#unlockButton').click();await page.waitForFunction(()=>document.querySelector('#unlockError').textContent.includes('密码不正确'));await unlock('second123');
    await settings('security');await page.locator('#currentPassword').fill('second123');await page.locator('#newPassword').fill('third123');await page.locator('#confirmPassword').fill('third123');
    const recoveryWrap=(await vault()).recovery;await failCommit();await page.locator('#passwordSubmit').click();await page.waitForFunction(()=>document.querySelector('#passwordError').textContent.includes('设置失败'));assert.deepEqual((await vault()).recovery,recoveryWrap);
    await clearFailure();await page.locator('#passwordSubmit').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);assert.deepEqual((await vault()).recovery,recoveryWrap);
    await settings('backup');await page.evaluate(()=>window.__exported=null);await action('export-backup').click();await page.waitForFunction(()=>!!window.__exported);const oldBackup=await page.evaluate(()=>window.__exported.text);await close();
    await settings('security','recovery');assert.equal(await page.locator('input[type="password"]:visible').count(),1);assert.equal(await page.locator('#newPassword').inputValue(),'');assert.equal(await page.locator('#confirmPassword').inputValue(),'');await page.locator('#recoveryCurrentPassword').fill('third123');await failCommit();await page.locator('#generateRecovery').click();
    await page.waitForFunction(()=>document.querySelector('#recoverySetupError').textContent.includes('生成失败'));assert.deepEqual((await vault()).recovery,recoveryWrap);assert.equal(await page.locator('#generatedRecoveryCode').count(),0);
    await clearFailure();await page.locator('#generateRecovery').click();await page.locator('#generatedRecoveryCode').waitFor();const code2=await page.locator('#generatedRecoveryCode').inputValue();assert.notEqual(code2,code1);
    for(const size of [{width:360,height:800},{width:412,height:892},{width:451,height:976},{width:360,height:410}]){
      await page.setViewportSize(size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert.ok(await page.locator('#generatedRecoveryCode').evaluate(el=>el.scrollHeight<=el.clientHeight));
      if(size.width===412)await page.screenshot({path:path.join(qa,'recovery-code-1.4.png')});
    }
    await page.setViewportSize({width:412,height:892});await finishCode();await lock();await action('forgot-password').click();await recoveryFields(code1,'fourth123');await page.locator('#recoverySubmit').click();
    await page.waitForFunction(()=>document.querySelector('#recoveryError').textContent.includes('恢复码不正确'));await recoveryFields(code2,'fourth123');await page.locator('#recoverySubmit').click();await page.locator('#app').waitFor({state:'visible'});
    const oldBackupWorks=await page.evaluate(async({backup,code})=>{const result=await QingjiVault.decrypt(JSON.parse(backup),code,true);const count=result.data.notes.length;QingjiVault.clearSession(result.session);return count;},{backup:oldBackup,code:code1});assert.equal(oldBackupWorks,4);
    console.log('PASS setup/reset/change/regeneration transactions, wrong codes, single display, clipboard/export, old-code invalidation, matching old backups');

    await settings('backup');await page.evaluate(()=>window.__exported=null);await action('export-backup').click();await page.waitForFunction(()=>!!window.__exported);const backup=JSON.parse(await page.evaluate(()=>window.__exported.text));assert.equal(backup.version,3);assert.ok(backup.recovery);
    const importRecovery=async()=>{await action('import-backup').click();await page.locator('[data-import-mode="recovery"]').click();await page.locator('#importRecoveryCode').fill(code2);await page.locator('#importRecoveryPassword').fill('fifth123');await page.locator('#importRecoveryConfirm').fill('fifth123');await page.locator('#decryptImport').click();await page.locator('#confirmAction').waitFor();};
    const beforeImport=(await vault()).keyWrap;await importRecovery();await failCommit();await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='应用存储写入失败');assert.deepEqual((await vault()).keyWrap,beforeImport);assert.deepEqual(await titles(),['早饭','交通','日记','房租']);
    await clearFailure();await settings('backup');await importRecovery();await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='备份已导入');
    await view('category','daily-cost');assert.deepEqual(await titles(),['早饭','交通']);await view('category','expenses');assert.deepEqual(await titles(),['交通','早饭','房租']);await view('all');
    await lock();await page.locator('#unlockPassword').fill('fourth123');await page.locator('#unlockButton').click();await page.waitForFunction(()=>document.querySelector('#unlockError').textContent.includes('密码不正确'));await unlock('fifth123');
    await settings('security');await page.locator('#currentPassword').fill('fifth123');await page.locator('#removePassword').click();await page.locator('#confirmAction').waitFor();await failCommit();await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='应用存储写入失败');assert.equal((await vault()).encrypted,true);
    await clearFailure();await settings('security');await page.locator('#currentPassword').fill('fifth123');await page.locator('#removePassword').click();await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='密码锁已关闭');assert.equal((await vault()).encrypted,false);assert.equal((await vault()).data.orders.length,3);
    const bad={...await vault(),data:{...(await vault()).data,orders:[{key:'all',ids:['a','a']}]}};await page.evaluate(data=>qingjiReceiveBackup(JSON.stringify(data),'bad.json'),bad);await page.waitForFunction(()=>document.querySelector('#toast').textContent==='文件顺序数据不正确');assert.equal(await page.locator('.note-card').count(),4);
    assert.deepEqual(errors,[]);
    console.log('PASS encrypted backup recovery import, import/disable failed-write rollback, retained order and records, malformed order rejection');

    const old=await legacyVault(seed.data),legacy=await openApp(browser,old),oldPage=legacy.page;
    await oldPage.locator('[data-action="forgot-password"]').click();assert.match(await oldPage.locator('#modalContent').textContent(),/尚未设置恢复码/);await oldPage.locator('[data-action="close-modal"]').first().click();
    await oldPage.evaluate(()=>window.__failWrite=true);await oldPage.locator('#unlockPassword').fill('legacy123');await oldPage.locator('#unlockButton').click();await oldPage.waitForFunction(()=>document.querySelector('#unlockError').textContent.includes('升级保存失败'));assert.equal(await oldPage.locator('#app').isVisible(),false);assert.equal(await oldPage.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).version),2);
    await oldPage.evaluate(()=>window.__failWrite=false);await oldPage.locator('#unlockButton').click();await oldPage.locator('#app').waitFor({state:'visible'});assert.equal(await oldPage.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).version),3);assert.deepEqual(await oldPage.locator('.note-card h2 span').allTextContents(),['交通','日记','房租','早饭']);
    await oldPage.locator('[data-action="open-sidebar"]').click();await oldPage.waitForTimeout(230);await oldPage.locator('[data-action="settings"]').click();await oldPage.locator('[data-settings-tab="security"]').click();await oldPage.locator('.recovery-options summary').click();await oldPage.locator('#recoveryCurrentPassword').fill('legacy123');await oldPage.locator('#generateRecovery').click();await oldPage.locator('#generatedRecoveryCode').waitFor();
    const legacyCode=await oldPage.locator('#generatedRecoveryCode').inputValue();await oldPage.evaluate(()=>qingjiAndroidPause());await oldPage.locator('#lockScreen').waitFor({state:'visible'});assert.equal(await oldPage.locator('#modalContent').innerHTML(),'');assert.ok(!(await oldPage.locator('body').textContent()).includes(legacyCode));
    await oldPage.locator('[data-action="forgot-password"]').click();await oldPage.locator('#recoveryCode').fill(legacyCode);await oldPage.locator('#recoveryPassword').fill('legacy-new');await oldPage.locator('#recoveryConfirm').fill('legacy-new');await oldPage.locator('#recoverySubmit').click();await oldPage.locator('#app').waitFor({state:'visible'});assert.equal(await oldPage.locator('.note-card').count(),4);assert.deepEqual(legacy.errors,[]);
    console.log('PASS encrypted v2 upgrade rollback and preservation, unavailable recovery state, configured legacy recovery, background secret clearing');
    console.log('ORDER AND RECOVERY CHECKS PASSED (mock Android bridge; no physical phone)');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
