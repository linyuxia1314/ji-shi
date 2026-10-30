const {chromium}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');
const oldBody='旧消费记录\n\n早餐 12 元\n交通 8 元\n';
const stamp='2026-10-28T00:00:00Z';
const legacy={format:'qingji',version:1,encrypted:false,data:{categories:[{id:'old',name:'旧分类',parentId:null,color:'#718eac'}],notes:[{id:'old-note',title:'升级前记录',body:oldBody,categoryId:'old',tags:['旧标签'],pinned:true,createdAt:stamp,updatedAt:stamp,deletedAt:null}],settings:{autoLock:5}}};
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true,timezoneId:'Asia/Shanghai'});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://appassets.androidplatform.net/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.addInitScript(vault=>{
    if(!localStorage.getItem('upgradeVault'))localStorage.setItem('upgradeVault',JSON.stringify(vault));
    window.QingjiAndroid={readVault:()=>localStorage.getItem('upgradeVault'),writeVault:raw=>{localStorage.setItem('upgradeVault',raw);return true;},saveDocument:(request,name,mime,text)=>{window.__export={name,mime,text};setTimeout(()=>window.qingjiDocumentResult(request,true,''),5);}};
  },legacy);
  const saved=()=>page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存');
  try{
    await page.goto('https://appassets.androidplatform.net/index.html');await page.locator('.note-card').click();
    assert.equal(await page.locator('#legacyNote').isVisible(),true);await page.locator('#legacyNote summary').click();
    assert.equal(await page.locator('#noteBody').evaluate(el=>el.innerHTML.split('<br>').join('\n')),oldBody);
    assert.equal(await page.locator('#noteCategory').inputValue(),'old');assert.match(await page.locator('#editorTags').textContent(),/旧标签/);
    await page.locator('#addTableRow').click();await page.locator('[data-table-field="description"]').fill('新增消费');await page.locator('[data-table-field="amount"]').fill('5+3');await saved();
    const vault=await page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()));
    assert.equal(vault.version,3);assert.equal(vault.data.notes[0].body,oldBody);assert.equal(vault.data.notes[0].table.rows[0].amount,'5+3');
    await page.reload();await page.locator('.note-card').click();assert.equal(await page.locator('#tableTotal').textContent(),'8.00');
    await page.locator('[data-action="note-menu"]').click();await page.locator('[data-action="export-note"]').click();
    await page.waitForFunction(()=>!!window.__export);const output=await page.evaluate(()=>window.__export.text);
    assert.ok(output.includes(oldBody));assert.ok(output.includes('新增消费'));assert.ok(output.includes('8.00'));assert.ok(output.includes('5+3'));
    const malformed={...vault,data:{...vault.data,notes:[{...vault.data.notes[0],table:{kind:'numbered',rows:[{id:'bad"]',time:'2026-10-29T10:00',description:'x',amount:'1',note:''}]}}]}};
    await page.evaluate(backup=>window.qingjiReceiveBackup(JSON.stringify(backup),'bad.json'),malformed);
    await page.waitForFunction(()=>document.querySelector('#toast').textContent==='表格记录不正确');
    assert.equal(await page.locator('#tableTotal').textContent(),'8.00');assert.deepEqual(errors,[]);
    console.log('PASS v1 upgrade preserves original text, categories, tags; v3 table storage and full export; invalid import rejected');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
