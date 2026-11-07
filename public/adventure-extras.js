/* Optional side stories and activities for Little Explorer. */
window.AdventureExtras = function (api) {
  'use strict';
  const key = api.storageKey + '.extras.v1';
  const initial = () => ({ completed: {}, garden: ['🌱', '🌼', '🌱'], outfit: 'none' });
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)) || initial(); } catch { saved = initial(); }
  const progress = { ...initial(), ...saved, completed: { ...(saved.completed || {}) } };
  const save = () => { try { localStorage.setItem(key, JSON.stringify(progress)); } catch { api.notice('这次布置暂时无法保存，请检查存储空间'); } };
  const quests = {
    forest: { icon:'🐿️', name:'松鼠的橡果', intro:'小松鼠有点着急：过冬的橡果还没整理好。', question:'我们可以怎样帮助它？', choices:['陪它一起找','先听它说说'], story:'谢谢你陪我！我们一起数一数橡果吧。', activity:'count', after:'橡果整理好了，小松鼠开心地回家。附近开出了一朵小花！', discuss:'你觉得小松鼠一开始为什么着急？', reward:'🌼' },
    castle: { icon:'🐦', name:'小鸟的故事', intro:'小鸟弄乱了故事书里的图片，它想把故事讲给朋友听。', question:'我们可以怎么做？', choices:['一起排一排','陪它慢慢想'], story:'我们看看种子长大的顺序，帮小鸟讲完故事。', activity:'sequence', after:'故事整理好了，小鸟唱起了歌。', discuss:'如果你是小鸟，你还会给故事加什么？', reward:'🌷' },
    beach: { icon:'🐢', name:'海龟找海边', intro:'小海龟想回到海边，却不知道该往哪里走。', question:'它现在可能是什么心情？', choices:['有点着急','需要陪伴'], story:'我们陪着小海龟，听听海龟的英文，再找到它。', activity:'listen', after:'小海龟找到海边啦，它向你挥了挥小鳍。', discuss:'如果朋友迷路了，我们可以怎样陪伴？', reward:'🐚' },
    valley: { icon:'🦋', name:'蝴蝶的花园', intro:'蝴蝶想找颜色相同的花朵，一起布置花园。', question:'我们怎样帮它？', choices:['一起找花','先看看颜色'], story:'帮蝴蝶找出和提示一样颜色的花吧。', activity:'match', after:'花园布置好了，蝴蝶在花丛中跳舞。', discuss:'你最喜欢什么颜色的花？', reward:'🌸' },
    sea: { icon:'🐠', name:'小鱼的珍珠', intro:'小鱼正在寻找珍珠，它记得珍珠藏在贝壳后面。', question:'我们可以做什么？', choices:['帮它一起找','请它说说线索'], story:'记住珍珠的位置，再找到它。', activity:'memory', after:'小鱼找回了珍珠，珊瑚旁亮起一串小泡泡。', discuss:'你有什么记东西的小方法？', reward:'🪸' }
  };
  const labels = { forest:'森林',castle:'城堡',beach:'海滩',valley:'山谷',sea:'海底' };
  const panel = (title, body, controls='') => {
    api.panel(`<h2>${title}</h2>${body}<div class="extras-actions">${controls}</div><button class="wood-button quiet-button" id="extrasBack">返回探险手册</button><button class="wood-button quiet-button" id="extrasClose">继续探险</button>`, 'extras');
    document.getElementById('extrasBack').onclick = menu;
    document.getElementById('extrasClose').onclick = api.close;
  };
  const btn = (id, label) => `<button class="wood-button" id="${id}">${label}</button>`;
  const on = (id, fn) => { document.getElementById(id).onclick = fn; };
  function menu() {
    const complete = Object.keys(progress.completed).length;
    panel('探险手册', `<p>和小伙伴玩一玩，故事不会影响你的主线进度。已帮助 ${complete}/5 位伙伴。</p>`,
      Object.entries(quests).map(([id,q])=>btn('extra-'+id,`${q.icon} ${labels[id]} · ${progress.completed[id]?'再玩一次':'伙伴故事'}`)).join('') + btn('extra-garden','🌱 我的小花园') + btn('extra-outfit','🎀 探险装扮') + btn('extra-checklist','🔎 自然观察清单') + btn('extra-nature','📖 自然图鉴') + modes.map(m=>btn('mode-'+m.id,m.icon+' '+m.label)).join(''));
    for (const id of Object.keys(quests)) on('extra-'+id,()=>story(id));
    on('extra-garden',careGarden); on('extra-outfit',outfit); on('extra-checklist',checklist); on('extra-nature',api.nature); modes.forEach(m=>on('mode-'+m.id,()=>playMode(api.region(),m.id)));
  }
  function story(id) {
    const q=quests[id];
    panel(q.icon+' '+q.name, `<p>${q.intro}</p><p>${q.question}</p>`, q.choices.map((c,i)=>btn('choice-'+i,c)).join(''));
    q.choices.forEach((_,i)=>on('choice-'+i,()=>{
      panel(q.icon+' '+q.name, `<p>${q.story}</p>`,btn('startActivity','开始帮忙'));
      on('startActivity',()=>activity(id));
    }));
  }
  function activity(id) {
    const q=quests[id];
    const done = () => finish(id);
    const retry = () => { api.notice('再看看，慢慢来'); api.tone([392,440]); };
    if(q.activity==='count') {
      const answer=2+Math.floor(Math.random()*4), choices=[answer-1,answer,answer+1];
      panel('数一数橡果','<p>小松鼠找到这些橡果：<br><strong style="font-size:2em">'+Array(answer).fill('🌰').join(' ')+'</strong></p><p>一共有几个？</p>',choices.map(n=>btn('count-'+n,n+' 个')).join(''));
      choices.forEach(n=>on('count-'+n,n===answer?done:retry));
    } else if(q.activity==='sequence') {
      let step=0;const order=['种子','小花苗','小花'],icons=['🫘','🌱','🌼'];
      const draw=()=>{panel('种子的故事','<p>按长大的顺序，依次点选：'+(step?icons.slice(0,step).join(' → ')+' → ':'')+'？</p>',order.map((name,i)=>btn('seq-'+i,icons[i]+' '+name)).join(''));
        order.forEach((_,i)=>on('seq-'+i,()=>{if(i!==step){retry();return;}step++;if(step===order.length)done();else draw();}));};draw();
    } else if(q.activity==='listen') {
      panel('听一听，找一找','<p>听英文，找出对应的动物。可以多听几次。</p>',btn('listen-again','🔊 再听一次')+btn('listen-turtle','🐢 海龟')+btn('listen-bird','🐦 小鸟')+btn('listen-fish','🐠 小鱼'));
      const say=()=>api.say('turtle','en-US');on('listen-again',say);on('listen-turtle',done);on('listen-bird',retry);on('listen-fish',retry);say();
    } else if(q.activity==='match') {
      const flowers=[['pink','🌸','粉色'],['yellow','🌼','黄色'],['red','🌹','红色']],target=flowers[Math.floor(Math.random()*flowers.length)];
      panel('蝴蝶找花','<p>蝴蝶想找一朵'+target[2]+'的花，点一朵试试。</p>',flowers.map(([key,icon,name])=>btn(key,icon+' '+name)).join(''));
      flowers.forEach(([key])=>on(key,key===target[0]?done:retry));
    } else {
      const target=Math.floor(Math.random()*3),places=['左边','中间','右边'];
      panel('记住珍珠的位置','<p id="memoryHint">先看一看：珍珠在'+places[target]+'的贝壳里。</p><p style="font-size:2em">'+[0,1,2].map(i=>i===target?'💎':'🐚').join('　')+'</p>',btn('memoryStart','我记住了'));
      on('memoryStart',()=>{
        panel('找到珍珠','<p>珍珠藏在哪个贝壳里？</p>',[0,1,2].map(n=>btn('shell-'+n,'🐚 '+['左边','中间','右边'][n])).join(''));
        [0,1,2].forEach(n=>on('shell-'+n,n===target?done:retry));
      });
    }
  }
  function finish(id) {
    const q=quests[id];progress.completed[id]=true;save();api.tone([659,880,1047]);
    panel('帮助成功 '+q.icon, `<p>${q.after}</p><p>获得花园纪念品 ${q.reward}</p><p>和家人聊一聊：${q.discuss}</p>`,btn('again','再玩一次')+btn('decorate','去布置花园'));
    on('again',()=>activity(id));on('decorate',garden);
  }
  function garden() {
    const available=['🌱','🌼',...new Set(Object.keys(progress.completed).map(id=>quests[id]?.reward).filter(Boolean))];
    panel('我的小花园','<p>点花盆更换装饰。帮助更多伙伴，可以获得新的纪念品。</p>',progress.garden.map((v,i)=>btn('pot-'+i,`花盆 ${i+1} · ${v}`)).join(''));
    progress.garden.forEach((_,i)=>on('pot-'+i,()=>{const current=available.indexOf(progress.garden[i]);progress.garden[i]=available[(current+1)%available.length];save();api.dirty();garden();}));
  }
  function outfit() {
    const options=[['none','原来的样子'],['ribbon','🎀 蝴蝶结'],['star','⭐ 星星徽章'],['flower','🌼 小花']];
    panel('探险装扮','<p>选一个喜欢的装饰，随时可以更换。</p>',options.map(([id,label])=>btn('wear-'+id,(progress.outfit===id?'✓ ':'')+label)).join(''));
    options.forEach(([id])=>on('wear-'+id,()=>{progress.outfit=id;save();api.dirty();outfit();}));
  }
  const discoveries = {
    forest: {clue:'树上跳来跳去，蓬松的大尾巴，喜欢橡果。', answer:'🐿️ 松鼠', options:['🐿️ 松鼠','🐢 海龟','🐠 小鱼'], fact:'松鼠会收集和藏起食物。'},
    castle: {clue:'有羽毛和翅膀，会在树枝上唱歌。', answer:'🐦 小鸟', options:['🐢 海龟','🐦 小鸟','🦋 蝴蝶'], fact:'鸟儿用树枝等材料筑巢。'},
    beach: {clue:'背着硬硬的壳，用鳍在海里游泳。', answer:'🐢 海龟', options:['🐢 海龟','🐿️ 松鼠','🐦 小鸟'], fact:'海龟用鳍游泳。'},
    valley: {clue:'有彩色翅膀，在花朵之间飞舞。', answer:'🦋 蝴蝶', options:['🐠 小鱼','🦋 蝴蝶','🐢 海龟'], fact:'蝴蝶会到花朵上寻找花蜜。'},
    sea: {clue:'住在水里，用鳍游泳，身上有鳞片。', answer:'🐠 小鱼', options:['🐿️ 松鼠','🐦 小鸟','🐠 小鱼'], fact:'鱼用鳃从水里获取氧气。'}
  };
  progress.observed = progress.observed || {};
  progress.bridges = progress.bridges || {};
  progress.kindness = progress.kindness || {};
  progress.listens = progress.listens || {};
  progress.growth = Array.isArray(progress.growth) ? progress.growth : [0,0,0];
  const modes = [
    {id:'detective',icon:'🔎',label:'自然侦探'},
    {id:'bridge',icon:'🌈',label:'规律铺路'},
    {id:'feelings',icon:'💛',label:'心情小帮手'},
    {id:'sounds',icon:'🔊',label:'听声寻宝'}
  ];
  function checklist(){
    panel('🔎 自然观察清单','<p>在各个地方找到自然侦探，读线索、认识小动物。每找到一个，就记在这里。</p>'+Object.entries(discoveries).map(([id,d])=>`<p>${progress.observed[id]?'✅ '+d.answer+'：'+d.fact:'⬜ '+labels[id]+'：等待发现'}</p>`).join(''),btn('viewNature','📖 打开自然图鉴'));
    on('viewNature',api.nature);
  }
  function detective(id){
    const d=discoveries[id];
    panel('🔎 '+labels[id]+'自然侦探',`<p>找找是谁留下了线索？</p><p style="font-size:1.3em">${d.clue}</p>`,d.options.map((o,i)=>btn('clue-'+i,o)).join(''));
    d.options.forEach((o,i)=>on('clue-'+i,()=>{
      if(o!==d.answer){api.notice('再看看线索，试试其他的');return;}
      progress.observed[id]=true;save();api.tone([659,880]);api.dirty();
      panel('发现啦！ '+d.answer,`<p>${d.fact}</p><p>已经记入自然观察清单。</p>`,btn('clueList','看看观察清单')+btn('clueAgain','再看一次线索'));
      on('clueList',checklist);on('clueAgain',()=>detective(id));
    }));
  }
  function bridge(id){
    const sets=[['🌼','🌷'],['🔵','🟡'],['🐚','⭐'],['🍃','🌸']];
    const pair=sets[Math.floor(Math.random()*sets.length)],length=4+Math.floor(Math.random()*2);let step=0;
    const draw=()=>{
      const sequence=Array.from({length:length+step},(_,i)=>pair[i%2]).join('　');
      panel('🌈 规律铺路',`<p>照着规律铺路，帮小伙伴走过去。还要铺 ${3-step} 块。</p><p style="font-size:1.6em">${sequence}　❔</p>`,pair.map((p,i)=>btn('stone-'+i,p)).join(''));
      pair.forEach((p,i)=>on('stone-'+i,()=>{
        if(i!==(length+step)%2){api.notice('看看前面是怎样轮流出现的');return;}
        step++;if(step<3){draw();return;}
        progress.bridges[id]=true;save();api.dirty();api.tone([523,659,784]);
        panel('🌈 小路铺好啦',`<p>你发现了交替的规律！${labels[id]}的小路又有生机了。</p>`,btn('bridgeAgain','再铺一条'));
        on('bridgeAgain',()=>bridge(id));
      }));
    };draw();
  }
  function feelings(id){
    const situations=[['小兔的积木倒了，它低着头。','难过','我们陪它一起慢慢重搭。'],['小鸟找不到朋友，走来走去。','着急','先陪它停一停，再一起找。'],['小猫看到新游戏，蹦蹦跳跳。','开心','和它一起分享这份开心。']];
    const s=situations[Math.floor(Math.random()*situations.length)],choices=['难过','着急','开心'];
    panel('💛 心情小帮手',`<p>${s[0]}</p><p>你觉得它可能是什么心情？</p>`,choices.map((x,i)=>btn('feeling-'+i,x)).join(''));
    choices.forEach((x,i)=>on('feeling-'+i,()=>{
      panel('💛 一起陪伴',`<p>你猜它${x}。它也许会觉得${s[1]}，每个人的感受都可能不一样。</p><p>我们可以怎样陪它？</p>`,btn('help-listen','先听它说说')+btn('help-breathe','陪它慢慢呼吸')+btn('help-together','问问它需要什么'));
      ['help-listen','help-breathe','help-together'].forEach(key=>on(key,()=>{
        progress.kindness[id]=true;save();api.dirty();
        panel('💛 温暖的陪伴',`<p>${s[2]}</p><p>愿意倾听和陪伴，就是很棒的帮助。</p>`,btn('feelingAgain','再听一个故事'));on('feelingAgain',()=>feelings(id));
      }));
    }));
  }
  function sounds(id){
    const animals=[['turtle','🐢 海龟'],['bird','🐦 小鸟'],['fish','🐠 小鱼']];let target=animals[Math.floor(Math.random()*animals.length)],round=0;
    const draw=()=>{
      panel('🔊 听声寻宝',`<p>听英文声音，找到相应的动物。第 ${round+1} / 3 次。</p>`,btn('soundPlay','🔊 听一听')+animals.map((a,i)=>btn('sound-'+i,a[1])).join(''));
      on('soundPlay',()=>api.say(target[0],'en-US'));
      animals.forEach((a,i)=>on('sound-'+i,()=>{
        if(a!==target){api.notice('再听一听，试试其他小动物');return;}
        round++;if(round<3){const next=animals.filter(x=>x!==target);target=next[Math.floor(Math.random()*next.length)];draw();return;}
        progress.listens[id]=true;save();api.dirty();api.tone([659,784,988]);
        panel('🔊 找到了！','<p>你听到声音，找到了小动物。宝藏是闪闪发光的贝壳！</p>',btn('soundAgain','再玩一次'));on('soundAgain',()=>sounds(id));
      }));api.say(target[0],'en-US');
    };draw();
  }
  function playMode(id,mode){({detective,bridge,feelings,sounds})[mode]?.(id);}
  function careGarden(){
    panel('🌱 照顾小花园','<p>给花盆播种、浇水，看它开花。帮助小伙伴还可以获得新的花园装饰。</p>',progress.growth.map((n,i)=>btn('care-'+i,`花盆 ${i+1} · ${['🟤 播种','🌱 浇水','🌼 开花啦'][n]}`)).join('')+btn('gardenDecor','🌷 布置花园'));
    progress.growth.forEach((n,i)=>on('care-'+i,()=>{progress.growth[i]=(n+1)%3;progress.garden[i]=['🌱','🌿','🌼'][progress.growth[i]];save();api.dirty();careGarden();}));on('gardenDecor',garden);
  }

  return {menu,story,progress,quests,modes,playMode,careGarden,checklist};
};
