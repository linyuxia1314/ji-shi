const {chromium} = require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto(pathToFileURL(path.join(root,'outputs/qingji.html')).href);
  await page.waitForTimeout(300);
  console.log(await page.evaluate(()=>['.app','.sidebar','.category-tree','.sidebar-bottom','.notes-panel','.note-list','.list-footer','.editor-panel','.editor-content','.note-body','.editor-footer'].map(sel=>{
    const el=document.querySelector(sel),r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return {sel,y:r.y,height:r.height,bottom:r.bottom,minHeight:s.minHeight,rows:s.gridTemplateRows,flexShrink:s.flexShrink,overflow:s.overflow};
  })));
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-action="open-sidebar"]').click();await page.waitForTimeout(250);
  console.log(await page.locator('#sidebar').boundingBox());
  await page.screenshot({path:path.join(root,'work/mobile-sidebar-open.png')});
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
