const {chromium}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');
async function main() {
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://appassets.androidplatform.net/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.addInitScript(()=>{
    window.__documentResult=true;
    window.QingjiAndroid={
      readVault:()=>localStorage.getItem('testNativeVault'),
      writeVault:raw=>{if(window.__failWrite)return false;localStorage.setItem('testNativeVault',raw);return true;},
      saveDocument:(request,name,mime,text)=>{
        window.__document={name,mime,text};
        setTimeout(()=>window.qingjiDocumentResult(request,window.__documentResult,''),10);
      },
      openBackup:()=>window.qingjiReceiveBackup(window.__document.text,window.__document.name)
    };
  });
  const openTools=async()=>{if(!await page.locator('#editorTools').isVisible())await page.locator('#editorToolsToggle').click();};
  const toolCommands=new Set(['bold','italic','underline','text-color','highlight','clear-format','undo','redo','editor-settings']);
  const action=name=>({click:async()=>{
    if(toolCommands.has(name))await openTools();
    if(['pin','export-note'].includes(name)&&!await page.locator('#noteMenu').isVisible())await page.locator('[data-action="note-menu"]').click();
    await page.locator(`${name==='new-note'?'.notes-panel ':''}[data-action="${name}"]:visible`).first().click();
  }});
  const save=()=>page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存');
  const selectText=async(start,end)=>page.locator('#noteBody').evaluate((el,{start,end})=>{
    el.focus();const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),range=document.createRange();
    let offset=0,node;while(node=walker.nextNode()){
      const next=offset+node.length;
      if(start>=offset&&start<next)range.setStart(node,start-offset);
      if(end>offset&&end<=next){range.setEnd(node,end-offset);break;}offset=next;
    }
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
  },{start,end});
  const firstStyle=()=>page.locator('#noteBody').evaluate(el=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),node=walker.nextNode();
    const s=getComputedStyle(node.parentElement);let parent=node.parentElement,decoration='';
    while(parent!==el){decoration+=getComputedStyle(parent).textDecorationLine+' ';parent=parent.parentElement;}
    return {weight:s.fontWeight,color:s.color,size:s.fontSize,style:s.fontStyle,decoration,background:s.backgroundColor};
  });
  const settings=async tab=>{
    await action('back-list').click();await action('open-sidebar').click();
    await page.waitForTimeout(220);await action('settings').click();
    await page.locator(`[data-settings-tab="${tab}"]`).click();
  };
  try{
    await page.goto('https://appassets.androidplatform.net/index.html');
    await save();assert.equal(await page.locator('.note-card').count(),0);
    assert.equal(await page.evaluate(()=>isSecureContext),true);
    await action('new-note').click();
    await page.locator('#noteTitle').fill('安卓记录');await page.locator('#noteBody').fill('手机里的加密笔记');
    assert.equal(await page.locator('#editorTools').isVisible(),false);
    assert.equal(await page.locator('#noteCategory').isVisible(),false);
    assert.equal(await page.locator('#fontSize').isVisible(),false);
    const client=await context.newCDPSession(page);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:25}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120,y:90}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await page.locator('#editorTools').isVisible(),true);
    await page.locator('#editorToolsToggle').click();assert.equal(await page.locator('#editorTools').isVisible(),false);
    await client.detach();
    await openTools();
    await page.locator('#tagInput').fill('个人');await page.locator('#tagInput').press('Enter');
    await save();
    await page.reload();assert.equal(await page.locator('.note-card').count(),1);await page.locator('.note-card').click();
    assert.equal(await page.locator('#noteBody').textContent(),'手机里的加密笔记');
    assert.equal(await page.locator('#editorTools').isVisible(),false);
    await selectText(0,2);await action('bold').click();
    assert.equal((await firstStyle()).weight,'700');
    await action('undo').click();assert.equal((await firstStyle()).weight,'400');
    await action('redo').click();assert.equal((await firstStyle()).weight,'700');
    await selectText(0,2);await action('italic').click();await action('underline').click();
    await action('text-color').click();await page.locator('[data-text-color="#d13b40"]').click();
    await page.locator('#fontSize').selectOption('24');
    await action('highlight').click();await save();
    let styled=await firstStyle();assert.equal(styled.color,'rgb(209, 59, 64)');assert.equal(styled.size,'24px');
    assert.equal(styled.style,'italic');assert.match(styled.decoration,/underline/);
    assert.ok(await page.locator('#noteBody [style*="background-color"]').count());
    await page.reload();await page.locator('.note-card').click();
    styled=await firstStyle();assert.equal(styled.color,'rgb(209, 59, 64)');assert.equal(styled.size,'24px');assert.equal(styled.weight,'700');
    assert.equal(await page.locator('#noteBody').textContent(),'手机里的加密笔记');
    await action('editor-settings').click();
    await page.locator('#defaultSize').selectOption('18');await page.locator('#defaultFont').selectOption('mono');
    await page.locator('#defaultLineHeight').selectOption('2');await page.locator('[data-default-color="#236ac1"]').click();
    await action('close-modal').click();await save();
    assert.equal(await page.locator('#noteBody').evaluate(el=>getComputedStyle(el).fontSize),'18px');
    assert.equal((await firstStyle()).size,'24px');
    await page.reload();await page.locator('.note-card').click();
    assert.equal(await page.locator('#noteBody').evaluate(el=>getComputedStyle(el).fontFamily),'monospace');
    assert.equal(await page.locator('#noteBody').evaluate(el=>getComputedStyle(el).color),'rgb(35, 106, 193)');
    await action('back-list').click();await action('new-note').click();await page.locator('#noteTitle').fill('输入验证');
    await openTools();
    await page.locator('#noteBody').focus();await page.locator('#fontSize').selectOption('20');
    await page.locator('#noteBody').pressSequentially('New');
    assert.equal((await firstStyle()).size,'20px');
    await page.locator('#noteBody').press('Enter');await page.locator('#noteBody').pressSequentially('Line');await save();
    const newBody=await page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).data.notes.find(n=>n.title==='输入验证').body);
    assert.equal(newBody,'New\nLine');
    await page.reload();await page.locator('.note-card').filter({hasText:'输入验证'}).click();assert.equal((await firstStyle()).size,'20px');
    await page.locator('#noteBody').fill('组合输入');
    await page.locator('#noteBody').evaluate(el=>{
      el.dispatchEvent(new CompositionEvent('compositionstart'));el.textContent='中文输入完成';
      el.dispatchEvent(new InputEvent('input',{inputType:'insertCompositionText',isComposing:true}));
      el.dispatchEvent(new CompositionEvent('compositionend'));
    });
    await action('undo').click();assert.equal(await page.locator('#noteBody').textContent(),'组合输入');
    await action('redo').click();assert.equal(await page.locator('#noteBody').textContent(),'中文输入完成');
    await action('note-menu').click();await action('delete-note').click();
    assert.equal(await page.locator('#noteTitle').inputValue(),'安卓记录');
    console.log('PASS selected-text formatting, undo/redo, reload persistence, editor defaults');
    await settings('general');assert.match(await page.locator('#modalContent').textContent(),/此手机 · 应用私有目录/);
    await page.locator('[data-settings-tab="security"]').click();
    await page.locator('#newPassword').fill('123456');await page.locator('#confirmPassword').fill('123456');await page.locator('#passwordSubmit').click();
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    assert.ok(!(await page.evaluate(()=>QingjiAndroid.readVault())).includes('手机里的加密笔记'));
    await page.evaluate(()=>window.qingjiAndroidPause());
    assert.equal(await page.locator('#lockScreen').isVisible(),true);
    assert.equal(await page.locator('#noteBody').innerHTML(),'');
    await page.locator('#unlockPassword').fill('123456');await page.locator('#unlockButton').click();await page.locator('#app').waitFor({state:'visible'});
    await page.locator('.note-card').click();
    assert.equal((await firstStyle()).size,'24px');assert.equal((await firstStyle()).color,'rgb(209, 59, 64)');
    await settings('backup');assert.match(await page.locator('#modalContent').textContent(),/卸载应用或清除应用数据/);
    await action('export-backup').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent==='备份已保存');
    assert.equal(await page.evaluate(()=>JSON.parse(window.__document.text).encrypted),true);
    await action('import-backup').click();await page.locator('#importPassword').fill('123456');await page.locator('#decryptImport').click();await page.locator('#confirmAction').click();await save();
    assert.equal(await page.locator('.note-card').count(),1);
    console.log('PASS Android bridge: native vault persistence, encryption, background lock, file export/import');
    await page.locator('.note-card').click();
    assert.equal((await firstStyle()).weight,'700');assert.equal((await firstStyle()).size,'24px');
    assert.equal(await page.locator('#noteBody').evaluate(el=>getComputedStyle(el).fontFamily),'monospace');
    await selectText(0,2);await action('clear-format').click();assert.equal((await firstStyle()).weight,'400');
    await action('undo').click();assert.equal((await firstStyle()).weight,'700');
    assert.equal(await page.evaluate(()=>window.qingjiAndroidBack()),true);
    assert.equal(await page.locator('#editorTools').isVisible(),false);
    assert.equal(await page.locator('#noteBody').isVisible(),true);
    assert.equal(await page.evaluate(()=>window.qingjiAndroidBack()),true);
    await action('open-sidebar').click();await page.waitForTimeout(220);
    assert.equal(await page.evaluate(()=>window.qingjiAndroidBack()),true);
    assert.equal(await page.evaluate(()=>window.qingjiAndroidBack()),false);
    await page.locator('.note-card').click();
    await page.evaluate(()=>window.__failWrite=true);
    await page.locator('#noteBody').fill('存储失败时要保留的内容');
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存失败'));
    await page.evaluate(()=>window.qingjiAndroidPause());
    assert.equal(await page.locator('#lockScreen').isVisible(),false);
    assert.equal(await page.locator('#noteBody').textContent(),'存储失败时要保留的内容');
    await page.evaluate(()=>window.__failWrite=false);await page.locator('#noteBody').press('Control+s');await save();
    console.log('PASS Android back navigation and failed-write protection');
    for(const viewport of [{width:360,height:800},{width:412,height:892},{width:451,height:976},{width:412,height:410}]){
      await page.setViewportSize(viewport);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const textarea=await page.locator('#noteBody').boundingBox();
      const footer=await page.locator('.editor-footer').boundingBox();
      assert.ok(textarea.y+textarea.height<=footer.y+1);
    }
    await page.setViewportSize({width:412,height:892});
    await page.screenshot({path:path.join(root,'work/android-editor-preview.png')});
    await action('back-list').click();await action('open-sidebar').click();await page.waitForTimeout(220);
    await page.screenshot({path:path.join(root,'work/android-categories-preview.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS phone layouts, keyboard-height layout, no JavaScript errors');
    console.log('ANDROID UI AND BRIDGE CHECKS PASSED (mock native bridge; no physical device)');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
