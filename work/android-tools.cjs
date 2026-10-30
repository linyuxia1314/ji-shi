const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const {pipeline} = require('node:stream/promises');
const xml = require('C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/xml-js');
const root = path.join(__dirname,'android-sdk');
fs.mkdirSync(root,{recursive:true});
async function download(url,destination) {
  await new Promise((resolve,reject)=>{
    const request=https.get(url,response=>{
      if(response.statusCode>=300&&response.statusCode<400){response.resume();download(new URL(response.headers.location,url).href,destination).then(resolve,reject);return;}
      if(response.statusCode!==200){response.resume();reject(Error(`${response.statusCode}: ${url}`));return;}
      pipeline(response,fs.createWriteStream(destination)).then(resolve,reject);
    });
    request.on('error',reject);
    request.setTimeout(60000,()=>request.destroy(Error('Download timeout')));
  });
}
async function main() {
  const repository=path.join(root,'repository.xml');
  await download('https://dl.google.com/android/repository/repository2-3.xml',repository);
  const document=xml.xml2js(fs.readFileSync(repository,'utf8'),{compact:true});
  const packages=document['sdk:sdk-repository'].remotePackage;
  const specs=[];
  for(const name of ['build-tools;36.0.0','platforms;android-36','platform-tools']) {
    const item=packages.find(p=>p._attributes.path===name);
    if(!item)throw Error(`Missing package ${name}`);
    const list=Array.isArray(item.archives.archive)?item.archives.archive:[item.archives.archive];
    const archive=list.find(a=>!a['host-os']||a['host-os']._text==='windows');
    const complete=archive.complete;
    const filename=complete.url._text;
    specs.push({name,url:`https://dl.google.com/android/repository/${filename}`,destination:path.join(root,path.basename(filename)),sha1:complete.checksum._text,size:Number(complete.size._text)});
  }
  fs.writeFileSync(path.join(root,'packages.json'),JSON.stringify(specs,null,2));
  console.log(specs);
  for(const spec of specs) {
    if(fs.existsSync(spec.destination)&&crypto.createHash('sha1').update(fs.readFileSync(spec.destination)).digest('hex')===spec.sha1){console.log(`Cached ${spec.name}`);continue;}
    console.log(`Downloading ${spec.name}: ${(spec.size/1024/1024).toFixed(1)} MB`);
    await download(spec.url,spec.destination);
    const actual=crypto.createHash('sha1').update(fs.readFileSync(spec.destination)).digest('hex');
    if(actual!==spec.sha1)throw Error(`Checksum mismatch: ${spec.name}`);
    console.log(`Verified ${spec.name}`);
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
