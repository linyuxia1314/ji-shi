const {chromium}=require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'assets/index.html'),'utf8');
const oldBody='First line\n\nChinese: 中文 & <text>\nLast line\n';
const stamp='2026-10-29T00:00:00.000Z';
const note=(id,title,body,extra={})=>({id,title,body,categoryId:null,tags:[],pinned:false,createdAt:stamp,updatedAt:stamp,deletedAt:null,...extra});
const legacy={format:'qingji',version:1,encrypted:false,data:{categories:[],notes:[note('legacy','Old note',oldBody)],settings:{autoLock:5}}};
async function main(){
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:412,height:892},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://appassets.androidplatform.net/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.addInitScript(vault=>{
    if(!localStorage.getItem('compatVault'))localStorage.setItem('compatVault',JSON.stringify(vault));
    window.QingjiAndroid={readVault:()=>localStorage.getItem('compatVault'),writeVault:raw=>{localStorage.setItem('compatVault',raw);return true;}};
  },legacy);
  const save=()=>page.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存');
  try{
    await page.goto('https://appassets.androidplatform.net/index.html');await page.locator('.note-card').click();
    assert.equal(await page.locator('#noteBody').evaluate(el=>getComputedStyle(el).fontSize),'16px');
    assert.equal(await page.locator('#noteBody').evaluate(el=>el.innerHTML.split('<br>').join('\n').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>')),oldBody);
    await page.evaluate(()=>window.qingjiAndroidPause());await save();
    assert.equal(await page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).data.notes[0].body),oldBody);
    await page.reload();await page.locator('.note-card').click();
    assert.equal(await page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).data.notes[0].body),oldBody);
    const imported={...legacy,data:{categories:[],notes:[note('rich','Imported note','Styled\nNormal',{bodyHtml:'<span onclick="window.__unsafe=true" style="color:#d13b40;font-size:24px;font-weight:700;position:fixed;background-image:url(https://invalid.example)">Styled</span><br>Normal<script>window.__unsafe=true</script><iframe src="https://invalid.example"></iframe>'})],settings:{autoLock:5,editor:{fontSize:18,color:'#236ac1',fontFamily:'serif',lineHeight:2}}}};
    await page.evaluate(backup=>window.qingjiReceiveBackup(JSON.stringify(backup),'old-backup.json'),imported);
    await page.locator('#confirmAction').click();await save();await page.waitForFunction(()=>document.querySelector('#noteTitle').value==='Imported note');
    assert.equal(await page.evaluate(()=>window.__unsafe),undefined);
    assert.equal(await page.locator('#noteBody [onclick],#noteBody script,#noteBody iframe').count(),0);
    const bodyHtml=await page.locator('#noteBody').innerHTML();assert.ok(!bodyHtml.includes('position:'));assert.ok(!bodyHtml.includes('background-image'));
    assert.equal(await page.locator('#noteBody span').evaluate(el=>getComputedStyle(el).fontSize),'24px');
    assert.equal(await page.locator('#noteBody').evaluate(el=>getComputedStyle(el).fontSize),'18px');
    await page.locator('#noteBody').focus();await page.locator('#noteBody').press('Control+End');
    await page.locator('#noteBody').evaluate(el=>{
      const clipboardData=new DataTransfer();clipboardData.setData('text/plain','<paste>');
      clipboardData.setData('text/html','<img src=x onerror="window.__unsafe=true">');
      el.dispatchEvent(new ClipboardEvent('paste',{clipboardData,bubbles:true,cancelable:true}));
    });
    await save();assert.equal(await page.locator('#noteBody img').count(),0);
    assert.equal(await page.evaluate(()=>JSON.parse(QingjiAndroid.readVault()).data.notes[0].body),'Styled\nNormal<paste>');
    assert.deepEqual(errors,[]);
    console.log('PASS v1 vault migration, multiline text, sanitized rich import, plain-text paste');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
