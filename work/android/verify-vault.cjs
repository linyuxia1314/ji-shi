const assert=require('node:assert/strict');
global.window={};
require('../qingji/vault.js');
const Vault=window.QingjiVault;
const sample={notes:[{title:'private record',amount:'12+8*2'}],orders:[{key:'all',ids:['first','second']}]};
const copy=value=>JSON.parse(JSON.stringify(value));
async function legacyVault(version,iterations){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode('legacy123'),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(sample)));
  return {format:'qingji',version,encrypted:true,salt:Buffer.from(salt).toString('base64'),iv:Buffer.from(iv).toString('base64'),payload:Buffer.from(encrypted).toString('base64'),iterations};
}
async function main(){
  const codes=new Set(Array.from({length:64},()=>Vault.generateCode()));
  assert.equal(codes.size,64);
  for(const code of codes)assert.match(code,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){7}$/);
  const code=[...codes][0],session=await Vault.createSession('first123',code);
  assert.equal(session.key.extractable,false);await assert.rejects(crypto.subtle.exportKey('raw',session.key));
  const vault=await Vault.encrypt(sample,session);assert.equal(Vault.validate(vault),vault);
  assert.equal(vault.version,3);assert.ok(!JSON.stringify(vault).includes('private record'));assert.ok(!JSON.stringify(vault).includes(code));
  for(const [credential,recovery] of [['first123',false],[code.toLowerCase().split('-').join(' '),true]]){
    const result=await Vault.decrypt(vault,credential,recovery);assert.deepEqual(result.data,sample);Vault.clearSession(result.session);
  }
  await assert.rejects(Vault.decrypt(vault,'wrong123'));
  await assert.rejects(Vault.decrypt(vault,[...codes][1],true));
  await assert.rejects(Vault.decrypt(vault,'bad code',true));
  for(const field of ['iv','payload','keyWrap','recovery']){
    const bad=copy(vault),target=typeof bad[field]==='object'?bad[field]:bad;
    const name=typeof bad[field]==='object'?'payload':field;
    const raw=Buffer.from(target[name],'base64');raw[0]^=1;target[name]=raw.toString('base64');
    await assert.rejects(Vault.decrypt(bad,field==='recovery'?code:'first123',field==='recovery'));
  }
  const changed=await Vault.rewrapPassword(session,'second123'),changedVault=await Vault.encrypt(sample,changed);
  assert.deepEqual(changedVault.recovery,vault.recovery);
  await assert.rejects(Vault.decrypt(changedVault,'first123'));
  let unlocked=await Vault.decrypt(changedVault,'second123');Vault.clearSession(unlocked.session);
  unlocked=await Vault.decrypt(changedVault,code,true);Vault.clearSession(unlocked.session);
  const newCode=[...codes][2],rotated=await Vault.createSession('second123',newCode),rotatedVault=await Vault.encrypt(sample,rotated);
  assert.notDeepEqual(rotated.bytes,session.bytes);await assert.rejects(Vault.decrypt(rotatedVault,code,true));
  unlocked=await Vault.decrypt(rotatedVault,newCode,true);assert.deepEqual(unlocked.data,sample);Vault.clearSession(unlocked.session);
  unlocked=await Vault.decrypt(vault,code,true);assert.deepEqual(unlocked.data,sample);Vault.clearSession(unlocked.session);
  const bare=await Vault.createSession('bare123'),bareVault=await Vault.encrypt(sample,bare);
  assert.equal(bareVault.recovery,undefined);await assert.rejects(Vault.decrypt(bareVault,code,true));
  for(const bad of [{...vault,keyWrap:undefined},{...vault,recovery:null},{...vault,keyWrap:{...vault.keyWrap,iterations:1}},{...vault,version:4},{...vault,payload:'invalid!'}])assert.throws(()=>Vault.validate(bad));
  for(const [version,iterations] of [[1,100000],[2,310000]]){
    const old=await legacyVault(version,iterations);await assert.rejects(Vault.decrypt(old,'wrong123'));
    const result=await Vault.decrypt(old,'legacy123');assert.equal(result.migrated,true);assert.deepEqual(result.data,sample);
    const migrated=await Vault.encrypt(result.data,result.session);assert.equal(migrated.version,3);assert.equal(migrated.recovery,undefined);
    const reopened=await Vault.decrypt(migrated,'legacy123');assert.deepEqual(reopened.data,sample);Vault.clearSession(reopened.session);Vault.clearSession(result.session);
  }
  const raw=session.bytes;Vault.clearSession(session);assert.ok(raw.every(value=>value===0));assert.equal(session.key,null);assert.equal(session.envelope,null);
  Vault.clearSession(changed);Vault.clearSession(rotated);Vault.clearSession(bare);
  console.log('PASS v1/v2 migration, v3 password/recovery encryption, normalization, tamper rejection, regeneration, backup compatibility, key clearing');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
