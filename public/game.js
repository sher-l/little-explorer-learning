(() => {
  'use strict';
  const $=id=>document.getElementById(id), cv=$('world'),ctx=cv.getContext('2d',{alpha:false});
  const TEST_OPEN=new URLSearchParams(location.search).get('test')==='open';
  const data=window.AdventureContent, QA=TEST_OPEN?'open-doors17':new URLSearchParams(location.search).get('qa');
  const SAVE=QA?'forest.adventure.qa.'+QA:(window.AdventureRuntime?.storagePrefix||'forest.adventure.')+'v1';
  let saved;try{saved=localStorage.getItem(SAVE)||undefined;}catch{}
  const journey=new ForestJourney(data,saved),state=journey.state;
  let storageOK=true,mode='world',scene='hub',area=0,time=0,last=0,ready=false,focusIndex=0,entryCooldown=0,actionTimer=0,actionWakeUntil=0,actionWakeAt=0,lastNativeFrame=0;
  let player={x:810,y:680,dir:0,walk:0,moving:false,roll:0},route=[],routeAction=null,returningHome=false;
  let view={w:1280,h:720,scale:1,x:0,y:0},keys=new Set(),padOld=[],navCooldown=0,padAxes={x:0,y:0};
  let inputMode='keyboard';
  function setInputMode(next,force=false){
    if(inputMode===next&&!force)return;inputMode=next;$('game').dataset.input=next;renderDirty=true;
    const labels=next==='gamepad'?{interact:'A',voice:'X',lamp:'Y',roll:'B',home:'Back',pause:'Start'}:next==='touch'?{interact:'点按',voice:'听题',lamp:'帮助',roll:'翻滚',home:'返回',pause:'暂停'}:{interact:'Enter',voice:'X',lamp:'C',roll:'Z',home:'T',pause:'Esc'};
    for(const [id,label]of Object.entries(labels))$(id).querySelector('kbd').textContent=label;
    $('hint').textContent=next==='gamepad'?'摇杆 / 十字键走动 · A 互动':next==='touch'?'点地面走动 · 走近后点互动':'方向键 / WASD 走动 · Enter 互动';
    if($('pauseInputHint'))$('pauseInputHint').textContent='进度已经记下了 · '+(next==='gamepad'?'Start':next==='touch'?'点继续探险':'Esc')+' 继续';
  }
  let critterScene='',wildlife=null,catchCooldown=0,catchBurst=null,altarGuide=null;
  let rewardBurst=null,noticeUntil=0,animation=null,pausedMode='world',pausedAt=0,lastSpeech='',transitionToken=0,restoringLight=false;
  const reduced=!!window.NOFX||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const worlds=window.AdventureWorlds, regions=worlds.regions;
  const imgs={},assetLoads={},assetNames=['fauna','items','helpers',worlds.hub.image];
  const imageURL=name=>'assets/'+name+'.'+(window.AdventureRuntime?.imageFormat||'png')+(/^characters\/(kitten|puppy)\/front$/.test(name)?'?v=20261106.16':'');
  let activeCharacter='rabbit',characterRequest=0;
  const character=()=>AdventureCharacters[activeCharacter];
  const region=()=>regions[state.activeRegion], stage=()=>region().stages[area];
  const areaNames=new Proxy([], {get:(_,i)=>region().stages[i]?.name});
  const spots=new Proxy({}, {get:(_,id)=>{const it=data.items[Number(id)];return it?regions[it.region].stages[it.stage].spots[it.id%5]:null;}});
  const areaEntries=new Proxy([], {get:(_,i)=>region().stages[i]?.entry});
  const areaStarts=new Proxy([], {get:(_,i)=>region().stages[i]?.start});
  const areaExits=new Proxy([], {get:(_,i)=>region().stages[i]?.exit});
  const altars=new Proxy([], {get:(_,i)=>region().stages[i]?.altar});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let growthMenu;let quiz,bookRegion='forest',renderDirty=true;const perf=[];let renderDPR=1;
  const glowCache=new Map(),alphaBoundsCache=new Map(),occlusionAlpha=new Map();
  let visualState={glows:[],occluders:[],playerBounds:null},visualFrameAt=performance.now(),visualDt=0;
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const WALK_SPEED=184,ROLL_DURATION=.62,ROLL_DISTANCE=96,EXIT_RADIUS=72;
  const clamp01=n=>Math.max(0,Math.min(1,n)),smooth=n=>{n=clamp01(n);return n*n*(3-2*n);};
  const interactionRadius=e=>e.exit?132:90;
  const entranceSignX=e=>e.x+(e.x>836?-106:106);
  const rollProgress=()=>player.roll>0?clamp01((performance.now()-player.rollStartedAt)/1000/ROLL_DURATION):0;
  function movePlayer(dx,dy){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/6));for(let i=0;i<steps;i++){if(walkable(player.x+dx/steps,player.y))player.x+=dx/steps;if(walkable(player.x,player.y+dy/steps))player.y+=dy/steps;}}
  const mapName=()=>scene==='hub'?worlds.hub.image:stage().image;
  function pointPoly(x,y,p){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
    const [xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }return inside;}
  function walkable(x,y){
    const geometry=scene==='hub'?worlds.hub:stage();if(geometry.maze)return AdventureMaze.walkable(geometry.maze,x,y);
    // Open exploration everywhere inside ordinary maps. Only the outer edge
    // and the unopened progression doorway block movement; mazes keep walls.
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<4||x>1668||y<4||y>937)return false;
    if(!TEST_OPEN&&scene==='forest'&&area<4&&state.segments<=area){const [gx,gy]=areaExits[area];if(Math.abs(x-gx)<62&&Math.abs(y-gy)<(gy>600?42:35))return false;}
    return true;
  }
  function clearLine(a,b){const maze=scene!=='hub'&&stage().maze;if(maze?.mask)return AdventureMaze.clearLine(maze,a,b);const n=Math.ceil(dist(a,b)/2);for(let i=0;i<=n;i++)if(!walkable(a.x+(b.x-a.x)*i/(n||1),a.y+(b.y-a.y)*i/(n||1)))return false;return true;}
  const navigationStep=()=>scene!=='hub'&&stage().maze?12:18;
  function nearest(x,y,visible=false){const STEP=navigationStep();let best=null,dd=Infinity;for(let gy=0;gy<Math.ceil(941/STEP);gy++)for(let gx=0;gx<Math.ceil(1672/STEP);gx++){
    const px=gx*STEP+STEP/2,py=gy*STEP+STEP/2,d=(px-x)**2+(py-y)**2;
    if(d<dd&&walkable(px,py)&&(!visible||clearLine({x,y},{x:px,y:py}))){best={x:gx,y:gy};dd=d;}
  }return best;}
  function pathTo(x,y){
    const STEP=navigationStep();
    const from=nearest(player.x,player.y,true),to=nearest(x,y);if(!from||!to)return [];
    const key=n=>n.x+','+n.y,start=key(from),queue=[from],parent=new Map([[start,null]]);let end=key(to),at=0;
    while(at<queue.length){const n=queue[at++];if(key(n)===end)break;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
        const next={x:n.x+dx,y:n.y+dy},k=key(next);if(parent.has(k))continue;
        if(!walkable(next.x*STEP+STEP/2,next.y*STEP+STEP/2)||!clearLine({x:n.x*STEP+STEP/2,y:n.y*STEP+STEP/2},{x:next.x*STEP+STEP/2,y:next.y*STEP+STEP/2}))continue;
        if(dx&&dy&&(!walkable((n.x+dx)*STEP+STEP/2,n.y*STEP+STEP/2)||!walkable(n.x*STEP+STEP/2,(n.y+dy)*STEP+STEP/2)))continue;
        parent.set(k,key(n));queue.push(next);
      }
    }
    if(!parent.has(end)){let best=Infinity;for(const k of parent.keys()){const [gx,gy]=k.split(',').map(Number),d=Math.hypot(gx*STEP+STEP/2-x,gy*STEP+STEP/2-y);if(d<best){best=d;end=k;}}}
    const result=[];let k=end;while(k&&k!==start){const [gx,gy]=k.split(',').map(Number);result.push({x:gx*STEP+STEP/2,y:gy*STEP+STEP/2});k=parent.get(k);}
    const raw=[{x:from.x*STEP+STEP/2,y:from.y*STEP+STEP/2},...result.reverse()];
    const smooth=[];let anchor={x:player.x,y:player.y},i=0;
    while(i<raw.length){let far=i;while(far+1<raw.length&&clearLine(anchor,raw[far+1]))far++;smooth.push(raw[far]);anchor=raw[far];i=far+1;}
    return smooth;
  }
  function persist(){if(!journey.canPersist){storageOK=false;updateHUD();return;}try{if(saved&&JSON.parse(saved).version<4&&!localStorage.getItem(SAVE+'.before-v4'))localStorage.setItem(SAVE+'.before-v4',saved);localStorage.setItem(SAVE,JSON.stringify(journey.snapshot()));}catch{storageOK=false;notify('这次进度暂时留在这里，请让家长检查存储空间',5);}updateHUD();}
  function atlas(name,i,rows,cls=''){return `<span class="asset ${cls}" style="background-image:url('${imageURL(name)}');background-size:500% ${rows*100}%;background-position:${(i%5)*25}% ${Math.floor(i/5)*100/(rows-1)}%" aria-hidden="true"></span>`;}
  function asset(i,cls=''){return atlas('items',Number.isInteger(i)&&i>=0&&i<20?i:0,4,cls);}
  function itemAsset(id,cls=''){const it=data.items[id];return it?atlas(it.region==='forest'?'items':it.region+'-items',it.icon,it.region==='forest'?4:3,cls):'';}
  function helperAsset(medal=false,cls=''){return atlas('helpers',region().index+(medal?5:0),2,cls);}
  function picture(id){if(/^item-\d+$/.test(id))return itemAsset(Number(id.slice(5)),'learning-picture');const i=window.AdventurePictures.indexOf(id);return i<0?'':atlas('pictures-'+Math.floor(i/15),i%15,3,'learning-picture');}
  function notify(text,seconds=3){$('notice').textContent=text;$('notice').classList.add('show');noticeUntil=time+seconds;}
  const audio={ctx:null,enabled:false,chain:Promise.resolve(),cancel:null,active:false,voices:[],events:[],epoch:0,clips:new Map(),
    loadClip(path){
      if(this.clips.has(path))return this.clips.get(path);
      const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),12000);
      const request=fetch(path,{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('voice unavailable');return r.arrayBuffer();}).then(b=>this.ctx.decodeAudioData(b)).catch(e=>{this.clips.delete(path);throw e;}).finally(()=>clearTimeout(deadline));
      this.clips.set(path,request);if(this.clips.size>24)this.clips.delete(this.clips.keys().next().value);return request;
    },
    unlock(){
      if(!this.ctx){try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch{}}
      if(this.ctx){this.ctx.onstatechange=()=>{$('enableSound').hidden=this.ctx.state==='running';};if(this.ctx.state==='suspended'){$('enableSound').hidden=false;this.ctx.resume().catch(()=>{});}}
      if(!this.enabled){this.enabled=true;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u);}catch{}}
      this.voices=window.speechSynthesis?.getVoices()||[];
    },
    stop(){this.epoch++;const native=this.nativeSpeaking;if(this.cancel)this.cancel();if(native)try{speechSynthesis.cancel();}catch{}this.chain=Promise.resolve();},
    say(text,{interrupt=false,lang='zh-CN',rate=1}={}){
      text=String(text).replace(/。{2,}/g,'。');
      rate=Math.max(.65,Math.min(1.2,Number(rate)||1));
      lastSpeech=text;if(interrupt)this.stop();
      const epoch=this.epoch;
      const run=()=>new Promise(resolve=>{
        if(epoch!==this.epoch){resolve();return;}
        const started=performance.now();let done=false,timer,playback=null,playbackGain=null,nativeStarted=false;
        const finish=reason=>{if(done)return;done=true;clearTimeout(timer);if(playback){playback.onended=null;try{playback.stop();}catch{}playback.disconnect();}playbackGain?.disconnect();this.active=false;this.nativeSpeaking=false;this.cancel=null;this.events.push({text,reason,ms:Math.round(performance.now()-started)});if(this.events.length>200)this.events.shift();resolve({reason});};
        this.cancel=()=>finish('cancelled');this.active=true;
        if(!this.enabled||!state.volume){timer=setTimeout(()=>finish('silent'),Math.min(3000,800+text.length*100));return;}
        const native=()=>{
          if(done||nativeStarted||epoch!==this.epoch)return;nativeStarted=true;clearTimeout(timer);
          if(!window.speechSynthesis){finish('unavailable');return;}
          const u=new SpeechSynthesisUtterance(text);u.lang=lang;u.rate=.95*rate;u.pitch=1;u.volume=state.volume;
          this.voices=speechSynthesis.getVoices();const voice=this.voices.find(v=>v.localService&&(lang.startsWith('en')?/^en/i.test(v.lang):/^zh|^cmn/i.test(v.lang)));if(voice)u.voice=voice;
          if(!voice){notify('这句声音暂时没有准备好，请再听一次，或请家长念一下',6);finish('local-voice-unavailable');return;}
          u.onend=()=>finish('ended');u.onerror=()=>finish('error');
          timer=setTimeout(()=>{try{speechSynthesis.cancel();}catch{}finish('timeout');},text.length*.22/(.88*rate)*1000+800);
          this.nativeSpeaking=true;try{speechSynthesis.speak(u);}catch{finish('unavailable');}
        };
        const path=window.AdventureSpeech?.[lang+'\n'+text];
        if(path&&this.ctx?.state!=='running'){$('enableSound').hidden=false;notify('请家长点一下“开启声音”，再按 X 重听',7);finish('blocked');return;}
        if(path&&this.ctx?.state==='running'){
          // Keep the recorded question authoritative while it loads. A slow
          // download must not silently replace it with unavailable device TTS.
          timer=setTimeout(()=>{notify('声音加载较慢，按 X 或“再听一次”重试',7);finish('unavailable');},13000);
          this.loadClip(path).then(buffer=>{
            if(done||nativeStarted||epoch!==this.epoch)return;clearTimeout(timer);
            playback=this.ctx.createBufferSource();playback.buffer=buffer;playback.playbackRate.value=rate;
            playbackGain=this.ctx.createGain();playbackGain.gain.value=state.volume;playback.connect(playbackGain);playbackGain.connect(this.ctx.destination);
            playback.onended=()=>finish('recorded');
            timer=setTimeout(()=>finish('recorded-timeout'),buffer.duration/rate*1000+1200);playback.start();
          }).catch(()=>{notify('这句录音暂时没下载好，按 X 或“再听一次”重试',7);finish('unavailable');});
        }else native();
      });this.chain=this.chain.catch(()=>{}).then(run);return this.chain;
    },
    tone(notes=[523,659,784]){
      if(!this.ctx||!state.volume)return;
      notes.forEach((f,i)=>{const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime+i*.09;
        o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.12*state.volume,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+.3);o.connect(g);g.connect(this.ctx.destination);o.start(t);o.stop(t+.32);});
    }
  };
  $('enableSound').onclick=()=>{audio.unlock();audio.say(lastSpeech||'欢迎来到世界之心',{interrupt:true});};
  if(window.speechSynthesis)speechSynthesis.addEventListener('voiceschanged',()=>{audio.voices=speechSynthesis.getVoices();});
  function updateHUD(){
    $('place').textContent=scene==='hub'?'世界之心':areaNames[area];
    $('task').textContent=scene==='hub'?(journey.allComplete()?'五枚印记都亮了 · 再去看看老朋友':'五条小路，五种新的发现'):state.segments===5?'这一枚印记已经完整啦':area<state.segments?'沿前面的小路，继续探险':state.bag.length===5?(state.activeRegion==='sea'?'伙伴齐啦，找发光贝壳吧':'五样齐啦，送到石坛吧'):region().action+' · '+(area+1)+'/5';
    if(scene!=='hub'&&journey.isReplaying())$('task').textContent='新一轮 · 第 '+(area+1)+' 站 · '+state.bag.length+'/5';
    $('bag').innerHTML=Array.from({length:5},(_,i)=>`<span class="slot ${state.bag[i]!==undefined?'filled':''}">${state.bag[i]!==undefined?itemAsset(state.bag[i]):''}</span>`).join('');
    $('bag').setAttribute('aria-label',`收集进度 ${state.bag.length}/5`);
    const bright=state.lamp&&!restoringLight;
    $('lamp').querySelector('.asset').outerHTML=helperAsset(false,'lantern');
    $('lampGlow').textContent=bright?'✦':'·';$('lamp').classList.toggle('is-dim',!bright);$('lamp').classList.toggle('is-bright',!!bright);
    $('lamp').setAttribute('aria-label',bright?region().tool.ready:region().tool.empty+'。'+region().tool.restore);
  }
  function showPanel(html,newMode){renderDirty=true;$('overlay').dataset.mode=newMode;$('overlay').dataset.region=state.activeRegion;$('overlay').dataset.side=player.x>836?'left':'right';mode=newMode;route=[];routeAction=null;keys.clear();$('overlay').hidden=false;$('panel').innerHTML=html;focusIndex=0;setFocus(0,false);}
  function closePanel(){renderDirty=true;quiz?.cancel();mode='world';$('overlay').hidden=true;$('panel').innerHTML='';}
  function buttons(){return [...$('panel').querySelectorAll('button:not([disabled])')];}
  function setFocus(n,dom=true){const list=buttons();if(!list.length)return;focusIndex=(n+list.length)%list.length;list.forEach((b,i)=>b.classList.toggle('focused',i===focusIndex));if(dom){list[focusIndex].focus({preventScroll:true});list[focusIndex].scrollIntoView({block:'nearest',inline:'nearest'});}}
  function moveFocus(dx,dy){const list=buttons();if(!list.length)return;const current=list[focusIndex]||list[0],r=current.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;
    const candidates=list.map((b,i)=>{const s=b.getBoundingClientRect(),x=s.x+s.width/2-cx,y=s.y+s.height/2-cy,forward=dx?x*dx:y*dy,cross=dx?Math.abs(y):Math.abs(x);return{i,forward,score:forward+cross*2.5};}).filter(x=>x.forward>4).sort((a,b)=>a.score-b.score);setFocus(candidates[0]?.i??focusIndex+((dx||dy)>0?1:-1));}
  function speech(text){notify(text,4);return audio.say(text,{interrupt:true});}
  function drawQuestion(){quiz.draw();}
  function beginItem(id){if(mode!=='world'||player.roll>0)return;if(journey.beginItem(id)){audio.tone([440]);notify('看看这次的新发现',2);persist();drawQuestion();}}

  async function help(){
    if(!['world','quiz'].includes(mode))return;
    if(mode==='world'){if(!state.lamp){route=[];routeAction=null;speech(region().tool.empty+'。回世界之心，'+region().tool.restore);}else{performAction('preview');speech(region().tool.ready+'。遇到题目时使用');}return;}
    if(journey.question.review){speech('慢慢来，我们再听一次');return;}
    if(!state.lamp){speech(region().tool.empty+'。先试着回答，或收起题目再回世界之心。'+region().tool.restore);return;}
    quiz.cancel();const result=journey.lamp();
    if(result.type==='poem_hint'){
      persist();const token=++transitionToken;$('overlay').hidden=true;await performAction('lamp');
      if(token!==transitionToken)return;drawQuestion();notify('小水母慢慢念，你跟着试一遍',5);return;
    }
    if(result.q)finishAnswer(result,result.q.correct);
  }
  function performAction(kind,item=null){
    const catching=kind==='catch',resume=catching&&route.length?{...route.at(-1),action:routeAction}:null;
    mode='action';route=[];routeAction=null;player.moving=false;player.roll=0;if(!catching)keys.clear();
    const facing=item?(spots[item.id].artX<player.x?-1:1):(player.dir===1?-1:1);if(!catching)player.dir=facing<0?1:2;
    return new Promise(resolve=>{
      animation={kind,t:0,frameAt:performance.now(),duration:kind==='borrowLight'?1.65:kind==='lamp'?1.05:kind==='pickup'?.72:catching?.62:1.05,item,facing,dir:player.dir,resume,contact:false,resolve};
      // The intro can leave an idle, throttled rAF pending. Show the response
      // in the input task instead of letting that wait consume the whole action.
      actionWakeAt=performance.now();actionWakeUntil=actionWakeAt+animation.duration*1000+450;render();renderDirty=false;keepActionVisible();
    });
  }
  async function finishAnswer(result,index){
    if(!result.q)return;mode='feedback';if(result.type==='charged')restoringLight=true;persist();const token=++transitionToken;
    quiz.cancel();
    $('panel').querySelectorAll('button').forEach(b=>b.disabled=true);
    const review=result.type==='reviewed'||result.type==='charged',feedbackStatus=$('choiceStatus')||$('poemStatus');
    const message=review?(result.type==='charged'?'三题完成！'+region().helper+'又有力量啦':'答对啦！复习 '+state.review+'/3'):result.helped?region().helper+'已使用，听听答案再认识它':(result.item?.discoveryKind==='creature'?'答对啦，认识新伙伴！':'答对啦，收集成功！');
    if(feedbackStatus){feedbackStatus.textContent=message;feedbackStatus.dataset.kind='correct';}
    const dots=$('reviewProgress');if(dots){const count=result.type==='charged'?3:state.review;dots.setAttribute('aria-label','复习完成 '+count+'/3');dots.querySelectorAll('span').forEach((dot,i)=>{dot.classList.toggle('on',i<count);dot.textContent=i<count?'✓':'○';});}
    if(review){const caption=$('panel').querySelector('.quiz-caption');if(caption)caption.textContent='复习旧题 · '+(result.type==='charged'?3:state.review)+'/3';}
    if(result.helped){$('overlay').hidden=true;await performAction('lamp');if(token!==transitionToken)return;}
    mode='feedback';const selected=$('panel').querySelector('[data-answer="'+index+'"]');selected?.classList.add(result.helped?'lit':'correct');audio.tone();
    const answerOption=result.q.options?.[result.q.correct];
    if(review){
      // Judgement and progress are already visible. Speech must never hold the
      // review screen indefinitely or queue behind an unfinished question.
      const readAnswer=index>=0&&result.q.focusVoicePolicy!=='silent'&&answerOption;
      const spoken=audio.say(readAnswer?(answerOption.voice||answerOption.label):result.q.kind==='poem'?(result.q.wholePoem?'这首读好啦':'这句读好啦'):'找到啦',{interrupt:true,lang:readAnswer?(answerOption.lang||result.q.lang||'zh-CN'):'zh-CN'});
      let timer;await Promise.all([new Promise(r=>setTimeout(r,700)),Promise.race([spoken,new Promise(r=>{timer=setTimeout(r,2200);})])]);clearTimeout(timer);
      if(token!==transitionToken)return;audio.stop();
      if(result.type==='reviewed'){if(journey.beginReview())drawQuestion();else closePanel();}
      else{$('overlay').hidden=true;notify('三题完成！'+region().helper+'正在恢复',4);await performAction('borrowLight');if(token!==transitionToken)return;closePanel();audio.tone([523,784,1047]);speech(helperRestored());}
      return;
    }
    // Show the answer once. Helping moves directly from the helper to collection,
    // without reopening the already answered question or replaying it.
    if(!result.helped){
      audio.say(answerOption?.voice||answerOption?.label||(result.q.wholePoem?'这首读好啦':'这句读好啦'),{interrupt:true,lang:answerOption?.lang||result.q.lang||'zh-CN'});
      await new Promise(r=>setTimeout(r,620));if(token!==transitionToken)return;
    }else audio.say(answerOption?.voice||answerOption?.label||'找到啦',{interrupt:true,lang:answerOption?.lang||result.q.lang||'zh-CN'});
    if(result.type==='collected'){
      $('overlay').hidden=true;await performAction('pickup',result.item);if(token!==transitionToken)return;
      closePanel();rewardBurst={item:result.item,startedAt:performance.now()};
      $('bag').classList.remove('reward-pop');void $('bag').offsetWidth;$('bag').classList.add('reward-pop');
      audio.tone([659,880,1047]);notify((result.item.discoveryKind==='creature'?'认识了':'收集到')+result.item.name+(result.full?' · 五样齐啦，去点亮印记吧':''),4);
      audio.say(result.item.name+'。'+result.item.desc+'。',{interrupt:true});showDiscovery(result.item);
    }
  }
  let discoveryCard=null;
  function hideDiscovery(){discoveryCard?.remove();discoveryCard=null;keys.clear();renderDirty=true;}
  function showDiscovery(item,illustration){
    hideDiscovery();route=[];routeAction=null;returningHome=false;player.moving=false;
    const layer=document.createElement('div');layer.className='discovery-layer';
    layer.innerHTML='<section class="discovery-card" role="dialog" aria-modal="true" aria-labelledby="discoveryTitle">'+(illustration||itemAsset(item.id))+'<div><small>'+esc(item.caption||'收集到新发现')+'</small><h2 id="discoveryTitle">'+esc(item.name)+'</h2><p>'+esc(item.desc)+'</p></div><button aria-label="关闭介绍">收好，继续探险</button><small class="discovery-controls">A / B · Enter / Z 关闭</small></section>';
    layer.querySelector('button').onclick=e=>{e.stopPropagation();hideDiscovery();};
    layer.addEventListener('pointerdown',e=>e.stopPropagation());$('game').append(layer);discoveryCard=layer;layer.querySelector('button').focus({preventScroll:true});
  }

  function helperRestored(){return {forest:'萤火虫飞进提灯，灯又亮了',castle:'故事星火点亮烛灯啦',beach:'海风吹进海螺，它又能唱歌啦',valley:'晶石连起光纹，萤石又亮了',sea:'水母吸收小气泡，又能引路啦'}[state.activeRegion];}
  function charge(){
    showPanel(`<h2>今天复习哪里？</h2><p>复习三题，只恢复对应区域的道具。</p><div class="review-regions">${Object.entries(regions).map(([id,r])=>`<button class="wood-button" data-review="${id}">${atlas('helpers',r.index,2)}<strong>${esc(r.name)}</strong><small>${esc(r.helper)} · ${state.regions[id].energy?'已准备好':journey.reviewQuestions(id).length?'复习进度 '+state.regions[id].review+'/3':'还没有学过的题'}</small></button>`).join('')}</div><button class="wood-button quiet-button" id="leaveReview">先去探险</button>`,'review-select');
    $('leaveReview').onclick=closePanel;
    $('panel').querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.review;if(state.regions[id].energy){speech(regions[id].helper+'已经准备好啦');return;}
      if(!journey.reviewQuestions(id).length){speech('这里还没有学过的题，先到'+regions[id].name+'探索吧');return;}
      if(journey.beginReview(id)){persist();drawQuestion();notify('复习'+regions[id].name+'的三道旧题',4);}
    });
  }
  function book(id=bookRegion){
    bookRegion=id;const group=data.items.filter(it=>it.region===id);
    showPanel(`<h2>我的发现 · ${state.collected.length}/125</h2><button class="wood-button quiet-button" id="natureBook">自然图鉴 · ${Object.keys(state.nature).length}/15</button><div class="book-tabs">${Object.entries(regions).map(([r,v])=>`<button class="wood-button ${r===id?'':'quiet-button'}" data-book="${r}">${esc(v.name)}</button>`).join('')}</div><div class="book-grid">${group.map(it=>`<button class="book-item" data-item="${it.id}" aria-label="${state.collected.includes(it.id)?esc(it.name):'还没发现'}">${itemAsset(it.id,state.collected.includes(it.id)?'':'undiscovered-silhouette')}<span>${state.collected.includes(it.id)?esc(it.name):'还没发现'}</span></button>`).join('')}</div><button class="wood-button" id="closeBook">合上</button>`,'book');
    $('panel').querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>book(b.dataset.book));
    $('panel').querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>{const it=data.items[+b.dataset.item];audio.say(state.collected.includes(it.id)?it.name+'。'+it.desc:'还没发现它，沿小路找一找吧',{interrupt:true});});$('closeBook').onclick=closePanel;$('natureBook').onclick=natureBook;
  }
  const shards=['polygon(50% 47%,43% 31%,50% 0%,100% 0%,100% 34%,73% 39%,65% 48%)','polygon(50% 47%,65% 48%,73% 39%,100% 34%,100% 100%,79% 91%,70% 68%)','polygon(50% 47%,70% 68%,79% 91%,80% 100%,20% 100%,32% 76%,37% 62%)','polygon(50% 47%,37% 62%,32% 76%,20% 100%,0% 100%,0% 34%,26% 42%,37% 47%)','polygon(50% 47%,37% 47%,26% 42%,0% 34%,0% 0%,50% 0%,43% 31%)'];
  function medal(id,count,animate=false){const r=regions[id];return `<div class="medal-pieces ${count===5?'complete':''}" aria-label="${esc(r.name)}印记，已点亮 ${count}/5 片">${shards.map((clip,i)=>`<span class="medal-piece ${i<count?'on':''} ${animate&&i===count-1?'new-piece':''}" style="clip-path:${clip};--piece:${i};--dx:${[4,5,0,-5,-4][i]}px;--dy:${[-4,2,5,2,-4][i]}px">${atlas('helpers',r.index+5,2)}</span>`).join('')}</div>`;}
  function celebrate(){
    if(!journey.allComplete()||state.celebrated)return;state.celebrated=true;persist();
    showPanel(`<div class="completion-sparks" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i}">✦</i>`).join('')}</div><h1>五枚印记，全部点亮！</h1><div class="all-medals">${Object.keys(regions).map(id=>medal(id,5,true)).join('')}</div><p>125 次发现，25 片印记。<br>你让世界之心重新亮起来啦！</p><button class="wood-button" id="finishJourney">带着发现，继续逛逛</button>`,'completion');
    $('finishJourney').onclick=()=>{closePanel();goHome();};audio.tone([523,659,784,1047,1318]);speech('五枚印记全部点亮啦！世界之心重新亮起来了。谢谢你，小小探险家');
  }
  async function deliver(){
    if(area!==state.segments){speech('这里已经提交完成，石板一直亮着。沿小路继续吧');return;}
    const replay=journey.isReplaying();
    if(!journey.deliver()){speech(state.segments===5?'这枚印记已经完整啦':'再找'+(5-state.bag.length)+'样，就能点亮这一片印记啦');return;}
    altarGuide=null;noticeUntil=0;$('notice').classList.remove('show');persist();audio.tone([523,659,784,1047]);if(replay){const done=!journey.isReplaying();showPanel('<h2>'+ (done?'这一轮探险完成啦':'这一站又有新发现')+'</h2><p>'+ (done?'印记和成长记录都保留了。下次还可以再出发！':'沿着打开的小路，继续找新题吧')+'</p><button class="wood-button" id="continueStage">'+(done?'回到世界之心':'继续探险')+'</button>','reward');$('continueStage').onclick=done?goHome:closePanel;return;}if(journey.allComplete()){celebrate();return;}
    showPanel(`<h2>${state.segments===5?'一整枚印记，亮起来啦':'点亮第 '+state.segments+' 片印记'}</h2>${medal(state.activeRegion,state.segments,true)}<p>${state.segments===5?'带回世界之心，去探索其他区域吧':'前面的小路，已经打开啦'}</p><button class="wood-button" id="continueStage">继续探险</button>`,'reward');
    if(stage().exitSubmission){$('continueStage').textContent='带印记回世界之心';$('continueStage').onclick=()=>{closePanel();goHome();};}else $('continueStage').onclick=closePanel;audio.say(state.segments===5?'这枚印记完整啦':'点亮了一片印记，继续沿小路探索吧',{interrupt:true});
  }
  function entities(){
    if(scene==='hub')return [{id:'book',x:worlds.hub.book[0],y:worlds.hub.book[1],label:'收集册',action:()=>book()},{id:'charge',x:worlds.hub.tree[0],y:worlds.hub.tree[1],label:'世界之心 · 选择复习区域',action:charge},...worlds.hub.exits.map(e=>({...e,id:e.region,exit:true,label:e.x<500?'← '+e.label:e.region==='valley'?e.label+' ↓':e.label+' →',action:()=>{journey.selectRegion(e.region);enterArea(0);}}))];
    const altar=altars[area],entry=areaEntries[area],exit=areaExits[area];
    const list=area===state.segments?journey.available().map(it=>({id:'item'+it.id,...spots[it.id],icon:it.icon,label:'这次的新发现',item:it.id,action:()=>beginItem(it.id)})):[];
    return list.concat([
      {id:'altar',x:altar[0],y:altar[1],artX:stage().altarArt?.mark[0],artY:stage().altarArt?stage().altarArt.mark[1]+25:undefined,label:stage().exitSubmission?(area<state.segments?'出口 · 回世界之心':state.bag.length===5?'迷宫出口 · 提交印记':'迷宫出口 · 还差 '+(5-state.bag.length)+' 件'):area<state.segments?'印记已点亮':state.activeRegion==='sea'?(state.bag.length===5?'请贝壳点亮印记':'结识五位伙伴，再来找贝壳'):state.bag.length===5?'交给石坛':'收集五样交给石坛',action:()=>stage().exitSubmission&&area<state.segments?goHome():deliver()},
      {id:'entry',x:entry[0],y:entry[1],exit:true,label:area===0?'← 世界之心':'← '+areaNames[area-1],action:()=>area===0?goHome():enterArea(area-1,true)},
      ...(area<4?[{id:'next',x:exit[0],y:exit[1],exit:true,locked:!TEST_OPEN&&state.segments<=area,label:TEST_OPEN||state.segments>area?'前往 '+areaNames[area+1]+' →':state.activeRegion==='sea'?'请贝壳点亮印记，打开通道':'五样交给石坛，打开木门',action:()=>{if(TEST_OPEN||state.segments>area)enterArea(area+1);else speech(state.bag.length===5?'已经收集齐啦，沿金色虚线去提交，点亮印记吧':state.activeRegion==='sea'?'结识五位小伙伴，再请贝壳点亮印记':'先找到五样小宝贝，点亮石坛，木门就会打开');}}]:[])
    ]);
  }
  function nearestEntity(){return entities().filter(e=>dist(player,e)<interactionRadius(e)&&(e.exit||clearLine(player,e))).sort((a,b)=>dist(a,player)-dist(b,player))[0];}
  function interact(){if(mode!=='world'||player.roll>0)return;const e=nearestEntity();if(e)e.action();else catchCritter();}
  function setScene(s,x,y){hideDiscovery();quiz?.cancel();transitionToken++;audio.stop();journey.cancelQuestion();closePanel();occlusionAlpha.clear();altarGuide=null;scene=s;critterScene='';wildlife=null;player.x=x;player.y=y;player.moving=false;player.roll=0;player.boostUntil=0;route=[];routeAction=null;returningHome=false;entryCooldown=2;resize();updateHUD();persist();}
  function goHome(){const e=worlds.hub.exits.find(e=>e.region===state.activeRegion);const p={x:e.x+(840-e.x)*.18,y:e.y+(560-e.y)*.18};setScene('hub',p.x,p.y);render();speech(journey.allComplete()?'五枚印记照亮了世界之心。谢谢你，小小探险家！':'走回世界之心啦');}
  async function enterArea(n,back=false){
    area=n;if(TEST_OPEN){const r=state.regions[state.activeRegion];r.segments=n;r.bag=[];r.used=[];r.assignments={};journey.cancelQuestion();}mode='transition';route=[];routeAction=null;keys.clear();
    notify('正在打开这条小路…',30);
    try{await Promise.all([stage().image,'gates','maze-props',state.activeRegion==='forest'?'items':state.activeRegion+'-items','pictures-0','pictures-1'].map(loadAsset));}catch{goHome();notify('这条小路暂时没下载好，再走到入口试一次吧',8);return;}
    const door=back?stage().exit:stage().entry;setScene('forest',...door);
    // Spawn just inside the connected doorway, not at a distant altar. All
    // candidates use the actual collision map and lie outside the trigger ring.
    const inward=back?(stage().returnStart||stage().start):stage().start;let best=null,score=Infinity;
    if(stage().regenerated&&walkable(...inward)&&Math.hypot(inward[0]-door[0],inward[1]-door[1])>=96&&Math.hypot(inward[0]-door[0],inward[1]-door[1])<=160){best={x:inward[0],y:inward[1]};}
    else for(let radius=96;radius<=160;radius+=16)for(let k=0;k<32;k++){
      const a=k*Math.PI/16,p={x:door[0]+Math.cos(a)*radius,y:door[1]+Math.sin(a)*radius};if(!walkable(p.x,p.y)||!clearLine({x:door[0],y:door[1]},p))continue;
      const value=dist(p,{x:inward[0],y:inward[1]})+radius*.4;if(value<score){best=p;score=value;}
    }
    if(best){player.x=best.x;player.y=best.y;}else{const safe=nearest(...door),step=navigationStep();if(safe){player.x=(safe.x+.5)*step;player.y=(safe.y+.5)*step;}}
    // resize clears the canvas. Paint the loaded scene immediately even when
    // the browser defers its next animation frame after a transition.
    render();
    speech('来到'+areaNames[n]+'。'+(n<state.segments?'沿前面的小路继续吧':state.activeRegion==='sea'?'听听鱼儿的诗，跟着读一读':'找五样新的发现吧'));
    const next=region().stages[n+1];if(next)setTimeout(()=>loadAsset(next.image).catch(()=>{}),800);
  }
  function guideHome(){if(scene==='hub'){speech('已经到世界之心啦');return;}const e=entities().find(e=>e.id==='entry');route=pathTo(e.x,e.y);routeAction=e.id;returningHome=true;notify('沿来时的小路快步返回 · 方向键可中断',4);}
  function pause(){
    if(['feedback','reward','intro','action','transition'].includes(mode))return;
    if(mode==='pause'){resume();return;}
    pausedMode=mode;pausedAt=performance.now();quiz?.cancel();mode='pause';audio.stop();showPause();
  }
  function showPause(){
    showPanel(`<h2>歇一会儿</h2><div class="menu"><button class="wood-button" id="resume">继续探险</button><button class="wood-button quiet-button" id="pauseHome">沿原路返回</button><button class="wood-button quiet-button" id="volume">声音 ${Math.round(state.volume*100)}%</button><button class="wood-button quiet-button" id="fullscreen">全屏</button><button class="wood-button" id="replayMenu">再探险一轮</button><button class="wood-button quiet-button" id="characterMenu">伙伴：${esc(character().name)}</button><button class="wood-button quiet-button" id="testDoors">${TEST_OPEN?'退出测试，回正式进度':'测试选项：默认开门（独立进度）'}</button></div><button class="wood-button quiet-button" id="parentTools">家长：成长记录与题库</button><button class="wood-button quiet-button" id="restart">家长：重新开始</button><p class="small-print" id="pauseInputHint">进度已经记下了 · ${inputMode==='gamepad'?'Start':inputMode==='touch'?'点继续探险':'Esc'} 继续</p>`,'pause');
    growthMenu=window.createGrowthMenu({journey,data,saveKey:SAVE,showPanel,persist,goHome,enterArea,back:showPause});$('replayMenu').onclick=growthMenu.rounds;$('parentTools').onclick=growthMenu.settings;$('testDoors').onclick=()=>{const url=new URL(location.href);if(TEST_OPEN)url.searchParams.delete('test');else url.searchParams.set('test','open');location.href=url.href;};
    $('characterMenu').onclick=showCharacters;
    $('resume').onclick=resume;$('pauseHome').onclick=()=>{closePanel();guideHome();};
    $('volume').onclick=()=>{const levels=[0,.35,.7,1];state.volume=levels[(levels.indexOf(state.volume)+1)%4];persist();showPause();audio.say('声音调好啦');};
    $('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else $('game').requestFullscreen?.().catch(()=>notify('可以用浏览器的全屏按钮',3));};
    $('restart').onclick=()=>{showPanel('<h2>给家长的确认</h2><p>重新开始会清除这版五个区域的进度。<br>原来的卡片版进度不受影响。</p><div class="panel-actions"><button class="wood-button" id="keep">保留进度</button><button class="wood-button quiet-button" id="confirmReset">确认重新开始</button></div>','reset');$('keep').onclick=showPause;$('confirmReset').onclick=()=>{journey.reset();activeCharacter='rabbit';persist();goHome();};};
  }
  function resume(){if(pausedAt){const elapsed=performance.now()-pausedAt;if(player.roll>0)player.rollStartedAt+=elapsed;if(player.boostUntil)player.boostUntil+=elapsed;}pausedAt=0;if(journey.question)drawQuestion();else closePanel();}
  function roll(){
    if(mode!=='world'||player.roll>0)return;
    let x=padAxes.x+(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0),y=padAxes.y+(keys.has('arrowdown')||keys.has('s')?1:0)-(keys.has('arrowup')||keys.has('w')?1:0);
    if(!x&&!y&&route.length){x=route[0].x-player.x;y=route[0].y-player.y;}
    if(!x&&!y)[x,y]=[[0,1],[-1,0],[1,0],[0,-1]][player.dir];
    const length=Math.hypot(x,y);player.rollDirection={x:x/length,y:y/length};player.dir=Math.abs(x)>Math.abs(y)?(x>0?2:1):(y>0?0:3);
    player.rollBase=player.moving?WALK_SPEED*ROLL_DURATION:0;player.rollBonus=player.moving?30:ROLL_DISTANCE;player.rollTarget=route.length?{...route.at(-1)}:null;player.roll=ROLL_DURATION;player.rollStartedAt=performance.now();player.rollDistance=0;audio.tone([330,440]);
    actionWakeAt=performance.now();actionWakeUntil=actionWakeAt+ROLL_DURATION*1000+150;render();renderDirty=false;keepActionVisible();
  }
  $('interact').onclick=()=>{audio.unlock();interact();};$('lamp').onclick=()=>{audio.unlock();help();};$('voice').onclick=()=>{if(!['world','quiz'].includes(mode))return;audio.unlock();if(journey.question)quiz.repeat();else audio.say(lastSpeech||'沿着小路，找找小宝贝',{interrupt:true});};$('roll').onclick=roll;$('home').onclick=()=>{if(mode==='world')guideHome();};$('pause').onclick=pause;
  function inputAction(action){
    if(discoveryCard){if(['confirm','roll','pause'].includes(action))hideDiscovery();return;}
    if(['feedback','action','transition'].includes(mode))return;
    if(action==='pause'){pause();return;}if(action==='home'){if(mode==='world')guideHome();return;}
    if(action==='voice'){if(mode==='parent-confirm')$('parentRetry')?.click();else $('voice').click();return;}if(action==='lamp'){help();return;}
    if(action==='zoom'){if(mode==='world'&&scene!=='hub'&&stage().maze)$('mazeZoom').click();return;}
    if(action==='book'){if(mode==='world')book();return;}
    if(action==='roll'){if(mode==='world')roll();else{const back={quiz:'leaveQ','parent-confirm':'cancelParent',characters:'characterBack',book:$('closeBook')?'closeBook':'closeNature',nature:'closeNature','review-select':'leaveReview',growth:$('growthCancel')?'growthCancel':'growthBack',pause:'resume',reset:'keep',reward:'continueStage',completion:'finishJourney'}[mode];if(back)$(back)?.click();}return;}
    if(action==='confirm'){if(mode==='world')interact();else{const list=buttons(),focused=list.find(b=>b===document.activeElement)||list.find(b=>b.classList.contains('focused'));(focused||list[focusIndex]||list[0])?.click();}}
  }
  addEventListener('keydown',e=>{
    setInputMode('keyboard');
    const k=e.key.toLowerCase();if(e.target.matches('input,textarea')){if(k==='escape'){e.preventDefault();quiz.draw();}return;}if(['arrowup','arrowdown','arrowleft','arrowright',' ','enter','escape'].includes(k))e.preventDefault();
    audio.unlock();if(discoveryCard&&k==='tab'){e.preventDefault();discoveryCard.querySelector('button').focus();return;}if(e.repeat)return;keys.add(k);
    if(mode==='world'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){actionWakeAt=performance.now();actionWakeUntil=actionWakeAt+150;runFrame();keepActionVisible();}
    if(mode!=='world'&&mode!=='action'&&['arrowleft','arrowright','arrowup','arrowdown'].includes(k)){moveFocus(k==='arrowleft'?-1:k==='arrowright'?1:0,k==='arrowup'?-1:k==='arrowdown'?1:0);return;}
    const action={enter:'confirm',' ':'confirm',escape:'pause',x:'voice',c:'lamp',z:'roll',t:'home'}[k];if(action)inputAction(action);
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>{keys.clear();if(mode==='world'||mode==='quiz')pause();});
  function pollPad(dt){
    const pad=[...(navigator.getGamepads?.()||[])].find(Boolean);if(!pad){padOld=[];navCooldown=0;return {x:0,y:0};}
    const btn=pad.buttons.map(b=>b.pressed);const edges=btn.map((b,i)=>b&&!padOld[i]);padOld=btn;
    if(edges.some(Boolean)||pad.axes.some(x=>Math.abs(x)>.25))setInputMode('gamepad');
    [[0,'confirm'],[1,'roll'],[2,'voice'],[3,'lamp'],[4,'book'],[5,'zoom'],[8,'home'],[9,'pause']].forEach(([i,a])=>{if(edges[i])inputAction(a);});
    let x=pad.axes[0]||0,y=pad.axes[1]||0;if(btn[14])x=-1;if(btn[15])x=1;if(btn[12])y=-1;if(btn[13])y=1;if(Math.abs(x)<.25)x=0;if(Math.abs(y)<.25)y=0;
    if(x||y||edges.some(Boolean))setInputMode('gamepad');
    const scrollY=pad.axes[3]||0;
    if(mode!=='world'&&Math.abs(scrollY)>.25)$('panel').scrollTop+=scrollY*420*dt;
    navCooldown-=dt;if(mode!=='world'&&(x||y)&&navCooldown<=0){moveFocus(Math.abs(x)>=Math.abs(y)?Math.sign(x):0,Math.abs(y)>Math.abs(x)?Math.sign(y):0);navCooldown=.24;}if(!x&&!y)navCooldown=0;
    return {x,y};
  }
  // A static question can be rendered infrequently. Keep button edges and
  // menu navigation responsive independently of requestAnimationFrame.
  let lastPadPoll=performance.now();
  const padTimer=setInterval(()=>{const now=performance.now(),dt=Math.min(.1,(now-lastPadPoll)/1000);lastPadPoll=now;if(!ready||document.hidden){padAxes={x:0,y:0};return;}padAxes=pollPad(dt);},16);
  cv.addEventListener('pointerdown',e=>{
    audio.unlock();if(mode!=='world')return;returningHome=false;
    const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/view.scale+view.x,y=(e.clientY-r.top)/view.scale+view.y;
    const hit=o=>o.exit?((Math.abs(x-o.x)<112&&y>o.y-112&&y<o.y+74)||(!o.locked&&Math.abs(x-entranceSignX(o))<94&&y>o.y-118&&y<o.y-40)):Math.hypot(x-(o.artX??o.x),y-((o.artY??o.y)-25))<Math.max(65,28/view.scale);
    const target=entities().filter(hit).sort((a,b)=>Math.hypot(x-(a.artX??a.x),y-(a.artY??a.y))-Math.hypot(x-(b.artX??b.x),y-(b.artY??b.y)))[0];
    if(target?.item!==undefined&&dist(player,target)<90&&!player.roll&&clearLine(player,target)){target.action();return;}
    route=pathTo(target?target.x:x,target?target.y:y);routeAction=target&&target.item===undefined?target.id:null;
    if(target?.item!==undefined)notify('先走近，再按互动按钮看看'+target.label,3);
    if(!route.length&&target&&dist(player,target)<interactionRadius(target))target.action();
  });
  $('game').addEventListener('pointerdown',e=>setInputMode(e.pointerType==='touch'||e.pointerType==='pen'?'touch':'keyboard'),true);
  setInputMode(matchMedia('(pointer:coarse)').matches?'touch':'keyboard',true);
  let mazeClose=false;
  $('mazeZoom').onclick=()=>{mazeClose=!mazeClose;resize();};
  function resize(){const w=innerWidth,h=innerHeight,d=Math.min(devicePixelRatio||1,1,Math.sqrt(1100000/(w*h))),maze=scene!=='hub'&&stage().maze;renderDPR=d;renderDirty=true;cv.width=w*d;cv.height=h*d;cv.style.width=w+'px';cv.style.height=h+'px';ctx.setTransform(d,0,0,d,0,0);$('game').dataset.maze=maze?'true':'false';view.top=maze?(h<550?76:108):0;view.bottom=maze?(h<550?68:82):0;view.scale=maze?(mazeClose?Math.max(.65,Math.min(w/1000,(h-view.top-view.bottom)/560)):Math.min((w-20)/1672,(h-view.top-view.bottom)/941)):Math.max(w/1672,h/941);$('mazeZoom').hidden=!maze;$('mazeZoom').textContent=mazeClose?'看全迷宫':'看近一点';$('mazeZoom').setAttribute('aria-pressed',String(mazeClose));view.w=w/view.scale;view.h=h/view.scale;if(maze&&!mazeClose){view.x=(1672-view.w)/2;view.y=-(view.top+(h-view.top-view.bottom-941*view.scale)/2)/view.scale;}}
  addEventListener('resize',resize);resize();
  function drawAtlas(name,i,rows,x,y,w=65,h=w){const im=imgs[name],sw=im.width/5,sh=im.height/rows;ctx.drawImage(im,(i%5)*sw,Math.floor(i/5)*sh,sw,sh,x-w/2,y-h,w,h);}
  function drawItem(id,x,y,w=65){const it=data.items[id];drawAtlas(it.region==='forest'?'items':it.region+'-items',it.icon,it.region==='forest'?4:3,x,y,w);}
  const medalCache=new Map();
  function drawMedal(id,count,x,y,size){
    const key=id+':'+count;let c=medalCache.get(key);
    if(!c){c=document.createElement('canvas');c.width=c.height=160;const g=c.getContext('2d'),im=imgs.helpers,index=regions[id].index+5;
      for(let i=0;i<5;i++){const coords=[...shards[i].matchAll(/([\d.]+)% ([\d.]+)%/g)].map(m=>[+m[1]*1.6,+m[2]*1.6]);g.save();g.translate(80+(count===5?0:[4,5,0,-5,-4][i]),80+(count===5?0:[-4,2,5,2,-4][i]));g.scale(count===5?1:.98,count===5?1:.98);g.translate(-80,-80);g.beginPath();coords.forEach(([x,y],n)=>n?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.clip();g.globalAlpha=i<count?1:.16;g.drawImage(im,index%5*im.width/5,im.height/2,im.width/5,im.height/2,0,0,160,160);g.restore();}medalCache.set(key,c);
    }ctx.drawImage(c,x-size/2,y-size/2,size,size);
  }
  function drawAsset(i,x,y,w=65,h=w){const im=imgs.items,sw=im.width/5,sh=im.height/4;ctx.drawImage(im,(i%5)*sw,Math.floor(i/5)*sh,sw,sh,x-w/2,y-h,w,h);}
  function halo(x,y,r,color){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'rgba(255,220,100,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();}
  function itemGlow(e,x,y,w){
    const color='gold';if(!glowCache.has(color)){
      const c=document.createElement('canvas');c.width=c.height=192;const g=c.getContext('2d'),light=g.createRadialGradient(96,96,0,96,96,96);
      light.addColorStop(0,'rgba(255,237,143,.9)');light.addColorStop(.28,'rgba(255,214,70,.92)');light.addColorStop(.48,'rgba(255,184,25,.67)');light.addColorStop(.74,'rgba(255,195,48,.27)');light.addColorStop(1,'rgba(255,185,30,0)');g.fillStyle=light;g.fillRect(0,0,192,192);glowCache.set(color,c);
    }
    const maze=scene!=='hub'&&stage().maze;
    const breath=reduced?.65:(1-Math.cos(time*Math.PI*2/3.8+e.item*.73))/2,near=dist(player,e)<120,radius=w*(maze?.7+breath*.12:.9+breath*.24),alpha=maze?.4+breath*.2:.66+breath*.26;
    // The amber aura sits behind the object; the object retains its own colors.
    ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(glowCache.get(color),x-radius,y-w*.43-radius,radius*2,radius*2);
    ctx.strokeStyle='rgba(255,221,103,'+(.25+breath*.25)+')';ctx.lineWidth=2.6;ctx.beginPath();ctx.ellipse(x,y-w*.43,w*(.43+breath*.06),w*(.4+breath*.05),0,0,Math.PI*2);ctx.stroke();ctx.restore();
    // A cream dashed outline with a dark amber under-stroke stays readable on
    // both pale sand and busy foliage. It inherits the object's occlusion alpha.
    ctx.save();ctx.setLineDash(maze?[4,3]:[7/view.scale,5/view.scale]);ctx.lineCap='round';ctx.beginPath();ctx.ellipse(x,y-w*.43,w*.64,w*.58,0,0,Math.PI*2);ctx.strokeStyle='#6e4b20e6';ctx.lineWidth=maze?3:5/view.scale;ctx.stroke();ctx.strokeStyle='#fff4bc';ctx.lineWidth=maze?1.5:2.4/view.scale;ctx.stroke();ctx.restore();
    visualState.glows.push({id:e.id,breath,alpha:alpha*ctx.globalAlpha,radius,x,y,color:'gold'});
  }
  function transformBounds(b,m){const p=[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].map(([x,y])=>m.transformPoint({x,y})),xs=p.map(p=>p.x),ys=p.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
  function atlasBounds(name,i,rows,x,y,w,h=w){
    const key=name+':'+i+':'+rows;
    if(!alphaBoundsCache.has(key)){
      const im=imgs[name],c=document.createElement('canvas');c.width=c.height=48;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,(i%5)*im.width/5,Math.floor(i/5)*im.height/rows,im.width/5,im.height/rows,0,0,48,48);
      try{const pixels=g.getImageData(0,0,48,48).data;let l=48,t=48,r=0,b=0;for(let yy=0;yy<48;yy++)for(let xx=0;xx<48;xx++)if(pixels[(yy*48+xx)*4+3]>40){l=Math.min(l,xx);r=Math.max(r,xx+1);t=Math.min(t,yy);b=Math.max(b,yy+1);}alphaBoundsCache.set(key,r?[l/48,t/48,r/48,b/48]:[0,0,1,1]);}
      catch(error){if(error.name!=='SecurityError')throw error;alphaBoundsCache.set(key,[0,0,1,1]);} // file:// may forbid reading image pixels; keep the game usable with frame bounds.
    }
    const [l,t,r,b]=alphaBoundsCache.get(key);return{x:x-w/2+l*w,y:y-h+t*h,w:(r-l)*w,h:(b-t)*h};
  }
  function foregroundAlpha(id,e,rectangles){
    const body=visualState.playerBounds,overlap=e.y>player.y&&rectangles.some(b=>Math.min(body.x+body.w,b.x+b.w)-Math.max(body.x,b.x)>3&&Math.min(body.y+body.h,b.y+b.h)-Math.max(body.y,b.y)>3),target=overlap?.24:1,old=occlusionAlpha.get(id)??1;
    const alpha=reduced?target:old+(target-old)*(1-Math.exp(-visualDt/(overlap?.09:.14)));occlusionAlpha.set(id,alpha);visualState.occluders.push({id,overlap,alpha,bounds:rectangles});return alpha;
  }
  async function prepareCharacter(id){
    const choice=AdventureCharacters[id];if(!choice)throw Error('未知伙伴');
    await Promise.all(choice.assets.map(loadAsset));
    // Decode and draw each sheet once before resuming; switching is atomic.
    for(const name of choice.assets){const im=imgs[name];if(im.decode)await im.decode();const c=document.createElement('canvas');c.width=32;c.height=32;c.getContext('2d').drawImage(im,0,0,32,32);}
  }
  function showCharacters(){
    const request=++characterRequest;
    showPanel('<h2>今天和谁一起探险？</h2><p>伙伴换好了，发现和印记都还在。</p><div class="character-choices">'+Object.entries(AdventureCharacters).map(([id,c])=>'<button class="wood-button character-choice" data-character="'+id+'" aria-pressed="'+(id===activeCharacter)+'"><span class="character-preview" style="background-image:url('+c.preview+')"></span><span>'+esc(c.name)+(id===activeCharacter?' · 一起探险中':'')+'</span></button>').join('')+'</div><p id="characterStatus" role="status"></p><button id="characterBack" class="wood-button quiet-button">返回</button>','characters');
    $('characterBack').onclick=()=>{characterRequest++;showPause();};
    document.querySelectorAll('[data-character]').forEach(b=>b.onclick=async()=>{
      document.querySelectorAll('[data-character]').forEach(el=>el.disabled=true);$('characterStatus').textContent='伙伴正在整理行囊…';
      try{await prepareCharacter(b.dataset.character);if(request!==characterRequest||!$('characterStatus'))return;activeCharacter=b.dataset.character;state.character=activeCharacter;persist();renderDirty=true;showPause();}
      catch{if(request!==characterRequest||!$('characterStatus'))return;$('characterStatus').textContent='伙伴还没准备好，请稍后再试。现在的伙伴和记录都保留。';document.querySelectorAll('[data-character]').forEach(el=>el.disabled=false);}
    });
  }
  function playerVisual(){
    // Keep the feet on the same world coordinate and collision mask. Only the
    // drawing grows, with a screen-space minimum for the maze overview.
    const depth=scene!=='hub'&&stage().maze?Math.max(.78,Math.min(2.35,56/(108*view.scale))):scene!=='hub'&&state.activeRegion==='forest'&&area===0?Math.max(.86,Math.min(1.15,.86+(player.y-260)/600*.29)):1.12;
    const rolling=player.roll>0&&!animation;
    const size=108*depth,action=animation&&['pickup','lamp','borrowLight','preview','catch'].includes(animation.kind),sheet=action?(state.activeRegion==='forest'&&animation.kind!=='catch'?'rabbit-actions-clean.png':'rabbit-actions-generic.png'):'rabbit-walk.png';
    const c=character(),im=action?imgs[state.activeRegion==='forest'&&animation.kind!=='catch'?c.actions:c.generic]:imgs[c.walk],meta=c.anchors?.[action?'actions':'walk']||AdventureAnchors.sheets[sheet],progress=action?Math.min(.999,animation.t/animation.duration):0;
    const magic=action&&['lamp','borrowLight','preview'].includes(animation.kind);
    const frame=action?(magic&&state.activeRegion==='beach'?(progress<.18?0:progress<.84?1:3):magic&&state.activeRegion==='valley'?2:animation.kind==='borrowLight'?(progress<.15?0:progress<.3?1:progress<.9?2:3):Math.min(3,Math.floor(progress*4))):player.moving&&!player.roll?Math.floor(player.walk/18)%4:1,row=action?(animation.kind==='pickup'||magic&&state.activeRegion==='valley'?0:1):player.dir,f=meta.frames[row*4+frame];
    const anchor=f.motionAnchor||f.anchor,scale=size/meta.frameHeight*(meta.scaleRatio||(action ? .9 : 1)),sx=player.x-anchor.x*scale,sy=player.y-anchor.y*scale,afloat=scene!=='hub'&&state.activeRegion==='sea',bob=afloat&&!reduced?Math.sin(time*2)*3:0;
    const rp=rollProgress(),hop=rolling?Math.sin(rp*Math.PI)*.5:0;let matrix=new DOMMatrix();
    if(animation?.kind==='catch'&&imgs[c.catch]){
      const front=animation.dir===0,im=imgs[front?c.front:c.catch],meta=c.anchors?.[front?'front':'catch']||(front?AdventureCatchFrontAnchors:AdventureCatchAnchors),row=front?0:animation.dir===3?2:1;
      const cuts=[.12,.29,.47,.65,.85,1],frame=Math.max(0,cuts.findIndex(n=>progress<n)),f=meta.frames[row*6+frame],scale=meta.fixedBodyScale?size/meta.frameHeight*meta.scaleRatio:size*.8/(f.bbox[3]-f.bbox[1]);
      const sx=player.x-f.anchor.x*scale,sy=player.y-f.anchor.y*scale;
      if(animation.dir===1)matrix=matrix.translate(player.x*2,0).scale(-1,1);
      const b=f.bbox,bounds=transformBounds({x:sx+b[0]*scale,y:sy+b[1]*scale+bob,w:(b[2]-b[0])*scale,h:(b[3]-b[1])*scale},matrix);
      return{depth,action:true,catching:true,im,meta,progress,frame,f,scale,sx,sy,afloat,bob,hop:0,matrix,bounds};
    }
    if(rolling&&imgs[c.roll]){
      const im=imgs[c.roll],meta=c.anchors?.roll||AdventureRollAnchors,row=player.dir===0?0:player.dir===3?1:2,frame=Math.min(5,Math.floor(rp*6)),f=meta.frames[row*6+frame],scale=size/meta.frameHeight*(meta.scaleRatio||1);
      const sx=player.x-f.anchor.x*scale,sy=player.y-f.anchor.y*scale-hop*8*depth;
      if(player.dir===1)matrix=matrix.translate(player.x*2,0).scale(-1,1);
      const b=f.bbox,bounds=transformBounds({x:sx+b[0]*scale,y:sy+b[1]*scale,w:(b[2]-b[0])*scale,h:(b[3]-b[1])*scale},matrix);
      return{depth,action:false,im,meta,progress:rp,frame,f,scale,sx,sy,afloat,bob,hop,matrix,bounds};
    }
    if(action&&animation.facing<0)matrix=matrix.translate(player.x*2,0).scale(-1,1);
    const b=f.bodyBBox||f.bbox,bounds=transformBounds({x:sx+b[0]*scale,y:sy+b[1]*scale+bob,w:(b[2]-b[0])*scale,h:(b[3]-b[1])*scale},matrix);
    return{depth,action,im,meta,progress,frame,f,scale,sx,sy,afloat,bob,hop,matrix,bounds};
  }
  function text(s,x,y){ctx.font='bold '+Math.max(22,22/view.scale)+'px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.lineWidth=5/view.scale;ctx.strokeStyle='#fff3d7';ctx.strokeText(s,x,y);ctx.fillStyle='#62472e';ctx.fillText(s,x,y);}
  function drawEntrance(e){
    const near=dist(player,e)<180,arrow=scene==='hub'?(e.x<500?'←':e.x>1200?'→':'↓'):e.y>600?'↓':'↑';
    const label=e.label.replace(/[←→↓↑]/g,'').replace(/^前往\s*/,'').trim(),lift=reduced?0:Math.sin(time*2.6)*3,signX=entranceSignX(e);
    ctx.save();halo(e.x,e.y,94,near?'rgba(255,223,117,.45)':'rgba(255,237,161,.26)');
    ctx.strokeStyle=near?'#fff2b4':'#fff2b4bb';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(e.x,e.y,EXIT_RADIUS,EXIT_RADIUS*.48,0,0,Math.PI*2);ctx.stroke();
    ctx.save();ctx.globalAlpha*=foregroundAlpha(e.id+':sign',e,[{x:signX-84,y:e.y-109,w:168,h:57},{x:signX-4,y:e.y-61,w:8,h:44}]);
    ctx.fillStyle='#976b3e';ctx.fillRect(signX-4,e.y-61,8,44);ctx.fillStyle='#f6e4b9';ctx.strokeStyle='#8a6b3e';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(signX-82,e.y-107,164,53,14);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.fillStyle='#61482e';ctx.font='bold 21px "Microsoft YaHei",sans-serif';ctx.fillText(label,signX,e.y-74);
    ctx.restore();
    ctx.textAlign='center';ctx.font='bold 35px "Microsoft YaHei",sans-serif';ctx.fillStyle='#fff5c5';ctx.strokeStyle='#8b6c3b';ctx.lineWidth=3;ctx.strokeText(arrow,e.x,e.y+10+lift);ctx.fillText(arrow,e.x,e.y+10+lift);
    if(near&&!(scene!=='hub'&&stage().maze&&!mazeClose))text(inputMode==='gamepad'?'走近进入 · A 也可以':inputMode==='touch'?'走近或点路牌进入':'走近进入 · Enter 也可以',e.x,e.y+49);
    ctx.restore();
  }
  function firefly(x,y,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);halo(0,0,19,'rgba(255,230,116,.55)');ctx.fillStyle='#fff6caaa';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*5,-4,5,2+Math.abs(Math.sin(time*18))*3,side*.6,0,7);ctx.fill();}ctx.fillStyle='#6a7641';ctx.beginPath();ctx.ellipse(0,-3,2.5,5,0,0,7);ctx.fill();ctx.fillStyle='#fff394';ctx.beginPath();ctx.arc(0,2,3,0,7);ctx.fill();ctx.restore();}
  const waterGeometry=new WeakMap(),background=document.createElement('canvas'),backgroundContext=background.getContext('2d',{alpha:false});let backgroundKey='',backgroundBuilds=0;
  function paintedBackground(){
    const key=[mapName(),cv.width,cv.height,view.scale,view.x,view.y].join('|');
    if(key!==backgroundKey){
      backgroundKey=key;backgroundBuilds++;background.width=cv.width;background.height=cv.height;
      const b=backgroundContext;b.setTransform(renderDPR*view.scale,0,0,renderDPR*view.scale,-view.x*renderDPR*view.scale,-view.y*renderDPR*view.scale);
      const maze=scene!=='hub'&&stage().maze;const xs=[0],ys=[0];if(maze){b.fillStyle=state.activeRegion==='sea'?'#427f80':'#53644d';b.fillRect(view.x,view.y,view.w,view.h);}else{if(view.x<0)xs.push(-1);if(view.x+view.w>1672)xs.push(1);if(view.y<0)ys.push(-1);if(view.y+view.h>941)ys.push(1);}
      // Include corner tiles when the camera looks beyond two edges at once.
      for(const x of xs)for(const y of ys){b.save();b.translate(x===1?3344:0,y===1?1882:0);b.scale(x===0?1:-1,y===0?1:-1);b.drawImage(imgs[mapName()],0,0,1672,941);b.restore();}
    }
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(background,0,0);ctx.setTransform(renderDPR,0,0,renderDPR,0,0);
  }
  function drawWater(){
    const waters=(scene!=='hub'?stage().water:null)||window.AdventureWater?.[mapName()];if(reduced||!waters)return;
    const im=imgs[mapName()];
    for(const water of waters){
      if(!waterGeometry.has(water)){const points=water.polygon,path=new Path2D();points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();waterGeometry.set(water,{minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1])),path});}
      const {minX,maxX,minY,maxY,path}=waterGeometry.get(water);
      ctx.save();ctx.clip(path);
      const phase=(time*.65)%1;
      for(let layer=0;layer<2;layer++){
        const f=(phase+layer*.5)%1,fade=Math.sin(f*Math.PI);ctx.globalAlpha=fade*.65;
        for(let y=minY;y<maxY;y+=10){const warp=Math.sin(y*.085-time*3.5)*2.6,dx=water.dx*(f-.5)*18+warp,dy=water.dy*(f-.5)*18;
          ctx.drawImage(im,minX/1672*im.width,(y-dy)/941*im.height,(maxX-minX)/1672*im.width,12/941*im.height,minX+dx,y,maxX-minX,12);
        }
      }
      ctx.globalAlpha=.25;ctx.strokeStyle='#e5ffff';ctx.lineWidth=1.5;
      for(let i=0;i<4;i++){const f=(time*.2+i*.25)%1,x=minX+(maxX-minX)*f,y=minY+(maxY-minY)*f;ctx.beginPath();ctx.moveTo(x-8,y);ctx.quadraticCurveTo(x,y+3,x+10,y);ctx.stroke();}
      ctx.restore();
    }
  }
  function drawNature(){
    if(reduced)return;
    if(scene!=='hub'&&state.activeRegion==='sea'){ctx.save();ctx.strokeStyle='#dcffff88';ctx.lineWidth=1.5;for(let i=0;i<16;i++){const x=180+(i*137)%1300+Math.sin(time*.4+i)*8,y=940-(time*24+i*67)%800;ctx.beginPath();ctx.arc(x,y,3+i%4,0,7);ctx.stroke();}ctx.restore();return;}
    const water=(scene!=='hub'&&stage().water)||window.AdventureWater?.[mapName()]?[]:scene==='hub'?[[1490,130],[1550,430],[1500,650],[1450,880]]:state.activeRegion==='castle'?[]:state.activeRegion==='beach'?[[65,350],[80,510],[90,770],[570,910]]:state.activeRegion==='valley'?[[80,520],[120,670],[260,850]]:area===0?[[1610,330],[1540,610],[1290,785],[970,850],[570,900]]:area===1?[[300,180],[650,190],[1000,185],[1400,195]]:[[1580,350],[1530,580],[1510,820]];
    ctx.save();ctx.strokeStyle='#d1f4df';ctx.lineWidth=2;ctx.globalAlpha=.28;
    water.forEach(([x,y],n)=>{for(let i=0;i<4;i++){const drift=(time*20+i*22+n*9)%85;ctx.beginPath();ctx.moveTo(x-32+drift,y+i*6);ctx.quadraticCurveTo(x-20+drift,y+i*6-3,x-9+drift,y+i*6);ctx.stroke();}});ctx.restore();
    const grasses=scene!=='hub'&&stage().regenerated?[]:scene==='hub'?[[300,665],[1250,660],[470,735]]:state.activeRegion==='castle'?[]:state.activeRegion!=='forest'?[[195,575],[1430,670],[525,290]]:area===0?[[510,390],[1040,425],[1150,630]]:area===1?[[310,530],[1275,680],[575,370]]:[[485,420],[1250,630],[360,760]];
    grasses.forEach(([x,y],i)=>{ctx.save();ctx.strokeStyle='#769148';ctx.lineWidth=2;ctx.lineCap='round';const sway=Math.sin(time*1.5+i)*4;for(let b=0;b<6;b++){const bx=x+b*3;ctx.beginPath();ctx.moveTo(bx,y);ctx.quadraticCurveTo(bx+sway,y-7,bx+(b-2)*2+sway,y-13-(b%3)*3);ctx.stroke();}ctx.restore();});

  }
  const faunaNames=['奶油黄蝶','蓝翅蝶','桃粉蝶','橘纹蝶','薄荷白蝶','金纹小鱼','蓝色小鱼','橘色小鱼','紫色小鱼','银色小鱼','红瓢虫','金甲虫','绿蜻蜓','萤火虫','棕色飞蛾'];
  function faunaDescription(i){
    if(i<5)return '蝴蝶有两对翅膀，常在花朵间飞舞。观察完，把它放回花园吧。';
    if(i<10)return '小鱼用鳃呼吸，用鳍帮助游动。看看它的颜色，再让它回到水里吧。';
    return ['瓢虫有六条腿，背上有硬硬的翅鞘。观察一下它的斑点，再把它放回叶子上吧。','甲虫的前翅像一件小盔甲，保护着身体。观察完，让它继续探索吧。','蜻蜓有两对翅膀，飞行时能灵活转弯。观察完，让它自由飞走吧。','萤火虫的身体能发光。轻轻观察，不要带走它，让它继续照亮夜晚吧。','飞蛾和蝴蝶一样都有两对翅膀。许多飞蛾喜欢在夜间活动，观察完放它飞走吧。'][i-10];
  }
  function catchTool(){return scene==='hub'?'捕虫网':{forest:'捕虫网',castle:'羽毛光环',beach:'浅滩小网',valley:'草叶兜',sea:'泡泡圈'}[state.activeRegion];}
  function drawFauna(index,x,y,w=42,h=w){drawAtlas('fauna',index,4,x,y,w,h);}
  function initWildlife(){
    const key=scene==='hub'?'hub':state.activeRegion+':'+area;if(critterScene===key&&wildlife)return;
    const pools={hub:[0,2,4],forest:[0,1,3,10,13],castle:[2,4,11,14],beach:[0,3,12,14],valley:[1,10,11,12,13],sea:[5,6,7,8,9]},points=[],objects=entities();
    // Keep the animal's projected feet and approach room on a reachable path.
    const maze=scene!=='hub'&&stage().maze,margin=maze?12:24,safe=(x,y)=>x>110&&x<1560&&y>285&&y<830&&[[0,0],[-margin,0],[margin,0],[0,-20],[0,20]].every(([dx,dy])=>walkable(x+dx,y+dy));
    if(maze){for(let y=0;y<maze.rows;y++)for(let x=0;x<maze.cols;x++){const p={x:maze.x+(x+.5)*maze.cell,y:maze.y+(y+.5)*maze.cell};if((x+y)%3===0&&safe(p.x,p.y)&&objects.every(e=>dist(p,e)>100))points.push(p);}}
    else for(let y=315;y<815;y+=64)for(let x=150;x<1530;x+=64){const p={x:x+(Math.random()-.5)*25,y:y+(Math.random()-.5)*25};if(safe(p.x,p.y)&&objects.every(e=>dist(p,e)>125))points.push(p);}
    // One path test per connected neighborhood, rather than pathfinding every frame.
    const reachable=[];for(const p of points){if(maze||reachable.some(q=>dist(p,q)<150&&clearLine(p,q))||pathTo(p.x,p.y).length)reachable.push(p);}
    wildlife=new AdventureWildlife({points:reachable,origin:player,pool:pools[scene==='hub'?'hub':state.activeRegion],valid:safe,line:clearLine});critterScene=key;
  }
  function critters(){initWildlife();return wildlife.visible();}
  function drawCritters(){
    for(const c of critters()){ctx.save();ctx.translate(c.x,c.y);if(c.species<5||c.species>=12)ctx.scale(reduced?1:.7+.3*Math.abs(Math.sin(time*6+c.instance)),1);if(c.species>=5&&c.species<=9&&c.heading<0)ctx.scale(-1,1);drawFauna(c.species+5,0,0,c.species>=5&&c.species<=9?64:58);ctx.restore();}
  }
  async function catchCritter(){
    if(mode!=='world'||player.roll||performance.now()<catchCooldown)return;catchCooldown=performance.now()+680;
    const token=++transitionToken;await performAction('catch');if(token!==transitionToken)return;
  }
  function catchContact(){
    const origin={x:player.x,y:player.y-40},[dx,dy]=[[0,1],[-1,0],[1,0],[0,-1]][animation.dir];
    const target=critters().filter(c=>dist(origin,c)<98&&((c.x-origin.x)*dx+(c.y-origin.y)*dy)>-8&&clearLine(player,c.foot)).sort((a,b)=>dist(origin,a)-dist(origin,b))[0];
    if(!target||!wildlife.capture(target.instance)){notify('再靠近一点，朝着小动物挥动'+catchTool(),2);return;}
    const result=journey.recordCatch(target.species,scene==='hub'?'hub':state.activeRegion);if(!result)return;
    catchBurst={...target,startedAt:performance.now()};persist();audio.tone([784,988,1175]);speech((result.first?'发现了':'又见到')+faunaNames[target.species]+'，记进图鉴，再让它自由玩吧');
    animation.discovery={item:{name:faunaNames[target.species],desc:faunaDescription(target.species),caption:result.first?'第一次观察到':'又见到这位小邻居'},illustration:atlas('fauna',target.species+5,4)};
  }
  function drawCatchTool(avatar){
    const {f,scale,sx,sy,bob,depth,progress,frame}=avatar,index=scene==='hub'?0:region().index,tool=AdventureCatchAnchors.tools[index];
    const hx=sx+f.grip.x*scale,hy=sy+f.grip.y*scale+bob,front=animation.dir===0,angles=front?[-.45,-1.0,.95,1.55,.8,-.45]:animation.dir===3?[-1.1,-1.8,-.8,-.4,-.7,-1.1]:[-.85,-1.65,-.35,.2,-.35,-.85];
    // Each pose carries its own measured grip. The rotation pivot is the handle,
    // never an arbitrary point beside the torso; the paw is painted above it.
    const base=Math.atan2(tool.head[1]-tool.grip[1],tool.head[0]-tool.grip[0]),angle=angles[frame]-base,toolScale=.36*depth,sw=imgs.fauna.width/5,sh=imgs.fauna.height/4;
    ctx.save();ctx.translate(hx,hy);
    if(front){
      // Front reach projects along the ground toward the viewer. Shorten the
      // handle in depth and widen the approaching net instead of side-sweeping.
      ctx.rotate(angles[frame]);ctx.scale(toolScale*[.9,.82,.68,.62,.7,.9][frame],toolScale*[.8,.82,1.05,1.12,1,.8][frame]);ctx.rotate(-base);
    }else{ctx.rotate(angle);ctx.scale(toolScale,toolScale);}
    ctx.globalAlpha*=Math.min(1,.35+progress/.09,(1-progress)/.1);ctx.drawImage(imgs.fauna,index*sw,0,sw,sh,-tool.grip[0],-tool.grip[1],sw,sh);ctx.restore();
    if(animation.dir!==3){ctx.save();ctx.beginPath();ctx.ellipse(hx,hy,(front?19:11)*scale,(front?19:12)*scale,0,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar.im,...f.sourceRect,sx,sy+bob,f.sourceRect[2]*scale,f.sourceRect[3]*scale);ctx.restore();}
    const matrix=avatar.matrix,grip=matrix.transformPoint({x:hx,y:hy});visualState.catch={direction:animation.dir,frame,grip:{x:grip.x,y:grip.y},tool:index,behind:animation.dir===3,phase:progress};
  }
  function natureBook(){
    showPanel(`<h2>自然图鉴 · ${Object.keys(state.nature).length}/15</h2><p>捕捉观察后放回自然，不占任务袋。</p><div class="book-grid">${faunaNames.map((name,i)=>`<button class="book-item ${state.nature[i]?'':'unseen'}" data-fauna="${i}">${atlas('fauna',i+5,4)}<span>${state.nature[i]?esc(name):'还没遇见'}</span>${state.nature[i]?`<small>遇见 ${state.nature[i].count} 次</small>`:''}</button>`).join('')}</div><button class="wood-button" id="backDiscovery">回到学习收集册</button><button class="wood-button quiet-button" id="closeNature">继续探险</button>`,'book');$('backDiscovery').onclick=()=>book();$('closeNature').onclick=closePanel;document.querySelectorAll('[data-fauna]').forEach(b=>b.onclick=()=>audio.say(state.nature[b.dataset.fauna]?faunaNames[+b.dataset.fauna]:'还没遇见它，继续找一找吧',{interrupt:true}));
  }
  const altarLightCache=new Map(),mazeRowsCache=new Map();
  function mazeRows(){
    if(scene==='hub'||!stage().maze||stage().maze.painted)return[];const m=stage().maze,key=state.activeRegion;
    if(!mazeRowsCache.has(key)){
      const rows=[];for(let row=0;row<m.rows;row++){
        const c=document.createElement('canvas');c.width=1672;c.height=m.cell+16;const g=c.getContext('2d');
        for(let col=0;col<m.cols;col++)if(!m.grid[row][col])g.drawImage(imgs['maze-props'],...AdventureMazePropRects[region().index],m.x+col*m.cell-2,0,m.cell+4,m.cell+16);
        rows.push({id:'mazeRow'+row,mazeRow:true,c,top:m.y+row*m.cell-16,y:m.y+(row+1)*m.cell});
      }mazeRowsCache.set(key,rows);
    }return mazeRowsCache.get(key);
  }
  function drawMazeRow(row){
    const b=visualState.playerBounds,l=Math.max(0,Math.floor(b.x-8)),r=Math.min(1672,Math.ceil(b.x+b.w+8));
    if(row.y>player.y&&row.top<player.y&&r>l){
      if(l)ctx.drawImage(row.c,0,0,l,row.c.height,0,row.top,l,row.c.height);
      if(r<1672)ctx.drawImage(row.c,r,0,1672-r,row.c.height,r,row.top,1672-r,row.c.height);
      ctx.save();ctx.globalAlpha*=foregroundAlpha(row.id,row,[{x:l,y:row.top,w:r-l,h:row.c.height}]);ctx.drawImage(row.c,l,0,r-l,row.c.height,l,row.top,r-l,row.c.height);ctx.restore();
    }else ctx.drawImage(row.c,0,row.top);
  }
  function drawMazeAltar(e){
    const lit=area<state.segments;ctx.save();if(lit){halo(e.x,e.y-28,68,'rgba(255,223,112,.8)');ctx.filter='brightness(1.55) saturate(1.35)';}ctx.drawImage(imgs['maze-props'],...AdventureMazePropRects[region().index+5],e.x-33,e.y-68,66,68);ctx.restore();if(lit)drawMedal(state.activeRegion,5,e.x,e.y-20,25);
  }
  function drawAltarLight(){
    if(scene==='hub'||area>=state.segments||!stage().altarArt)return;
    const art=stage().altarArt,key=mapName();
    if(!altarLightCache.has(key)){
      const xs=art.polygon.map(p=>p[0]),ys=art.polygon.map(p=>p[1]),x=Math.min(...xs)-3,y=Math.min(...ys)-3,w=Math.max(...xs)-x+3,h=Math.max(...ys)-y+3,c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.translate(-x,-y);g.beginPath();art.polygon.forEach(([px,py],i)=>i?g.lineTo(px,py):g.moveTo(px,py));g.closePath();g.clip();g.filter='brightness(1.55) saturate(1.35)';g.drawImage(imgs[key],0,0,1672,941);g.filter='none';g.fillStyle='#ffd85f55';g.fillRect(x,y,w,h);altarLightCache.set(key,{c,x,y,w,h});
    }
    const light=altarLightCache.get(key),[x,y]=art.mark;ctx.save();halo(x,y,Math.max(light.w,light.h)*.82,'rgba(255,211,79,.7)');ctx.globalAlpha=.92;ctx.drawImage(light.c,light.x,light.y);ctx.shadowColor='#ffda63';ctx.shadowBlur=12;ctx.strokeStyle='#fff1ac';ctx.lineWidth=2;ctx.beginPath();art.polygon.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.stroke();ctx.shadowBlur=0;drawMedal(state.activeRegion,5,x,y+11,27);ctx.restore();visualState.altar={lit:true,mark:art.mark,polygon:art.polygon};
  }
  function updateAltarGuide(){
    if(scene==='hub'||area!==state.segments||state.bag.length!==5){altarGuide=null;return;}
    const gate=entities().find(e=>e.id==='next');
    if(!altarGuide&&gate&&dist(player,gate)<185){altarGuide={points:[],from:null};speech(state.activeRegion==='sea'?'伙伴都认识啦，沿着金色虚线去找贝壳，点亮印记吧':'已经收集齐啦，沿着金色虚线去找石板，点亮印记吧');notify('沿金色虚线，把发现交到印记石板',6);}
    if(altarGuide&&(!altarGuide.from||dist(player,altarGuide.from)>60||altarGuide.points[0]&&!clearLine(player,altarGuide.points[0]))){
      const [x,y]=altars[area];altarGuide.points=pathTo(x,y);altarGuide.from={x:player.x,y:player.y};
    }
  }
  function drawAltarGuide(){
    if(!altarGuide?.points.length)return;
    const points=[player,...altarGuide.points];ctx.save();ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash([12,10]);ctx.lineDashOffset=reduced?0:-time*12;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle='#624824bb';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#ffe69d';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
    const end=points.at(-1),prev=points.at(-2),angle=Math.atan2(end.y-prev.y,end.x-prev.x);ctx.translate(end.x,end.y);ctx.rotate(angle);ctx.fillStyle='#ffe69d';ctx.strokeStyle='#624824';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-9,-8);ctx.lineTo(-5,0);ctx.lineTo(-9,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();visualState.altarGuide=points.map(p=>({x:p.x,y:p.y}));
  }
  function render(){
    if(!ready||!imgs[mapName()])return;
    const now=performance.now();visualDt=Math.min(.1,(now-visualFrameAt)/1000);visualFrameAt=now;const avatar=playerVisual();visualState={glows:[],occluders:[],playerBounds:avatar.bounds};
    const d=renderDPR;ctx.setTransform(d,0,0,d,0,0);
    const maze=scene!=='hub'&&stage().maze;if(maze&&!mazeClose){view.x=(1672-view.w)/2;view.y=-(view.top+(innerHeight-view.top-view.bottom-941*view.scale)/2)/view.scale;}else{view.x=Math.max(0,Math.min(1672-view.w,player.x-view.w/2));view.y=Math.max(0,Math.min(941-view.h,player.y-view.h*.62));}
    if(!maze&&scene!=='hub'&&!$('overlay').hidden&&$('overlay').dataset.mode==='quiz'&&innerWidth>900){const left=$('overlay').dataset.side==='left';view.x=player.x-view.w*(left ? .79 : .21);}
    paintedBackground();ctx.save();ctx.scale(view.scale,view.scale);ctx.translate(-view.x,-view.y);drawWater();drawAltarLight();drawAltarGuide();drawNature();drawCritters();
    if(scene==='hub'){
      Object.entries(regions).forEach(([id,r])=>{const segments=state.regions[id].segments,x=625+r.index*107;
        drawMedal(id,segments,x,235,85);
      });
      if(journey.allComplete())for(let i=0;i<9;i++)firefly(650+i*48,340+Math.sin(time+i)*13,.8);
    }
    const ents=entities();
    if(route.length){const target=route[route.length-1];ctx.strokeStyle='#fff4c4aa';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(target.x,target.y,13,7,0,0,7);ctx.stroke();}
    const drawEntity=e=>{
      const ax=e.artX??e.x,ay=e.artY??e.y;
      if(e.exit){
        if(e.id==='next'){
          if(state.activeRegion!=='sea'){const i=region().index+(e.locked?0:5);ctx.save();ctx.globalAlpha*=foregroundAlpha(e.id+':gate',e,[atlasBounds('gates',i,2,e.x,e.y+15,170,145)]);drawAtlas('gates',i,2,e.x,e.y+15,170,145);ctx.restore();}
          else if(e.locked){ctx.strokeStyle='#d5faff';ctx.lineWidth=2;for(let i=0;i<9;i++){ctx.beginPath();ctx.arc(e.x-60+i*15,e.y+Math.sin(time+i)*3,5,0,7);ctx.stroke();}}
          if(e.locked)for(let i=0;i<5;i++){ctx.fillStyle=i<state.bag.length?'#ffe793':'#725834';ctx.beginPath();ctx.arc(e.x-24+i*12,e.y-18,3,0,7);ctx.fill();}
        }
        if(!e.locked)drawEntrance(e);
        else if(dist(player,e)<230||routeAction===e.id)text(e.label,e.x,e.y+25);return;
      }
      if(e.item!==undefined){
        const it=data.items[e.item],name=it.region==='forest'?'items':it.region+'-items',rows=it.region==='forest'?4:3,w=maze?(state.activeRegion==='sea'?38:34):(state.activeRegion==='sea'?66:54),itemY=ay+(state.activeRegion==='sea'?Math.sin(time*1.4+e.item)*7:0),leaf=state.activeRegion==='forest'&&[3,6,11].includes(e.item);
        const bounds=leaf?transformBounds(atlasBounds(name,it.icon,rows,0,0,45),new DOMMatrix().translate(ax,ay-8).rotate(-.5*180/Math.PI).scale(1,.5)):atlasBounds(name,it.icon,rows,ax,itemY,w);
        ctx.save();ctx.globalAlpha*=foregroundAlpha(e.id,e,[bounds]);itemGlow(e,ax,itemY,w);
        if(state.activeRegion==='forest'&&[3,6,11].includes(e.item)){ctx.save();ctx.translate(ax,ay-8);ctx.rotate(-.5);ctx.scale(1,.5);drawItem(e.item,0,0,45);ctx.restore();}
        else drawItem(e.item,ax,itemY,w);ctx.restore();
      }else{
        if(e.id==='altar'&&stage().maze&&!stage().maze.painted)drawMazeAltar(e);
        if(e.id==='altar'){if(area<state.segments)text('✓ 已提交',ax,ay+24);else if(area===state.segments&&state.bag.length===5)halo(ax,ay-22,80,'rgba(255,220,91,.65)');}
        if(scene==='hub'&&e.id==='charge'&&!state.lamp){
          halo(e.x,e.y-75,100,'rgba(255,230,159,.14)');
          for(let i=0;i<3;i++){ctx.fillStyle=i<state.review?'#ffe9a3':'#fff4cd55';ctx.strokeStyle='#b99459';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x-23+i*23,e.y-24,6,0,7);ctx.fill();ctx.stroke();}
        }
        if((scene==='hub'||dist(player,e)<230||routeAction===e.id)&&!(e.id==='altar'&&area<state.segments))text(e.label,ax,ay+26);
      }
      if(dist(player,e)<80&&mode==='world'){ctx.fillStyle='#fff6d9';ctx.beginPath();ctx.arc(ax,ay-70,14,0,7);ctx.fill();text(inputMode==='gamepad'?'A':inputMode==='touch'?'点':'↵',ax,ay-64);}
    };
    const drawPlayer=()=>{
      const{depth,action,im,meta,progress,frame,f,scale,sx,sy,afloat,bob,hop,matrix}=avatar;
      if(!afloat){ctx.fillStyle='#263e3238';ctx.beginPath();ctx.ellipse(player.x,player.y,(17-hop*3)*depth,(5-hop)*depth,0,0,7);ctx.fill();}
      ctx.save();
      ctx.transform(matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f);
      if(avatar.catching&&animation.dir===3)drawCatchTool(avatar);
      ctx.drawImage(im,...f.sourceRect,sx,sy+bob,f.sourceRect[2]*scale,f.sourceRect[3]*scale);
      if(avatar.catching&&animation.dir!==3)drawCatchTool(avatar);
      if(action&&(animation.kind==='lamp'||animation.kind==='borrowLight'||animation.kind==='preview')){
        const lampX=sx+(f.grip?f.grip.x:((state.activeRegion==='valley'?322:[157,303,339,350][frame])/443.5)*meta.frameWidth)*scale,lampY=sy+(f.grip?f.grip.y:((state.activeRegion==='valley'?288:state.activeRegion==='beach'&&frame===1?235:[360,280,179,291][frame])/443.5)*meta.frameHeight)*scale;
        const dark=(animation.kind==='lamp'&&progress>.5)||(animation.kind==='borrowLight'&&progress<.78);
        if(state.activeRegion==='forest'&&character().bakedLantern&&dark){ctx.save();ctx.beginPath();ctx.ellipse(lampX,lampY,10*depth,14*depth,0,0,7);ctx.clip();ctx.filter='brightness(.4) saturate(.25)';ctx.drawImage(im,...f.sourceRect,sx,sy,f.sourceRect[2]*scale,f.sourceRect[3]*scale);ctx.restore();}
        if(state.activeRegion!=='forest'||!character().bakedLantern){ctx.save();if(dark)ctx.filter='brightness(.45) saturate(.3)';drawAtlas('helpers',region().index,2,lampX+(state.activeRegion==='beach'?Math.sin(progress*Math.PI)*8:0),lampY+10+(state.activeRegion==='sea'?Math.sin(progress*Math.PI*3)*7:0),34*depth);ctx.restore();}
        const restoring=animation.kind==='borrowLight',using=animation.kind==='lamp',p=clamp01((progress-.12)/.76),id=state.activeRegion;
        if(id==='forest'){
          if(restoring){const treeX=animation.facing<0?player.x*2-840:840;if(p<1)firefly(treeX+(lampX-treeX)*p,340+(lampY-340)*p-Math.sin(p*Math.PI)*55,1.1);}
          else if(using&&p>0)firefly(lampX+p*125,lampY-p*90,1-p*.5);
          if(!dark)halo(lampX,lampY,45,'rgba(255,229,134,.5)');
        }else if(id==='castle'){
          // Letter-shaped story sparks settle into the candle, then leave on use.
          for(let i=0;i<4;i++){const d=restoring?1-p:p;ctx.save();ctx.globalAlpha=1-d*.6;ctx.fillStyle='#ffe6a3';ctx.font='bold 17px serif';ctx.fillText(['文','字','书','光'][i],lampX+Math.sin(i*2+d*3)*d*65,lampY-15-d*(45+i*18));ctx.restore();}
          if(!dark){ctx.fillStyle='#fff2b8';ctx.beginPath();ctx.ellipse(lampX,lampY-13,4,10+Math.sin(time*8)*2,0,0,7);ctx.fill();}
        }else if(id==='beach'){
          // Sea breeze coils inward to restore; outward sound rings carry the hint.
          ctx.strokeStyle='#e6ffff';ctx.lineWidth=2;for(let i=0;i<3;i++){const d=restoring?1-p:p;ctx.globalAlpha=.85-d*.4;ctx.beginPath();ctx.arc(lampX,lampY,8+d*(30+i*16),-.7,1.7);ctx.stroke();}ctx.globalAlpha=1;
        }else if(id==='valley'){
          ctx.strokeStyle='#e6ccff';ctx.lineWidth=2;for(let i=0;i<5;i++){const a=i*Math.PI*2/5,d=restoring?1-p:p;ctx.beginPath();ctx.moveTo(lampX,lampY);ctx.lineTo(lampX+Math.cos(a)*d*55,lampY+Math.sin(a)*d*55);ctx.stroke();halo(lampX+Math.cos(a)*d*55,lampY+Math.sin(a)*d*55,7,'rgba(232,204,255,.65)');}
        }else{
          for(let i=0;i<6;i++){const d=restoring?1-p:p;ctx.strokeStyle='#d9fdff';ctx.lineWidth=1.7;ctx.beginPath();ctx.arc(lampX+Math.sin(i*1.8)*d*55,lampY-d*(40+i*12),3+i%3,0,7);ctx.stroke();}
          if(!dark)halo(lampX,lampY,44,'rgba(165,230,255,.5)');
        }

      }
      ctx.restore();
      if(action&&animation.kind==='pickup'&&animation.item){const item=animation.item,spot=spots[item.id],t=Math.max(0,Math.min(1,(progress-.12)/.75)),sx=spot.artX,sy=spot.artY-24;drawItem(item.id,sx+(player.x+7*animation.facing-sx)*t,sy+(player.y-42*depth-sy)*t-Math.sin(t*Math.PI)*38,45*(1-.45*t));}
    };
    ctx.save();ctx.setTransform(renderDPR,0,0,renderDPR,0,0);window.AdventureAtmosphere?.draw(ctx,innerWidth,innerHeight,time,state.activeRegion,reduced);ctx.restore();
    [...ents,...mazeRows(),{id:'player',y:player.y}].sort((a,b)=>a.y-b.y).forEach(e=>e.id==='player'?drawPlayer():e.mazeRow?drawMazeRow(e):drawEntity(e));
    // Repaint only actual illustrated wall pixels overlapping the rabbit.
    // This is a foreground layer; it does not change the walkable mask.
    if(maze?.painted&&maze.mask){const b=avatar.bounds,m=maze.mask,step=m.step,path=new Path2D();let count=0;const openAt=(x,y)=>{const r=m.rows[y]||[];for(let i=0;i<r.length;i+=2)if(x>=r[i]&&x<=r[i+1])return true;return false;};const inFront=(x,y)=>{let bottom=y;while(bottom<m.height&&!openAt(x,bottom)&&bottom-y<80)bottom++;return bottom*step>player.y+4;};
      for(let y=Math.max(0,Math.floor(b.y/step));y<Math.min(m.height,Math.ceil((b.y+b.h)/step));y++){const row=m.rows[y]||[];let run=-1;for(let x=Math.max(0,Math.floor(b.x/step));x<=Math.min(m.width-1,Math.ceil((b.x+b.w)/step));x++){let open=false;for(let i=0;i<row.length;i+=2)if(x>=row[i]&&x<=row[i+1]){open=true;break;}open=open||!inFront(x,y);if(!open&&run<0)run=x;if((open||x===Math.min(m.width-1,Math.ceil((b.x+b.w)/step)))&&run>=0){path.rect(run*step,y*step,(x-run+(open?0:1))*step,step);count++;run=-1;}}}
      if(count){ctx.save();ctx.clip(path);ctx.drawImage(imgs[mapName()],0,0,1672,941);ctx.restore();}visualState.wallForegroundRuns=count;
    }
    if(scene!=='hub'){
      // A cream-edged teal arrow contrasts with gold sand and vegetation.
      // Draw above the wall overlay so distant targets remain discoverable.
      for(const e of ents.filter(e=>e.item!==undefined)){
        const x=e.artX??e.x,y=e.artY??e.y,bob=reduced?0:Math.sin(time*2.2+e.item*.5)*2;
        ctx.save();ctx.translate(x,y-35);ctx.scale(1/view.scale,1/view.scale);ctx.translate(0,-9+bob);
        const b=avatar.bounds,overlap=x>b.x-12&&x<b.x+b.w+12&&y>b.y&&y<b.y+b.h+45;
        ctx.globalAlpha=overlap?.42:.96;ctx.lineJoin='round';ctx.lineWidth=4;ctx.strokeStyle='#fff8e5';ctx.fillStyle='#186877';
        ctx.beginPath();ctx.moveTo(-5,-16);ctx.lineTo(5,-16);ctx.lineTo(5,-8);ctx.lineTo(11,-8);ctx.lineTo(0,3);ctx.lineTo(-11,-8);ctx.lineTo(-5,-8);ctx.closePath();ctx.stroke();ctx.fill();ctx.restore();
      }
    }
    if(catchBurst){const age=(performance.now()-catchBurst.startedAt)/1000;if(age>1.05)catchBurst=null;else{ctx.save();const t=age/1.05;ctx.globalAlpha=1-t;halo(catchBurst.x,catchBurst.y-t*50,23+t*20,'rgba(255,232,139,.55)');drawFauna(catchBurst.species+5,catchBurst.x+Math.sin(t*Math.PI)*25,catchBurst.y-t*80,48*(1-t*.3));ctx.restore();}}
    if(rewardBurst){const age=(performance.now()-rewardBurst.startedAt)/1000;if(age>1.1)rewardBurst=null;else{ctx.save();ctx.globalAlpha=1-age/1.1;for(let i=0;i<8;i++){const a=i*Math.PI/4;halo(player.x+Math.cos(a)*(18+age*65),player.y-45+Math.sin(a)*(18+age*65)-age*25,9,'rgba(255,236,142,.9)');}drawItem(rewardBurst.item.id,player.x,player.y-65-age*60,48);ctx.restore();}}
    ctx.restore();
  }
  function update(dt){
    if(TEST_OPEN)$('game').dataset.test='open';
    if(mode==='world'||mode==='action'){time+=dt;initWildlife();wildlife.update(dt,!reduced);}const pad=padAxes;if(time>noticeUntil)$('notice').classList.remove('show');
    entryCooldown=Math.max(0,entryCooldown-dt);
    if(animation){const now=performance.now();animation.t+=Math.min(.08,Math.max(0,(now-animation.frameAt)/1000));animation.frameAt=now;if(animation.kind==='catch'&&!animation.contact&&animation.t>=animation.duration*.48){animation.contact=true;catchContact();}if(animation.kind==='borrowLight'&&animation.t/animation.duration>=.8&&restoringLight){restoringLight=false;updateHUD();}if(animation.t>=animation.duration){const done=animation.resolve,resume=animation.resume,discovery=animation.discovery;animation=null;mode='world';if(discovery)showDiscovery(discovery.item,discovery.illustration);if(resume&&!discoveryCard){route=pathTo(resume.x,resume.y);routeAction=resume.action;}done?.();}}
    if(mode!=='world'||discoveryCard){player.moving=false;return;}
    let x=pad.x+(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0),y=pad.y+(keys.has('arrowdown')||keys.has('s')?1:0)-(keys.has('arrowup')||keys.has('w')?1:0);
    const boostRemaining=Math.max(0,(player.boostUntil||0)-performance.now()),fastReturn=returningHome&&routeAction==='entry'&&route.length&&!x&&!y,speed=WALK_SPEED*(fastReturn?2:1+.35*smooth(boostRemaining/250)),before={x:player.x,y:player.y};
    if(player.roll>0){
      const progress=rollProgress(),distance=player.rollBase*progress+player.rollBonus*(progress-Math.sin(2*Math.PI*progress)/(2*Math.PI)),step=distance-player.rollDistance;
      movePlayer(player.rollDirection.x*step,player.rollDirection.y*step);player.rollDistance=distance;player.roll=Math.max(0,ROLL_DURATION-(performance.now()-player.rollStartedAt)/1000);if(!player.roll){player.boostUntil=performance.now()+1000;if(player.rollTarget){route=pathTo(player.rollTarget.x,player.rollTarget.y);player.rollTarget=null;}}
    }else if(x||y){route=[];routeAction=null;returningHome=false;const n=Math.max(1,Math.hypot(x,y));movePlayer(x/n*speed*dt,y/n*speed*dt);
    }else{
      // Carry unused distance across waypoints. No idle frame or overshoot at each grid cell.
      let remaining=speed*dt;
      while(route.length&&remaining>0){const next=route[0],dd=dist(player,next);if(dd<.01){route.shift();continue;}
        const step=Math.min(dd,remaining),nx=player.x+(next.x-player.x)/dd*step,ny=player.y+(next.y-player.y)/dd*step;
        if(!walkable(nx,ny)){route=[];routeAction=null;break;}player.x=nx;player.y=ny;remaining-=step;if(step>=dd-.01)route.shift();
      }
    }
    const dx=player.x-before.x,dy=player.y-before.y,moved=Math.hypot(dx,dy),intent=Math.hypot(x,y);player.moving=moved>.01||intent>.01;
    if(player.moving&&!player.roll){
      // Keep the current axis near a diagonal; tiny path/joystick changes must not flip poses every frame.
      const horizontal=player.dir===1||player.dir===2,faceX=intent?x:dx,faceY=intent?y:dy;
      if(Math.abs(faceX)>Math.abs(faceY)*(horizontal?.8:1.25))player.dir=faceX>0?2:1;
      else if(Math.abs(faceY)>Math.abs(faceX)*(horizontal?1.25:.8))player.dir=faceY>0?0:3;
      player.walk+=intent?speed*dt*Math.min(1,intent):moved;
    }
    updateAltarGuide();const ents=entities(),near=nearestEntity();const actionLabel=near?(near.item!==undefined?'看看'+near.label:near.label):'挥动'+catchTool();if($('actionText').textContent!==actionLabel)$('actionText').textContent=actionLabel;
    $('interact').classList.toggle('interaction-ready',!!near);
    if(routeAction&&!route.length){const e=ents.find(e=>e.id===routeAction);routeAction=null;if(e&&dist(player,e)<interactionRadius(e)){e.action();return;}}
    // Enter while approaching a path, never while standing still after arrival
    // or walking away from a return spawn that lies inside the larger doorway.
    if(entryCooldown===0&&player.moving&&!player.roll){const exit=ents.find(e=>e.exit&&!e.locked&&(intent>.01||routeAction===e.id)&&dist(player,e)<EXIT_RADIUS&&dist(player,e)<dist(before,e));if(exit){exit.action();return;}}
  }
  function runFrame(){const begin=performance.now(),dt=Math.min(.1,Math.max(0,(begin-last)/1000)||0);last=begin;update(dt);const updated=performance.now();if(mode==='world'||mode==='action'||renderDirty){render();renderDirty=false;}perf.push({update:updated-begin,render:performance.now()-updated});if(perf.length>120)perf.shift();}
  function loop(){lastNativeFrame=performance.now();runFrame();requestAnimationFrame(loop);}
  function keepActionVisible(){
    clearTimeout(actionTimer);
    const tail=mode==='world'&&lastNativeFrame<actionWakeAt&&performance.now()<actionWakeUntil;
    const keyboardMotion=mode==='world'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].some(k=>keys.has(k));
    if((!animation&&!player.roll&&!tail&&!keyboardMotion)||document.visibilityState!=='visible')return;
    // Measured on first input: rAF can wait 1 s while timers keep running.
    // Only bridge missed action frames; normal rAF and idle scenes do no extra work.
    actionTimer=setTimeout(()=>{if((animation||mode==='world')&&performance.now()-last>50)runFrame();keepActionVisible();},24);
  }
  addEventListener('visibilitychange',()=>{if(animation)animation.frameAt=performance.now();if(animation||player.roll)keepActionVisible();});
  quiz=createAdventureQuiz({journey,state,audio,showPanel,closePanel,notify,persist,finishAnswer,help,onLeave:()=>{journey.cancelQuestion();persist();closePanel();},picture,itemAsset:i=>asset(i)});
  addEventListener('pagehide',()=>{padAxes={x:0,y:0};padOld=[];quiz.cancel();audio.stop();});
  function introduction(){
    showPanel(`<div class="intro-art">${helperAsset(true)}<span class="startRabbit" style="background-image:url('${character().preview}')"></span>${asset(0)}</div><h1>小小探险家</h1><p>五条小路，五种新的发现。<br>听题、思考、跟读，把五枚印记点亮。</p><button class="wood-button" id="start">出发 · 开启声音</button><p class="small-print">第一次请家长点一下开启声音，再交给手柄玩</p>`,'intro');
    $('start').onclick=()=>{audio.unlock();closePanel();if(journey.allComplete()&&!state.celebrated)celebrate();else speech('欢迎来到世界之心。选一条小路，出发吧');if(!journey.canPersist)notify('旧存档暂时无法完整读取，已保留原数据。请家长备份后检查。',12);};
  }
  function loadAsset(name){
    if(imgs[name])return Promise.resolve(imgs[name]);if(assetLoads[name])return assetLoads[name];
    assetLoads[name]=new Promise((resolve,reject)=>{const im=new Image();let settled=false;const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);im.onload=im.onerror=null;if(error){delete assetLoads[name];im.src='';reject(new Error(name));}else{imgs[name]=im;resolve(im);}};const timer=setTimeout(()=>finish(true),45000);im.onload=()=>finish(false);im.onerror=()=>finish(true);im.src=imageURL(name==='rabbit'?'rabbit-walk':name==='actions'?'rabbit-actions-clean':name==='generic'?'rabbit-actions-generic':name);});return assetLoads[name];
  }
  let starting=false,bootGeneration=0;
  async function startWorld(){
    if(starting||ready)return;starting=true;mode='loading';
    const generation=++bootGeneration,names=[...new Set([...assetNames,...AdventureCharacters[state.character].assets])];let done=0,failed=false;
    window.AdventureBoot?.progress('正在打开世界之心',done,names.length);
    try{await Promise.all(names.map(async name=>{await loadAsset(name);done++;if(!failed&&generation===bootGeneration)window.AdventureBoot?.progress('正在打开世界之心',done,names.length);}));await prepareCharacter(state.character);activeCharacter=state.character;ready=true;window.AdventureBootComplete=true;window.AdventureBoot?.done();$('loading').hidden=true;updateHUD();introduction();requestAnimationFrame(loop);}
    catch(e){failed=true;window.AdventureBoot?.fail('画面下载暂时没有完成，请检查网络后再试。已加载的画面会保留。',e.message,startWorld);}
    finally{starting=false;}
  }
  startWorld();
  // Read-only diagnostics for verification. No test path can grant production progress.
  window.ForestDebug={snapshot:()=>({scene,area,mode,character:activeCharacter,critters:critters(),catchTool:catchTool(),visuals:JSON.parse(JSON.stringify(visualState)),performance:perf.slice(-60),renderDPR,animation:animation?{kind:animation.kind,t:animation.t,duration:animation.duration,dir:animation.dir,contact:animation.contact}:null,player:{...player},state:journey.snapshot(),question:journey.question?JSON.parse(JSON.stringify(journey.question)):null,routeLength:route.length,assets:Object.keys(imgs),storageOK,audio:{enabled:audio.enabled,context:audio.ctx?.state,voices:audio.voices.length,events:audio.events.slice(-8)},view:{...view}}),reachability:()=>{
    const list=entities();return list.map(e=>({id:e.id,walkable:walkable(e.x,e.y),path:pathTo(e.x,e.y).length,x:e.x,y:e.y,artX:e.artX,artY:e.artY,distance:dist(player,e)}));
  }};
})();
