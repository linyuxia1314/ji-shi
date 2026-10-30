const {chromium}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');
const root=path.resolve(__dirname,'../..');
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://appassets.androidplatform.net/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.addInitScript(()=>{
    window.QingjiAndroid={
      readVault:()=>localStorage.getItem('tableTestVault'),
      writeVault:raw=>{if(window.__failWrite)return false;localStorage.setItem('tableTestVault',raw);return true;},
      saveDocument:(request,name,mime,text)=>{window.__exported={name,mime,text};setTimeout(()=>window.qingjiDocumentResult(request,true,''),5);},
      openBackup:()=>window.qingjiReceiveBackup(window.__exported.text,window.__exported.name)
    };
  });
  const action=name=>page.locator(`[data-action="${name}"]:visible`).first();
  const field=(index,key)=>page.locator(`[data-table-field="${key}"]`).nth(index);
  const total=()=>page.locator('#tableTotal').textContent();
  const save=()=>page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存');
  const newTable=async kind=>{await page.locator('.list-heading [data-action="new-note"]').click();await page.locator(`[data-create-table="${kind}"]`).click();};
  const settings=async tab=>{if(await action('back-list').isVisible())await action('back-list').click();await action('open-sidebar').click();await page.waitForTimeout(230);await action('settings').click();await page.locator(`[data-settings-tab="${tab}"]`).click();};
  try{
    await page.goto('https://appassets.androidplatform.net/index.html');await save();
    await page.clock.setFixedTime(new Date('2026-10-29T02:00:00Z'));
    const amounts=await page.evaluate(()=>['0.1+0.2','12+8*2','(20-5)*2/3','1/3','0.005','-(4+2)','１２＋３×２','1/0','2**3','window.alert(1)'].map(input=>{const r=QingjiTables.calculate(input);return {input,text:r.text,error:r.error};}));
    assert.deepEqual(amounts.slice(0,7).map(r=>r.text),['0.30','28.00','10.00','0.33','0.01','-6.00','18.00']);
    assert.equal(amounts[7].error,'不能除以 0');assert.ok(amounts[8].error);assert.ok(amounts[9].error);
    assert.equal(await page.locator('#sort').count(),0);assert.ok(!(await page.locator('.notes-panel').textContent()).includes('最近编辑'));
    await newTable('numbered');await page.locator('#noteTitle').fill('我的消费');
    assert.equal(await page.locator('#editorTools').isVisible(),false);
    await field(0,'description').fill('早餐');await field(0,'amount').fill('0.1+0.2');
    assert.equal(await total(),'0.30');await page.locator('#noteTitle').click();assert.equal(await field(0,'amount').inputValue(),'0.30');
    await field(0,'amount').focus();assert.equal(await field(0,'amount').inputValue(),'0.1+0.2');
    await page.locator('#addTableRow').click();await field(1,'description').fill('采购');await field(1,'amount').fill('12+8*2');await field(1,'note').fill('两份');
    assert.equal(await total(),'28.30');
    await page.locator('#addTableRow').click();await field(2,'description').fill('均摊');await field(2,'amount').fill('(20-5)*2/3');
    assert.equal(await total(),'38.30');
    await field(2,'amount').fill('1/0');assert.equal(await total(),'28.30');assert.match(await page.locator('#tablePending').textContent(),/1 项待计算/);
    assert.equal(await field(2,'amount').getAttribute('aria-invalid'),'true');
    await field(2,'amount').fill('10');assert.equal(await total(),'38.30');assert.equal(await page.locator('#tablePending').textContent(),'');
    await page.locator('[data-calc-row]').nth(1).click();await page.locator('[data-calc-key="clear"]').click();
    for(const key of ['1','2','+','8','×','2'])await page.locator(`[data-calc-key="${key}"]`).click();
    assert.equal(await page.locator('#calcResult').textContent(),'28.00 元');await page.locator('#applyCalculation').click();
    await page.locator('[data-delete-row]').nth(1).click();await page.locator('#confirmAction').click();
    assert.deepEqual(await page.locator('.index-cell').allTextContents(),['1','2']);assert.equal(await total(),'10.30');
    await save();await page.reload();await page.locator('.note-card').click();
    assert.equal(await total(),'10.30');assert.equal(await field(0,'description').inputValue(),'早餐');
    await field(0,'amount').focus();assert.equal(await field(0,'amount').inputValue(),'0.1+0.2');
    console.log('PASS numbered rows, decimal arithmetic, keypad, invalid amounts, totals, reload');
    await action('back-list').click();await newTable('timed');await page.locator('#noteTitle').fill('每日花费');
    await field(0,'description').fill('买早餐');await field(0,'amount').fill('12');
    await save();assert.equal(await page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).data.notes.find(n=>n.title==='每日花费').table.rows[0].time),'2026-10-29T10:00');
    await page.locator('[data-edit-time]').first().click();await page.locator('#rowTime').fill('2026-10-28T08:30');await page.locator('#rowTimeForm button[type="submit"]').click();
    await page.locator('#addTableRow').click();await field(1,'description').fill('晚饭');await field(1,'amount').fill('24/2');
    assert.equal(await total(),'24.00');assert.equal(await page.locator('.day-heading').count(),2);
    assert.equal(await page.locator('[data-day-total="2026-10-28"]').textContent(),'12.00 元');
    assert.equal(await page.locator('[data-day-total="2026-10-29"]').textContent(),'12.00 元');
    assert.equal(await page.locator('.time-cell-button').first().textContent(),'08:30');
    await action('toggle-editor-tools').click();await page.locator('#noteCategory').selectOption('daily');
    assert.equal(await page.locator('#writingToolbar').isVisible(),false);await action('toggle-editor-tools').click();
    await save();await action('back-list').click();
    await page.locator('[data-table-view="numbered"]').click();assert.equal(await page.locator('.note-card').count(),1);assert.match(await page.locator('.note-card').textContent(),/我的消费/);
    await page.locator('[data-table-view="timed"]').click();assert.equal(await page.locator('.note-card').count(),1);assert.match(await page.locator('.note-card').textContent(),/每日花费/);
    await page.locator('.note-card').click();assert.equal(await total(),'24.00');
    console.log('PASS automatic local timestamps, day groups, per-day totals, category and type filters');
    await settings('security');await page.locator('#newPassword').fill('test1234');await page.locator('#confirmPassword').fill('test1234');await page.locator('#passwordSubmit').click();
    await page.locator('#generatedRecoveryCode').waitFor();await page.locator('#recoverySaved').check();await page.locator('#recoveryDone').click();
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    assert.ok(!(await page.evaluate(()=>QingjiAndroid.readVault())).includes('买早餐'));
    await page.evaluate(()=>window.qingjiAndroidPause());assert.equal(await page.locator('#lockScreen').isVisible(),true);
    assert.equal(await page.locator('#recordTable').innerHTML(),'');assert.ok(!(await page.locator('body').textContent()).includes('晚饭'));
    await page.locator('#unlockPassword').fill('test1234');await page.locator('#unlockButton').click();await page.locator('#app').waitFor({state:'visible'});
    await page.locator('.note-card').filter({hasText:'每日花费'}).click();assert.equal(await total(),'24.00');
    await settings('backup');await action('export-backup').click();await page.waitForFunction(()=>!!window.__exported);
    assert.equal(await page.evaluate(()=>JSON.parse(window.__exported.text).encrypted),true);
    await action('import-backup').click();await page.locator('#importPassword').fill('test1234');await page.locator('#decryptImport').click();await page.locator('#confirmAction').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent==='备份已导入');
    assert.equal(await page.locator('.note-card').count(),2);await page.locator('.note-card').filter({hasText:'每日花费'}).click();assert.equal(await total(),'24.00');
    await page.evaluate(()=>window.__failWrite=true);await field(1,'amount').fill('15+5');
    await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存失败'));
    await page.evaluate(()=>window.qingjiAndroidPause());assert.equal(await page.locator('#lockScreen').isVisible(),false);assert.equal(await total(),'32.00');
    await page.evaluate(()=>window.__failWrite=false);await page.locator('#noteTitle').press('Control+s');await save();
    console.log('PASS table encryption, background lock clears table UI, encrypted restore, failed-write protection');
    for(const viewport of [{width:360,height:800},{width:412,height:892},{width:451,height:976},{width:360,height:410},{width:1280,height:800}]){
      await page.setViewportSize(viewport);await page.waitForTimeout(250);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const scroll=await page.locator('#tableScroll').boundingBox(),summary=await page.locator('.table-summary').boundingBox();
      assert.ok(scroll.height>=60,JSON.stringify({viewport,scroll}));assert.ok(scroll.y+scroll.height<=summary.y+1);
      assert.ok(summary.y+summary.height<=viewport.height);
    }
    await page.setViewportSize({width:412,height:892});await page.screenshot({path:path.join(root,'work/timed-table-test.png')});
    assert.deepEqual(errors,[]);console.log('PASS phone, keyboard and desktop layouts; no JavaScript errors');
    console.log('TABLE CHECKS PASSED (mock Android bridge; no physical device)');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
