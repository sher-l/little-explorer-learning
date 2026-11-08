(() => {
  'use strict';
  const KEY='little-explorer-play-timer-v1', game=document.getElementById('game');
  let state=null, panel=null, hooks={}, notified=false;
  try { state=JSON.parse(localStorage.getItem(KEY)||'null'); } catch (_) {}
  if (!state || typeof state!=='object') state={pin:null,deadline:0,locked:false};
  const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
  const digest=async pin=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('little-explorer-timer:'+pin)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  function shell(html) {
    if(!panel){panel=document.createElement('section');panel.id='playTimerDialog';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');game.append(panel);}
    panel.style.cssText='position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(42,52,35,.88);padding:20px;overflow:auto;font-family:system-ui,sans-serif;box-sizing:border-box';
    panel.innerHTML='<div style="background:#fff6d9;color:#51452f;border:6px solid #b9955e;border-radius:28px;padding:clamp(22px,4vw,48px);width:min(650px,100%);max-height:90vh;overflow:auto;text-align:center;font-size:clamp(18px,2.4vw,26px);box-sizing:border-box">'+html+'</div>';
    panel.querySelectorAll('button,input,select').forEach(e=>e.style.cssText='font:inherit;padding:.55em .8em;margin:.25em;border:2px solid #b9955e;border-radius:14px;max-width:90%;box-sizing:border-box');
  }
  const pinInput='<input id="timerPin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" maxlength="8" autocomplete="off" placeholder="4～8 位数字密码" aria-label="家长密码">';
  function remove(){panel?.remove();panel=null;}
  function lockView(){
    shell('<div style="font-size:3em">🌙</div><h2>休息时间到啦</h2><p>找家长来解锁，休息一下吧。</p><button id="timerSpeak" type="button">🔊 听一听</button><form id="timerUnlock">'+pinInput+'<button type="submit">家长解锁</button><p id="timerError" role="alert"></p></form>');
    panel.querySelector('#timerSpeak').onclick=()=>hooks.speak?.();
    panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const entered=panel.querySelector('#timerPin').value;if(!state.pin || await digest(entered)!==state.pin){panel.querySelector('#timerError').textContent='密码不对，请再试一次。';return;} state.deadline=0;state.locked=false;try{save();}catch(_){panel.querySelector('#timerError').textContent='无法保存，请检查浏览器存储设置。';return;}notified=false;remove();};
  }
  function check(){
    if(state.deadline && Date.now()>=state.deadline&&!state.locked){state.locked=true;try{save();}catch(_){};}
    if(state.locked){if(!panel || !panel.querySelector('#timerUnlock'))lockView();if(!notified && hooks.onLock){notified=true;hooks.onLock();}}
  }
  function open(){
    check();if(state.locked)return;
    const active=state.deadline>Date.now();
    shell('<h2>⏰ 定时休息</h2><p>'+(active?'已设置：'+Math.ceil((state.deadline-Date.now())/60000)+' 分钟后休息':'选择本次游戏时长')+'</p><form id="timerSettings"><label>游戏时长 <select id="timerMinutes"><option value="15">15 分钟</option><option value="30" selected>30 分钟</option><option value="45">45 分钟</option><option value="60">60 分钟</option><option value="90">90 分钟</option><option value="120">120 分钟</option></select></label><p>'+(state.pin?'输入家长密码':'设置家长密码（4～8 位数字）')+'</p>'+pinInput+(state.pin?'':'<input id="timerConfirm" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="再输入一次密码" aria-label="确认家长密码">')+'<p id="timerError" role="alert"></p><button type="submit">开始计时</button>'+(active?'<button id="timerCancel" type="button">关闭定时</button>':'')+'<button id="timerBack" type="button">返回</button></form>');
    const error=msg=>panel.querySelector('#timerError').textContent=msg;
    async function verify(){const pin=panel.querySelector('#timerPin').value;if(!/^\d{4,8}$/.test(pin)){error('请输入 4～8 位数字密码。');return false;}const hash=await digest(pin);if(state.pin && hash!==state.pin){error('密码不对，请再试一次。');return false;}if(!state.pin && panel.querySelector('#timerConfirm').value!==pin){error('两次输入的密码不一致。');return false;}return hash;}
    panel.querySelector('form').onsubmit=async e=>{e.preventDefault();const hash=await verify();if(!hash)return;state.pin=hash;state.deadline=Date.now()+Number(panel.querySelector('#timerMinutes').value)*60000;state.locked=false;try{save();}catch(_){error('无法保存，请检查浏览器存储设置。');return;}notified=false;remove();};
    panel.querySelector('#timerBack').onclick=remove;
    const cancel=panel.querySelector('#timerCancel');if(cancel)cancel.onclick=async()=>{if(!await verify())return;state.deadline=0;state.locked=false;try{save();}catch(_){error('无法保存，请检查浏览器存储设置。');return;}remove();};
  }
  document.addEventListener('keydown',e=>{if(panel)e.stopPropagation();},true);
  document.addEventListener('keyup',e=>{if(panel)e.stopPropagation();},true);
  addEventListener('visibilitychange',check);addEventListener('pageshow',check);
  addEventListener('storage',e=>{if(e.key===KEY){try{state=JSON.parse(e.newValue)||{pin:null,deadline:0,locked:false};}catch(_){}if(!state.locked && panel?.querySelector('#timerUnlock')){notified=false;remove();}check();}});
  window.AdventurePlayTimer={open,blocked:()=>!!panel||!!state.locked,configure:value=>{hooks=value;check();}};
  check();setInterval(check,1000);
})();
