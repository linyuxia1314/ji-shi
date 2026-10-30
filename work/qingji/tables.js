(() => {
  'use strict';
  const math=window.math.create();
  math.config({number:'BigNumber',precision:64});
  const limit=math.bignumber('999999999999.99');
  const cache=new Map();
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<i data-lucide="${name}"></i>`;
  let api,calculatorRow=null;
  function localTime(value=new Date()) {
    const part=n=>String(n).padStart(2,'0');
    return `${value.getFullYear()}-${part(value.getMonth()+1)}-${part(value.getDate())}T${part(value.getHours())}:${part(value.getMinutes())}`;
  }
  function validTime(value) {
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
    const parsed=new Date(value);return Number.isFinite(parsed.getTime())&&localTime(parsed)===value;
  }
  function calculate(raw) {
    if(cache.has(raw))return cache.get(raw);
    const expression=String(raw??'').normalize('NFKC').replaceAll('×','*').replaceAll('÷','/').replaceAll('−','-').trim().replace(/^=/,'');
    let result;
    try {
      if(!expression)result={empty:true,value:math.bignumber(0),text:''};
      else {
        if(expression.length>128||!/^[\d.\s+*/()\-]+$/.test(expression))throw Error('仅支持数字和加减乘除');
        const node=math.parse(expression);let count=0;
        function check(current,depth=0) {
          if(++count>100||depth>20)throw Error('算式过长');
          if(current.isConstantNode)return;
          if(current.isParenthesisNode){check(current.content,depth+1);return;}
          if(!current.isOperatorNode||!['+','-','*','/'].includes(current.op))throw Error('仅支持加减乘除');
          for(const arg of current.args)check(arg,depth+1);
        }
        check(node);
        const value=node.compile().evaluate();
        if(!math.isBigNumber(value)||!value.isFinite())throw Error('不能除以 0');
        if(value.abs().gt(limit))throw Error('金额超出范围');
        const rounded=value.toDecimalPlaces(2,4),normalized=rounded.isZero()?math.bignumber(0):rounded;
        result={value:normalized,text:normalized.toFixed(2),expression};
      }
    }catch(error){result={error:['仅支持数字和加减乘除','仅支持加减乘除','算式过长','不能除以 0','金额超出范围'].includes(error.message)?error.message:'算式未完成'};}
    if(cache.size>=2000)cache.delete(cache.keys().next().value);
    cache.set(raw,result);return result;
  }
  function validate(input) {
    if(!input||!['numbered','timed'].includes(input.kind)||!Array.isArray(input.rows)||input.rows.length>10000)throw Error('表格数据不正确');
    const ids=new Set();
    const rows=input.rows.map(row=>{
      if(!row||typeof row.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(row.id)||ids.has(row.id)||!validTime(row.time)||typeof row.description!=='string'||row.description.length>4000||typeof row.amount!=='string'||row.amount.length>128||typeof row.note!=='string'||row.note.length>1000)throw Error('表格记录不正确');
      ids.add(row.id);return {id:row.id,time:row.time,description:row.description,amount:row.amount,note:row.note};
    });
    return {kind:input.kind,rows};
  }
  const row=()=>({id:crypto.randomUUID(),time:localTime(),description:'',amount:'',note:''});
  const create=kind=>({kind,rows:[row()]});
  function ordered(table) {return table.kind==='timed'?[...table.rows].sort((a,b)=>a.time.localeCompare(b.time)):table.rows;}
  function summary(table) {
    let value=math.bignumber(0),pending=0;
    for(const row of table.rows){const result=calculate(row.amount);if(result.error)pending++;else value=math.add(value,result.value);}
    return {text:value.toFixed(2),pending,count:table.rows.length};
  }
  function text(table) {
    const heading=table.kind==='timed'?'日期时间\t记录\t金额（元）':'序号\t项目\t金额（元）\t备注';
    const lines=ordered(table).map((r,i)=>{
      const result=calculate(r.amount),amount=result.error?`未计算：${r.amount}`:result.empty?'':result.text;
      return [table.kind==='timed'?r.time.replace('T',' '):i+1,r.description,amount,...(table.kind==='numbered'?[r.note]:[]),...(result.expression&&result.expression!==amount?[`算式：${r.amount}`]:[])].join('\t');
    });
    const total=summary(table);
    return `${heading}\n${lines.join('\n')}\n\n合计：${total.text} 元${total.pending?`（${total.pending} 项待计算）`:''}`;
  }
  const current=()=>api.selected()?.table;
  const editable=()=>api.selected()&&!api.selected().deletedAt;
  function resized(field) {field.style.height='auto';field.style.height=`${Math.max(42,field.scrollHeight)}px`;}
  function amountMarkup(r,index,disabled) {
    const result=calculate(r.amount),value=result.error?r.amount:result.text;
    return `<div class="amount-field"><input class="amount-input" data-row-id="${escape(r.id)}" data-table-field="amount" value="${escape(value)}" aria-label="第 ${index+1} 行金额" aria-invalid="${!!result.error}" inputmode="decimal" autocomplete="off" maxlength="128"${disabled?' disabled':''}><button class="calc-row-button" data-calc-row="${escape(r.id)}" aria-label="计算第 ${index+1} 行金额" title="计算金额"${disabled?' disabled':''}>${icon('calculator')}</button></div><span class="amount-detail${result.error?' error':''}" data-amount-detail="${escape(r.id)}">${escape(result.error||'')}</span>`;
  }
  function render() {
    const table=current();if(!table)return;
    const disabled=!editable(),timed=table.kind==='timed',rows=ordered(table);
    $('tableKindLabel').textContent=timed?'时间表':'序号表';
    $('tableKindIcon').innerHTML=icon(timed?'clock-3':'list-ordered');
    $('addTableRow').disabled=disabled;
    const days=new Map();
    for(const r of rows){const key=r.time.slice(0,10);if(!days.has(key))days.set(key,[]);days.get(key).push(r);}
    let previousDay='',html='';
    rows.forEach((r,index)=>{
      if(timed&&previousDay!==r.time.slice(0,10)){
        previousDay=r.time.slice(0,10);
        html+=`<tr class="day-heading"><th colspan="4"><span>${escape(previousDay.replaceAll('-',' / '))}</span><span data-day-total="${previousDay}"></span></th></tr>`;
      }
      html+=`<tr data-table-row="${escape(r.id)}"><${timed?'td':'th'} class="index-cell"${timed?'':' scope="row"'}>${timed?`<button class="time-cell-button" data-edit-time="${escape(r.id)}" title="修改日期时间" aria-label="第 ${index+1} 行日期时间：${escape(r.time.replace('T',' '))}"${disabled?' disabled':''}>${escape(r.time.slice(11))}</button>`:index+1}</${timed?'td':'th'}><td><textarea class="table-description" data-row-id="${escape(r.id)}" data-table-field="description" aria-label="第 ${index+1} 行${timed?'记录':'项目'}" placeholder="${timed?'记录':'项目'}" rows="1" maxlength="4000"${disabled?' disabled':''}>${escape(r.description)}</textarea></td><td class="amount-cell">${amountMarkup(r,index,disabled)}</td>${timed?'':`<td><textarea class="table-note" data-row-id="${escape(r.id)}" data-table-field="note" aria-label="第 ${index+1} 行备注" placeholder="备注" rows="1" maxlength="1000"${disabled?' disabled':''}>${escape(r.note)}</textarea></td>`}<td class="row-command"><button class="icon-button" data-delete-row="${escape(r.id)}" title="删除此行" aria-label="删除第 ${index+1} 行"${disabled?' disabled':''}>${icon('x')}</button></td></tr>`;
    });
    $('recordTable').classList.toggle('timed-table',timed);
    $('recordTable').innerHTML=`<colgroup><col class="index-col"><col class="description-col"><col class="amount-col">${timed?'':'<col class="note-col">'}<col class="command-col"></colgroup><thead><tr><th scope="col">${timed?'时间':'序号'}</th><th scope="col">${timed?'记录':'项目'}</th><th scope="col">金额<span class="unit"> / 元</span></th>${timed?'':'<th scope="col">备注</th>'}<th scope="col"><span class="sr-only">操作</span></th></tr></thead><tbody>${html}</tbody>`;
    $('tableEmpty').hidden=rows.length>0;
    $('tableScroll').querySelectorAll('textarea').forEach(resized);
    totals();api.icons();
  }
  function totals() {
    const table=current();if(!table)return;
    const total=summary(table);
    $('tableTotal').textContent=total.text;
    $('tablePending').textContent=total.pending?`${total.pending} 项待计算`:'';
    $('tableRowCount').textContent=`${total.count} 条`;
    $('tableScroll').querySelectorAll('[data-day-total]').forEach(el=>{
      const day=summary({rows:table.rows.filter(r=>r.time.startsWith(el.dataset.dayTotal))});
      el.textContent=`${day.text} 元${day.pending?' · 待计算':''}`;
    });
  }
  function changed() {api.changed();totals();}
  function addRow() {
    if(!editable())return;
    if(current().rows.length>=10000){api.toast('每张表最多 10000 行');return;}
    const added=row();current().rows.push(added);changed();render();
    requestAnimationFrame(()=>document.querySelector(`[data-table-row="${added.id}"] .table-description`)?.focus());
  }
  function updateAmountField(field,r) {
    const result=calculate(r.amount),detail=$('tableScroll').querySelector(`[data-amount-detail="${r.id}"]`);
    field.setAttribute('aria-invalid',String(!!result.error));detail.textContent=result.error||'';detail.classList.toggle('error',!!result.error);
  }
  function calculator(id) {
    if(!editable())return;
    const r=current().rows.find(r=>r.id===id)||current().rows[0];if(!r)return;
    calculatorRow=r.id;
    api.modal(`${api.modalHead('金额计算')}<div class="modal-body calculator-body"><input id="calcExpression" class="field calc-expression" value="${escape(r.amount)}" maxlength="128" inputmode="decimal" aria-label="计算算式" autocomplete="off"><output id="calcResult" class="calc-result" aria-live="polite"></output><div class="calculator-keys">${['clear','(',')','backspace','7','8','9','÷','4','5','6','×','1','2','3','−','0','.','negative','+'].map(key=>`<button type="button" data-calc-key="${key}" class="calc-key${['÷','×','−','+'].includes(key)?' operator':''}" aria-label="${({clear:'清空',backspace:'删除一位',negative:'切换正负'})[key]||key}">${key==='clear'?icon('rotate-ccw'):key==='backspace'?icon('delete'):key==='negative'?'±':key}</button>`).join('')}</div><button id="applyCalculation" class="primary calc-apply" aria-label="计算并填入金额">=</button></div>`);
    const result=()=>{
      const value=calculate($('calcExpression').value);
      $('calcResult').textContent=value.error||`${value.text||'0.00'} 元`;
      $('calcResult').classList.toggle('error',!!value.error);$('applyCalculation').disabled=!!value.error;
    };
    $('calcExpression').oninput=result;
    document.querySelectorAll('[data-calc-key]').forEach(button=>button.onclick=()=>{
      const input=$('calcExpression'),key=button.dataset.calcKey,value=input.value;
      let next=key==='clear'?'':key==='backspace'?value.slice(0,-1):key==='negative'?(value.startsWith('-(')&&value.endsWith(')')?value.slice(2,-1):`-(${value||'0'})`):value+key;
      input.value=next.slice(0,128);result();
    });
    $('applyCalculation').onclick=()=>{
      const target=current()?.rows.find(r=>r.id===calculatorRow);if(!target||!editable())return;
      const expression=$('calcExpression').value.trim(),value=calculate(expression);if(value.error)return;
      target.amount=expression;changed();$('modal').close();render();
    };
    result();api.icons();
  }
  function editTime(id) {
    if(!editable())return;
    const target=current().rows.find(r=>r.id===id);if(!target)return;
    api.modal(`${api.modalHead('日期时间')}<form id="rowTimeForm" class="modal-body"><input id="rowTime" class="field" type="datetime-local" value="${escape(target.time)}" aria-label="记录日期时间" required><p id="timeError" class="form-error" role="alert"></p><div class="modal-footer"><button type="button" class="secondary" data-action="close-modal">取消</button><button type="submit" class="primary">保存</button></div></form>`);
    $('rowTimeForm').onsubmit=event=>{event.preventDefault();const value=$('rowTime').value;if(!validTime(value)){$('timeError').textContent='日期时间不正确';return;}target.time=value;changed();$('modal').close();render();};
  }
  function init(options) {
    api=options;
    $('tableScroll').addEventListener('focusin',event=>{
      const field=event.target.closest('[data-table-field="amount"]');
      if(field){const r=current()?.rows.find(r=>r.id===field.dataset.rowId);if(r&&field.value!==r.amount){field.value=r.amount;field.select();}}
    });
    $('tableScroll').addEventListener('input',event=>{
      const field=event.target.closest('[data-table-field]');if(!field||!editable())return;
      const r=current().rows.find(r=>r.id===field.dataset.rowId);if(!r)return;
      r[field.dataset.tableField]=field.value;
      if(field.tagName==='TEXTAREA')resized(field);else updateAmountField(field,r);
      changed();
    });
    $('tableScroll').addEventListener('focusout',event=>{
      const field=event.target.closest('[data-table-field="amount"]');if(!field)return;
      const r=current()?.rows.find(r=>r.id===field.dataset.rowId);if(!r)return;
      const result=calculate(r.amount);field.value=result.error?r.amount:result.text;updateAmountField(field,r);
    });
    $('tableScroll').addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.shiftKey||event.isComposing||!editable())return;
      const field=event.target.closest('[data-table-field]');if(!field)return;
      event.preventDefault();
      if(field.dataset.tableField==='description')field.closest('tr').querySelector('.amount-input').focus();
      else if(field.dataset.tableField==='amount'){
        field.blur();const rows=ordered(current()),index=rows.findIndex(r=>r.id===field.dataset.rowId);
        if(index===rows.length-1)addRow();else document.querySelector(`[data-table-row="${rows[index+1].id}"] .table-description`).focus();
      }
    });
    $('tableScroll').addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      if(button.dataset.calcRow)calculator(button.dataset.calcRow);
      if(button.dataset.editTime)editTime(button.dataset.editTime);
      if(button.dataset.deleteRow){
        const id=button.dataset.deleteRow;
        api.confirm('删除记录','删除这一行记录？',()=>{current().rows=current().rows.filter(r=>r.id!==id);changed();render();},'删除',true);
      }
    });
    $('addTableRow').onclick=addRow;
    $('tableCalculator').onclick=()=>calculator(calculatorRow);
  }
  function clear() {
    cache.clear();calculatorRow=null;
    $('recordTable').innerHTML='';
    for(const id of ['tableKindIcon','tableKindLabel','tableRowCount','tablePending'])$(id).textContent='';
    $('tableTotal').textContent='0.00';
  }
  window.QingjiTables={init,render,calculate,validate,create,summary,text,localTime,addRow,clear};
})();
