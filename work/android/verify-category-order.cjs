const {chromium}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');
const qa='C:/Users/admin/Documents/Codex/2026-10-29/codex-threads-01a18542-03d4-7451-a416/work';
const category=(id,name,parentId=null)=>({id,name,parentId,color:'#668e75'});
const stamp='2026-10-29T00:00:00Z';
const seed={format:'qingji',version:3,encrypted:false,data:{categories:[category('expenses','消费'),category('breakfast','日常开销','expenses'),category('fixed','固定支出','expenses'),category('food','食品','breakfast'),category('traffic','交通','breakfast'),category('daily','每日记录'),category('work','工作')],notes:[{id:'note',title:'消费记录',body:'',tags:[],categoryId:'food',pinned:false,createdAt:stamp,updatedAt:stamp,deletedAt:null,table:{kind:'numbered',rows:[{id:'r1',time:'2026-10-29T10:00',description:'早餐',amount:'12+8*2',note:''}]}}],orders:[{key:'all',ids:['note']}],settings:{autoLock:5}}};
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://appassets.androidplatform.net/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.addInitScript(vault=>{
    if(!localStorage.getItem('categoryTest'))localStorage.setItem('categoryTest',JSON.stringify(vault));
    window.QingjiAndroid={readVault:()=>localStorage.getItem('categoryTest'),writeVault:raw=>{if(window.__failWrite)return false;localStorage.setItem('categoryTest',raw);return true;},saveDocument:(request,name,mime,text)=>{window.__backup=text;setTimeout(()=>qingjiDocumentResult(request,true,''),5);},openBackup:()=>qingjiReceiveBackup(window.__backup,'backup.json')};
  },seed);
  const action=name=>page.locator(`[data-action="${name}"]`).first();
  const saved=()=>page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存');
  const tree=()=>page.locator('[data-category]').evaluateAll(nodes=>nodes.map(n=>n.dataset.category));
  const move=(id,direction)=>page.locator(`[data-move-category="${id}"][data-direction="${direction}"]`).click();
  const vault=()=>page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()));
  const openSidebar=async()=>{await action('open-sidebar').click();await page.waitForTimeout(230);};
  const closeModal=()=>action('close-modal').click();
  const security=async()=>{await openSidebar();await action('settings').click();await page.locator('[data-settings-tab="security"]').click();};
  try{
    await page.goto('https://appassets.androidplatform.net/index.html');await openSidebar();
    assert.equal(await page.locator('[data-move-category]').count(),0);
    await page.locator('#categoryOrderToggle').click();assert.equal(await page.locator('#categoryOrderToggle').getAttribute('aria-pressed'),'true');
    await move('daily',-1);assert.deepEqual(await tree(),['daily','expenses','breakfast','fixed','work']);
    await move('fixed',-1);assert.deepEqual(await tree(),['daily','expenses','fixed','breakfast','work']);
    await page.locator('[data-expand="breakfast"]').click();await move('traffic',-1);assert.deepEqual(await tree(),['daily','expenses','fixed','breakfast','traffic','food','work']);
    assert.equal(await page.locator('[data-move-category="daily"][data-direction="-1"]').isDisabled(),true);
    assert.equal(await page.locator('[data-move-category="fixed"][data-direction="-1"]').isDisabled(),true);
    assert.equal(await page.locator('[data-move-category="traffic"][data-direction="-1"]').isDisabled(),true);
    assert.equal(await page.locator('[data-move-category="food"][data-direction="1"]').isDisabled(),true);
    await saved();const orderedCategories=(await vault()).data.categories;assert.deepEqual((await vault()).data.notes,seed.data.notes);assert.deepEqual((await vault()).data.orders,seed.data.orders);
    for(const size of [{width:360,height:800},{width:412,height:892},{width:451,height:976},{width:1280,height:800}]){
      await page.setViewportSize(size);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const sidebar=await page.locator('#sidebar').boundingBox();
      const controls=await page.locator('.category-order-controls').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right};}));
      assert.ok(controls.every(r=>r.left>=sidebar.x&&r.right<=sidebar.x+sidebar.width));
      if(size.width===412)await page.screenshot({path:path.join(qa,'category-order-1.4.1.png')});
    }
    await page.setViewportSize({width:412,height:892});await page.reload();await openSidebar();assert.deepEqual(await tree(),['daily','expenses','fixed','breakfast','work']);
    assert.equal(await page.locator('[data-move-category]').count(),0);await page.locator('[data-expand="breakfast"]').click();assert.deepEqual(await tree(),['daily','expenses','fixed','breakfast','traffic','food','work']);
    await page.locator('[data-category="food"]').click();await page.locator('.note-card').click();await action('toggle-editor-tools').click();assert.deepEqual(await page.locator('#noteCategory option').evaluateAll(nodes=>nodes.map(n=>n.value)),['','daily','expenses','fixed','breakfast','traffic','food','work']);
    assert.equal(await page.locator('#noteCategory').inputValue(),'food');assert.equal(await page.locator('#tableTotal').textContent(),'28.00');await action('back-list').click();
    await openSidebar();await page.locator('#categoryOrderToggle').click();await page.evaluate(()=>window.__failWrite=true);await move('work',-1);await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存失败'));
    assert.deepEqual((await vault()).data.categories,orderedCategories);await page.evaluate(()=>window.__failWrite=false);await page.locator('#categoryOrderToggle').press('Control+s');await saved();await page.reload();await openSidebar();assert.deepEqual(await tree(),['daily','work','expenses','fixed','breakfast']);
    await page.locator('#categoryOrderToggle').click();await move('work',1);await saved();await action('close-sidebar').click();
    console.log('PASS top-level, sibling and grandchild category order; hierarchy, file order, restart, failed writes and phone layout');

    await security();await page.locator('#newPassword').fill('current123');await page.locator('#confirmPassword').fill('current123');await page.locator('#createRecovery').uncheck();await page.locator('#passwordSubmit').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await security();assert.equal(await page.locator('input[type="password"]:visible').count(),0);await page.locator('.recovery-options summary').click();assert.equal(await page.locator('input[type="password"]:visible').count(),1);
    assert.equal(await page.locator('#passwordOptions').evaluate(el=>el.open),false);assert.equal(await page.locator('#newPassword').inputValue(),'');assert.equal(await page.locator('#confirmPassword').inputValue(),'');
    await page.locator('#recoveryCurrentPassword').fill('incorrect123');await page.locator('#generateRecovery').click();await page.waitForFunction(()=>document.querySelector('#recoverySetupError').textContent==='当前密码不正确');assert.equal((await vault()).recovery,undefined);
    await page.locator('#recoveryCurrentPassword').fill('current123');
    for(const size of [{width:360,height:800},{width:412,height:892},{width:451,height:976},{width:1280,height:800}]){await page.setViewportSize(size);assert.equal(await page.locator('input[type="password"]:visible').count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(size.width===412)await page.screenshot({path:path.join(qa,'recovery-single-password-1.4.1.png')});}
    await page.setViewportSize({width:412,height:892});await page.locator('#generateRecovery').click();await page.locator('#generatedRecoveryCode').waitFor();const code=await page.locator('#generatedRecoveryCode').inputValue();await page.locator('#recoverySaved').check();await page.locator('#recoveryDone').click();
    await page.evaluate(()=>qingjiAndroidPause());await page.locator('#unlockPassword').fill('current123');await page.locator('#unlockButton').click();await page.locator('#app').waitFor({state:'visible'});
    await security();await page.locator('#passwordOptions summary').click();await page.locator('#currentPassword').fill('current123');await page.locator('#newPassword').fill('changed123');await page.locator('#confirmPassword').fill('changed123');assert.equal(await page.locator('#recoveryCurrentPassword').inputValue(),'');await page.locator('#passwordSubmit').click();await page.waitForFunction(()=>!document.querySelector('#modal').open);
    await security();await page.locator('#passwordOptions summary').click();await page.locator('#currentPassword').fill('changed123');await page.locator('.recovery-options summary').click();await page.waitForFunction(()=>!document.querySelector('#passwordOptions').open);assert.equal(await page.locator('#currentPassword').inputValue(),'');await closeModal();
    const decrypted=await page.evaluate(async()=>{const result=await QingjiVault.decrypt(JSON.parse(QingjiAndroid.readVault()),'changed123');const data=result.data;QingjiVault.clearSession(result.session);return data;});assert.deepEqual(decrypted.categories,orderedCategories);assert.deepEqual(decrypted.orders,seed.data.orders);
    await openSidebar();await action('settings').click();await page.locator('[data-settings-tab="backup"]').click();await action('export-backup').click();await page.waitForFunction(()=>!!window.__backup);await action('import-backup').click();await page.locator('#importPassword').fill('changed123');await page.locator('#decryptImport').click();await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='备份已导入');
    await openSidebar();assert.deepEqual(await tree(),['daily','expenses','fixed','breakfast','work']);await action('close-sidebar').click();
    await page.evaluate(()=>qingjiAndroidPause());await page.locator('[data-action="forgot-password"]').click();await page.locator('#recoveryCode').fill(code);await page.locator('#recoveryPassword').fill('recovered123');await page.locator('#recoveryConfirm').fill('recovered123');await page.locator('#recoverySubmit').click();await page.locator('#app').waitFor({state:'visible'});await openSidebar();assert.deepEqual(await tree(),['daily','expenses','fixed','breakfast','work']);
    assert.deepEqual(errors,[]);console.log('PASS recovery generation with current password alone, separate password-change validation, current password preserved, encrypted backup and recovery retain category order');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
