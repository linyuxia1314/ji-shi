(() => {
  'use strict';
  const ITERATIONS = 310000;
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const encoder = new TextEncoder();
  const bytes = length => crypto.getRandomValues(new Uint8Array(length));
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  function encode(value) {
    let result = '';
    for (let i = 0; i < value.length; i += 8192) result += String.fromCharCode(...value.subarray(i, i + 8192));
    return btoa(result);
  }
  const aes = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const params = (iv, purpose) => ({name:'AES-GCM', iv, additionalData:encoder.encode(`qingji/v3/${purpose}`)});
  async function passwordKey(password, salt, iterations = ITERATIONS) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations, hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  }
  function normalizeCode(value) {
    const code = String(value).normalize('NFKC').toUpperCase().replace(/[\s-]/g, '');
    if (code.length !== 32 || [...code].some(c => !ALPHABET.includes(c))) throw Error('恢复码格式不正确');
    return code;
  }
  function generateCode() {
    const random = bytes(20);
    let buffer = 0, bits = 0, code = '';
    for (const value of random) {
      buffer = (buffer << 8) | value;
      bits += 8;
      while (bits >= 5) { bits -= 5; code += ALPHABET[(buffer >>> bits) & 31]; }
      buffer &= (1 << bits) - 1;
    }
    random.fill(0);
    return code.match(/.{4}/g).join('-');
  }
  async function recoveryKey(code, salt) {
    const material = await crypto.subtle.importKey('raw', encoder.encode(normalizeCode(code)), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'HKDF', salt, info:encoder.encode('qingji/v3/recovery'), hash:'SHA-256'}, material, {name:'AES-GCM', length:256}, false, ['encrypt', 'decrypt']);
  }
  async function wrapKey(raw, credential, recovery = false) {
    const salt = bytes(16), iv = bytes(12);
    const key = recovery ? await recoveryKey(credential, salt) : await passwordKey(credential, salt);
    const payload = await crypto.subtle.encrypt(params(iv, recovery ? 'recovery-key' : 'password-key'), key, raw);
    return {salt:encode(salt), iv:encode(iv), payload:encode(new Uint8Array(payload)), ...(!recovery ? {iterations:ITERATIONS} : {})};
  }
  async function unwrapKey(wrap, credential, recovery) {
    const key = recovery ? await recoveryKey(credential, decode(wrap.salt)) : await passwordKey(credential, decode(wrap.salt), wrap.iterations);
    const raw = new Uint8Array(await crypto.subtle.decrypt(params(decode(wrap.iv), recovery ? 'recovery-key' : 'password-key'), key, decode(wrap.payload)));
    if (raw.length !== 32) { raw.fill(0); throw Error('加密密钥格式不正确'); }
    return raw;
  }
  function clearSession(session) {
    if (!session) return;
    session.bytes?.fill(0);
    session.key = null;
    session.envelope = null;
  }
  async function createSession(password, code = null) {
    const raw = bytes(32);
    try {
      const keyWrap = await wrapKey(raw, password);
      const recovery = code ? await wrapKey(raw, code, true) : null;
      return {bytes:raw, key:await aes(raw), envelope:{keyWrap, ...(recovery ? {recovery} : {})}};
    } catch (error) { raw.fill(0); throw error; }
  }
  async function rewrapPassword(session, password) {
    const keyWrap = await wrapKey(session.bytes, password);
    return {bytes:session.bytes, key:session.key, envelope:{...session.envelope, keyWrap}};
  }
  function validBlob(value, length, limit) {
    return typeof value === 'string' && value.length <= limit && (length === null ? decode(value).length >= 16 : decode(value).length === length);
  }
  const validIterations = value => Number.isInteger(value) && value >= 100000 && value <= 1000000;
  function validWrap(wrap, recovery = false) {
    return wrap && validBlob(wrap.salt, 16, 64) && validBlob(wrap.iv, 12, 64) && validBlob(wrap.payload, 48, 64) && (recovery || validIterations(wrap.iterations));
  }
  function validate(vault) {
    if (!vault || vault.format !== 'qingji' || ![1, 2, 3].includes(vault.version) || typeof vault.encrypted !== 'boolean') throw Error('不是有效的轻记备份');
    if (!vault.encrypted) return vault;
    try {
      if (!validBlob(vault.iv, 12, 64) || !validBlob(vault.payload, null, 30000000)) throw Error();
      if (vault.version === 3) {
        if (!validWrap(vault.keyWrap) || (vault.recovery !== undefined && !validWrap(vault.recovery, true))) throw Error();
      } else if (!validBlob(vault.salt, 16, 64) || !validIterations(vault.iterations)) throw Error();
    } catch { throw Error('加密备份格式不正确'); }
    return vault;
  }
  async function encrypt(data, session) {
    const iv = bytes(12), plain = encoder.encode(JSON.stringify(data));
    try {
      const payload = await crypto.subtle.encrypt(params(iv, 'data'), session.key, plain);
      return {format:'qingji', version:3, encrypted:true, ...session.envelope, iv:encode(iv), payload:encode(new Uint8Array(payload)), updatedAt:new Date().toISOString()};
    } finally { plain.fill(0); }
  }
  async function decrypt(vault, credential, recovery = false) {
    validate(vault);
    let session = null, plain = null, raw = null;
    try {
      if (vault.version === 3) {
        if (recovery && !vault.recovery) throw Error('此备份没有恢复码');
        raw = await unwrapKey(recovery ? vault.recovery : vault.keyWrap, credential, recovery);
        session = {bytes:raw, key:await aes(raw), envelope:{keyWrap:vault.keyWrap, ...(vault.recovery ? {recovery:vault.recovery} : {})}};
        plain = new Uint8Array(await crypto.subtle.decrypt(params(decode(vault.iv), 'data'), session.key, decode(vault.payload)));
        const data = JSON.parse(new TextDecoder().decode(plain));
        const migrated = vault.keyWrap.iterations !== ITERATIONS;
        if (migrated && !recovery) session = await rewrapPassword(session, credential);
        return {data, session, migrated:migrated && !recovery};
      }
      if (recovery) throw Error('此备份没有恢复码');
      const key = await passwordKey(credential, decode(vault.salt), vault.iterations);
      plain = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM', iv:decode(vault.iv)}, key, decode(vault.payload)));
      const data = JSON.parse(new TextDecoder().decode(plain));
      session = await createSession(credential);
      return {data, session, migrated:true};
    } catch (error) { clearSession(session); raw?.fill(0); throw error; }
    finally { plain?.fill(0); }
  }
  window.QingjiVault = {validate, encrypt, decrypt, createSession, rewrapPassword, clearSession, generateCode, normalizeCode};
})();
