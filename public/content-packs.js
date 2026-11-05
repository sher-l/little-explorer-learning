(function(root){
  'use strict';
  const qa=new URLSearchParams(root.location?.search||'').get('qa'),prefix=qa?'forest.adventure.qa.'+qa+'.':(root.AdventureRuntime?.storagePrefix||'forest.adventure.'),key=prefix+'content.v1',previous=key+'.previous',bundled=root.AdventureContent;
  const maxBytes=4*1024*1024,clone=x=>JSON.parse(JSON.stringify(x));let message='';
  function compatible(bank){
    const next=root.AdventureBank.load(bank);if(next.bankId!==bundled.bankId)throw Error('这个题库不属于当前游戏。');
    if(JSON.stringify(next.items)!==JSON.stringify(bundled.items)||JSON.stringify(next.pictureIds)!==JSON.stringify(bundled.pictureIds))throw Error('物品或图片资源不兼容，请使用配套游戏升级。');
    const questions=[...next.questions,...next.easy,...next.poems,...(next.legacyQuestions||[])],old=[...bundled.questions,...bundled.easy,...bundled.poems,...(bundled.legacyQuestions||[])];
    for(const q of old){const n=questions.find(n=>n.id===q.id);if(!n||n.kind!==q.kind||n.region!==q.region)throw Error('不能删除或改变既有题目类型：'+q.id);}
    return next;
  }
  async function inspect(text){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes)throw Error('题库包过大，最多 4 MiB。');
    const pack=JSON.parse(text);if(pack.format!=='adventure-content'||pack.schemaVersion!==1||pack.engineMajor!==1||!/^\d{4}-\d{2}-\d{2}\.[\w.-]+$/.test(pack.version)||!/^[a-z0-9_.-]{1,80}$/.test(pack.id)||!/^[a-f0-9]{64}$/.test(pack.sha256))throw Error('题库包格式不正确。');
    const bytes=new TextEncoder().encode(JSON.stringify(pack.bank)),actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(actual!==pack.sha256)throw Error('文件校验失败，请重新取得完整题库。');
    const bank=compatible(pack.bank);if(bank.revision!==pack.version)throw Error('包版本与题库版本不一致。');return{pack,bank,stats:root.AdventureBank.stats(bank),bytes:bytes.length};
  }
  try{const stored=localStorage.getItem(key);if(stored){const p=JSON.parse(stored);root.AdventureContent=compatible(p.bank);message='已加载本地题库 '+p.version;}}catch(e){message='已回到内置题库：'+e.message;}
  root.AdventurePacks={message,bundled,inspect,key,previous,async install(text){const checked=await inspect(text),old=localStorage.getItem(key);if(old)localStorage.setItem(previous,old);localStorage.setItem(key,JSON.stringify(checked.pack));return checked;},rollback(){const old=localStorage.getItem(previous);if(!old)throw Error('没有上一份题库。');compatible(JSON.parse(old).bank);const current=localStorage.getItem(key);localStorage.setItem(key,old);if(current)localStorage.setItem(previous,current);},useBundled(){const old=localStorage.getItem(key);if(old)localStorage.setItem(previous,old);localStorage.removeItem(key);},exportBank:()=>clone(root.AdventureContent)};
})(window);
