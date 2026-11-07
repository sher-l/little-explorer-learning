(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  root.createAdventureQuiz=function({journey,state,audio,showPanel,closePanel,notify,persist,finishAnswer,help,onLeave,picture,itemAsset}){
    let epoch=0,session=null,prompt=Promise.resolve(),speaking=false,busy=false,focusSerial=0,poemSubmit=null,poemToken=null,poemStep=0,poemCurrent='';
    const $=id=>document.getElementById(id);
    const current=(version,token)=>version===epoch&&journey.question?.token===token;
    function cancel(){epoch++;focusSerial++;busy=false;speaking=false;const old=session;session=null;poemSubmit=null;old?.cancel().catch(()=>{});audio.stop?.();}
    function pic(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]+$/.test(id)&&picture?picture(id):'<span class="quiz-missing-picture" aria-label="图片暂时没有准备好">?</span>';}
    function icon(art){return Number.isInteger(art.itemIcon)&&art.itemIcon>=0&&art.itemIcon<15&&itemAsset?itemAsset(art.itemIcon):pic(art.picture||art.icon||'apple');}
    function group(n,art,label=''){
      const count=Math.max(0,Math.min(20,Math.floor(Number(n)||0)));
      return `<div class="quiz-group">${label?`<span class="quiz-group-label">${esc(label)}</span>`:''}<div class="quiz-objects">${count?Array.from({length:count},()=>`<span class="quiz-object">${icon(art)}</span>`).join(''):'<span class="quiz-zero">0</span>'}</div></div>`;
    }
    function shape(value){return ['circle','square','triangle'].includes(value)?`<span class="shape ${value}" aria-hidden="true"></span>`:esc(value);}
    function art(q){
      const a=q.art||{};
      if(a.type==='equation'){
        const term=value=>`<div class="quiz-term">${typeof value==='number'&&a.picture?group(value,a):''}<span class="quiz-equation-number">${esc(value)}</span></div>`;
        return `<div class="quiz-equation">${term(a.left)}<span class="quiz-operator">${esc(a.operator)}</span>${term(a.right)}<span class="quiz-operator">=</span>${term(a.result)}</div>`;
      }
      if(a.type==='groups')return `<div class="quiz-groups">${(a.groups||[]).map(g=>group(g.count,g,g.label)).join('')}</div>`;
      if(a.type==='sequence')return `<div class="quiz-sequence">${(a.values||[]).map(value=>`<span class="quiz-sequence-value">${esc(value)}</span>`).join('<span class="quiz-sequence-gap">·</span>')}</div>`;
      if(a.type==='glyph')return `<div class="quiz-glyph ${String(a.value).length>4?'quiz-glyph-long':''}">${esc(a.value)}</div>`;
      if(a.type==='picture')return `<div class="quiz-picture-large">${icon(a)}</div>`;
      // Old saved questions can still be reviewed without changing their answers.
      if(q.kind==='shape')return shape(q.shape);
      if(q.kind==='pattern')return `<div class="quiz-sequence">${(q.sequence||[]).map(shape).join(' ')}<b>?</b></div>`;
      if(['sum','subtract'].includes(q.kind))return `<div class="quiz-equation">${group(q.n,{itemIcon:q.icon})}<b>${q.kind==='sum'?'+':'−'}</b>${group(q.m,{itemIcon:q.icon})}<b>= ?</b></div>`;
      if(q.n!==undefined)return group(q.n,{itemIcon:q.icon});
      return q.promptGlyph?`<div class="quiz-glyph">${esc(q.promptGlyph)}</div>`:'';
    }
    const childPrompts={"common.daily.rain":["下雨出门，拿什么可以挡住雨？","下雨啦，拿什么挡雨？"],"common.daily.drink":["喝水时，用哪一个容器？","喝水用什么？"],"common.daily.teeth":["清洁牙齿，应该用哪一样？","刷牙用什么？"],"common.daily.hands":["洗手时，哪一样能帮助洗掉手上的脏东西？","洗手时，除了水还用什么？"],"common.daily.story":["想看故事，可以打开哪一样？","想看故事，打开什么？"],"common.daily.rubbish":["野餐结束，哪一样应该收进垃圾袋带走？","野餐后，什么要带走？"],"common.travel.road":["下面哪一样主要在公路上行驶？","什么在马路上跑？"],"common.travel.river":["想渡过一条河，可以乘坐哪一样？","过河可以坐什么？"],"common.home.shelter":["哪一样是人们居住、遮风挡雨的地方？","下雨了，哪里能躲雨？"],"common.body.hear":["听见铃声，主要靠哪一个部位？","用哪里听声音？"],"common.body.see":["看见花朵的颜色，主要靠哪一个部位？","用哪里看颜色？"],"common.body.speak":["我们用哪一个部位说话？","用哪里说话？"],"common.body.hold":["拿起一本书，通常要用哪一个部位？","用哪里拿书？"],"common.animal.fish-home":["小鱼需要生活在哪里？","小鱼住在哪里？"],"common.animal.feathers":["下面哪种动物身上长着羽毛？","谁身上有羽毛？"],"common.nature.seed":["什么可以播进土里，慢慢长成小植物？","什么种下去会发芽？"],"common.nature.sunlight":["植物生长通常需要光。下面哪一样能提供阳光？","谁会发出阳光？"],"common.nature.root-water":["小树的根能从土里吸收什么？","树根从土里喝什么？"],"common.nature.rain-water":["哪种天气会把小水滴带到地面上？","雨从哪里落下来？"],"common.nature.hot":["下面哪一样很烫，要离远一点，不能用手摸？","什么很烫，不能摸？"],"common.animal.meow":["会发出“喵喵”叫声的是谁？","谁会喵喵叫？"],"common.animal.woof":["会发出“汪汪”叫声的是谁？","谁会汪汪叫？"],"common.animal.nest":["许多小鸟把鸟巢搭在哪一样上？","小鸟把家搭在哪里？"],"common.nature.tree-leaf":["哪一样长在树枝上，常常是绿色的？","树枝上长着什么绿绿的东西？"],"common.nature.fruit-apple":["哪一样是可以吃的水果？","哪个是水果，可以吃？"],"common.nature.fruit-banana":["哪一样是外皮常为黄色、弯弯的水果？","哪个水果黄黄的、弯弯的？"],"common.nature.moon":["夜空中，哪一样有时看起来像弯弯的小船？","夜空中，什么像弯弯的小船？"],"common.nature.landform":["哪一样是高高隆起的地形？","哪个地方高高的？"],"common.nature.flower":["春天花园里，哪一样会开出漂亮的花瓣？","花园里，什么会开花？"],"common.nature.rain-help":["花盆里的土太干了，可以给花浇一点什么？","土干了，给花浇什么？"],"common.reason.boat-road":["船离开水面来到干燥的路上，换成哪一样更适合行驶？","在马路上，坐什么更方便？"],"common.reason.water-container":["想把一些水从桌子这边带到那边，拿哪一样来装最合适？","用什么装水？"],"common.reason.rain-book":["书不能淋湿。下雨时，用哪一样帮忙挡雨？","下雨了，用什么帮书挡雨？"],"common.reason.find-sound":["闭着眼睛也能听到朋友说话，是哪一个部位在帮忙？","闭上眼，还能用哪里听声音？"],"common.reason.night-light":["太阳落山后，下面哪一样可能出现在夜空中？","天黑了，天空中可能有什么？"],"common.reason.leaf-tree":["秋风吹落一片树叶，它原来最可能长在哪一样上？","树叶原来长在哪里？"],"common.reason.sprout":["想种出小花，先把哪一样种进土里？","想种花，先种什么？"],"common.reason.bird-move":["想从地面飞到高高的树枝上，哪种动物最容易做到？","谁能飞到树枝上？"],"common.reason.fish-return":["小鱼离开水不能好好生活，应让它回到哪一样里？","小鱼离开水了，送它回哪里？"],"common.reason.dirty-hands":["手上沾了泥，准备吃苹果。洗手时除了水，还可以用什么？","手脏了，洗手还要用什么？"],"common.reason.cleanup":["草地上哪些东西是人们用完后留下的，应该带走？","草地上，什么垃圾要带走？"],"common.reason.story-page":["看到封面、书页和一幅幅图画，这件东西是什么？","有封面和图画的是什么？"],"common.reason.boat-water":["小船要顺利漂起来，应该把它放到哪里？","小船放在哪里能漂起来？"],"common.reason.water-growth":["一盆植物好久没浇水，叶子低下了头。应该先检查它是否缺什么？","小花叶子耷拉了，可能缺什么？"],"common.reason.home-rain":["突然下起大雨，下面哪一样能作为避雨的建筑？","下大雨了，哪里可以躲雨？"],"science.stone.0":["观察石头颜色，可以用什么？","用什么看石头的颜色？"],"science.stone.1":["比较两颗石头谁重，可以怎样做？","怎么知道哪颗石头重？"],"science.stone.2":["石头表面有尖角，应该怎样拿？","石头有尖角，要怎么拿？"],"science.stone.3":["要数清几颗小石头，可以怎样做？","怎么数清小石头？"],"science.stone.4":["捡完石头准备吃东西，先做什么？","捡完石头，吃东西前做什么？"],"science.stone.5":["石头掉进清水里，水面通常会怎样？","石头掉进水里，会怎样？"],"science.stone.6":["要看石头上很小的纹路，可以用什么？","用什么看石头的小纹路？"],"science.stone.7":["怎样比较两颗石头谁长？","怎么比石头的长短？"],"science.stone.8":["河边石头湿滑，走路要怎样？","河边的石头滑，怎么走？"],"science.stone.9":["观察化石，可以做什么？","怎么观察化石？"],"science.stone.10":["发现不认识的石头，能舔一舔吗？","不认识的石头能舔吗？"],"science.stone.11":["拿走别人的石头标本前，应该怎样？","拿别人的石头前，要怎么做？"],"science.stone.12":["把一堆石头按颜色分组，哪种方法合适？","怎么把同色石头放一起？"],"science.stone.13":["石头要放稳，选哪里？","石头放哪里比较稳？"],"science.stone.14":["在山谷观察石头，要和谁一起？","在山谷看石头，要和谁一起？"]};
    function childPrompt(q){const p=childPrompts[q.id];return p&&q.text===p[0]?p[1]:q.text;}
    function option(o,q){
      if(o.type==='number'||o.type==='count')return `<span class="quiz-answer-number">${esc(o.n)}</span>`;
      if(o.type==='shape')return shape(o.shape);
      if(o.type==='picture')return `<span class="quiz-option-picture">${pic(o.picture)}</span>${q.focusVoicePolicy==='silent'?'':`<span class="quiz-option-label">${esc(o.label)}</span>`}`;
      const stoneIcons=[["👀","👂","👄"],["⚖️","👂","⬆️"],["👐","✊","👄"],["🔢","🙈","➕"],["🧼","🍎","🖐️"],["💦","🥛","🍞"],["🔍","🥄","🛏️"],["📏","↔️","🎨"],["🚶","🏃","💦"],["🔍","🔨","🗑️"],["🙅","👅","🦷"],["💬","🙈","✊"],["🎨","🌈","🪨"],["🪑","⚠️","📚"],["🧑‍🤝‍🧑","🏃","🤫"]];
      const m=String(o.id||'').match(/^science\.stone\.(\d+)\.(\d+)$/),symbol=m&&stoneIcons[+m[1]]?.[+m[2]];
      return `${symbol?`<span class="quiz-option-symbol" aria-hidden="true">${symbol}</span>`:''}<span class="quiz-option-text">${esc(o.text||o.label)}</span>`;
    }
    function optionLabel(o,q,index){return q.region==='castle'&&q.kind==='character'?'选项'+(index+1)+(o.type==='picture'?'，观察图片':'，观察字形'):(o.label||o.n);}
    function toolButton(a){const r=root.AdventureWorlds.regions[state.activeRegion],label=a.review?'复习中不使用道具':state.lamp?r.tool.use:r.tool.empty;return `<span class="asset tool-icon" aria-hidden="true" style="background-image:url('assets/helpers.webp');background-size:500% 200%;background-position:${r.index*25}% 0%"></span><span>${esc(label)}</span>`;}
    function footer(a){return `<div class="panel-actions quiz-actions"><button class="wood-button quiet-button" id="repeatQ">♫ 再听一次</button><button class="wood-button ${state.lamp?'':'is-dim'}" id="helpQ" ${a.review?'disabled':''}>${toolButton(a)}</button><button class="wood-button quiet-button" id="leaveQ">先收起来</button></div><p class="quiz-caption">${a.review?`复习旧题 · ${esc(state.review)}/3`:a.q.kind==='poem'?(a.q.wholePoem?'点下一句，跟着念':'听一句，跟着念一句'):'听清题目，再选答案'}</p>`;}
    function bindCommon(){
      $('repeatQ').onclick=()=>repeat();
      $('helpQ').onclick=()=>help();
      $('leaveQ').onclick=()=>{cancel();journey.cancelQuestion();persist();closePanel();onLeave?.();};
    }
    function status(text){if($('poemStatus'))$('poemStatus').textContent=text;}
    function syncMic(){if($('parentReading'))$('parentReading').disabled=busy;}
    function repeat(){
      const a=journey.question;if(!a)return Promise.resolve();
      if(busy)return Promise.resolve();
      if(a.q.kind==='poem'&&(busy||session?.state==='recording'||session?.state==='requesting'))return Promise.resolve();
      const version=epoch,token=a.token;
      focusSerial++;speaking=true;syncMic();
      if(a.q.kind==='poem')status('跟着念一念，准备好了就点下一句。');
      if($('choiceStatus'))$('choiceStatus').textContent='正在读题…';
      const serial=focusSerial;
      const readPrompt=async()=>{
        if(a.q.kind!=='poem')return audio.say(childPrompt(a.q)!==a.q.text?childPrompt(a.q):a.q.say||a.q.text,{interrupt:true,lang:a.q.lang||'zh-CN',rate:a.hinted?.72:1});
        const lines=Array.isArray(a.q.poemLines)&&a.q.poemLines.length?a.q.poemLines:[a.q.expectedText||a.q.expected_text].filter(Boolean);
        const items=poemCurrent==='__whole__'?[[a.q.title,a.q.author].filter(Boolean).join('。'),...lines]:[poemCurrent];
        let result;
        for(const item of items.filter(Boolean)){
          if(!current(version,token)||serial!==focusSerial)return {reason:'cancelled'};
          result=await audio.say(item,{interrupt:true,lang:'zh-CN',rate:1});
          if(result?.reason==='cancelled')return result;
        }
        return result;
      };
      prompt=Promise.resolve(readPrompt()).catch(()=>({reason:'error'})).then(result=>{
        if(!current(version,token)||serial!==focusSerial)return;
        speaking=false;syncMic();
        const failed=result&&['unavailable','local-voice-unavailable','error','timeout','blocked','recorded-timeout'].includes(result.reason);
        const readStatus=failed?'声音没播出来，按 X 或“再听一次”重试；也可以自己看着念。':result?.reason==='silent'?'声音已关闭，可在暂停菜单调高音量。':a.q.region==='castle'?'先观察字形和图片，选好后再听读音。':'听清题目，再选答案';
        if($('choiceStatus'))$('choiceStatus').textContent=readStatus;
        if(failed){if(a.q.kind==='poem')status(readStatus);return result;}
        if(a.q.kind==='poem')status('轮到你啦，跟着念一念，念完自己继续探险。');
        return result;
      });
      return prompt;
    }
    async function optionVoice(o,q,version,token,serial){
      const spoken=await prompt;
      if(spoken&& !['recorded','ended'].includes(spoken.reason))return;
      if(!current(version,token)||(serial!==undefined&&serial!==focusSerial))return;
      if(q.focusVoicePolicy==='silent')return;
      await Promise.resolve(audio.say(o.voice||o.say||o.label||String(o.n??''),{interrupt:true,lang:o.lang||q.lang||'zh-CN'})).catch(()=>{});
    }
    function choices(a,version){
      const q=a.q,token=a.token;
      showPanel(`<section class="adventure-quiz" aria-labelledby="quizTitle"><h2 id="quizTitle">${esc(childPrompt(q))}</h2>${a.review?`<div id="reviewProgress" class="review-progress" aria-label="复习完成 ${state.review}/3">${[0,1,2].map(i=>`<span class="${i<state.review?'on':''}">${i<state.review?'✓':'○'}</span>`).join('')}</div>`:''}<div id="question-art" class="quiz-art">${art(q)}</div><div class="answers quiz-answers">${q.options.map((o,i)=>`<button class="answer" data-answer="${i}" aria-label="${esc(optionLabel(o,q,i))}">${option(o,q)}</button>`).join('')}</div>${q.focusVoicePolicy==='silent'?'':`<button class="wood-button quiet-button listen-options" id="listenOptions">🔊 听选项</button>`}<p id="choiceStatus" class="choice-status" role="status" aria-live="polite">${a.review?'再想一想，选一个答案':'听清题目，再选答案'}</p>${footer(a)}</section>`,'quiz');
      bindCommon();
      if($('listenOptions'))$('listenOptions').onclick=async()=>{
        const serial=++focusSerial;audio.stop?.();
        for(const o of q.options){
          if(!current(version,token)||serial!==focusSerial||busy)return;
          const result=await audio.say(o.voice||o.say||o.label||String(o.n??''),{interrupt:true,lang:o.lang||q.lang||'zh-CN'});
          if(result?.reason==='cancelled')return;
        }
      };
      $('panel').querySelectorAll('[data-answer]').forEach(button=>{
        const index=Number(button.dataset.answer),o=q.options[index];
        button.addEventListener('focus',()=>{if(!busy)optionVoice(o,q,version,token,++focusSerial);});
        button.onclick=async()=>{
          if(busy||!current(version,token))return;
          busy=true;focusSerial++;audio.stop?.();button.classList.add('is-selected');
          $('panel').querySelectorAll('button').forEach(b=>b.disabled=true);
          const result=journey.answer(index,token);persist();
          if(result.type==='retry'||result.type==='easier'){
            const nextToken=journey.question.token;button.classList.add('try-again');
            $('choiceStatus').textContent=result.type==='easier'?'我们换一道，慢慢来':'再想一想，试试别的答案';$('choiceStatus').dataset.kind='retry';
            const voice=q.focusVoicePolicy==='silent'?Promise.resolve():Promise.resolve(audio.say(o.voice||o.label||String(o.n??''),{interrupt:true,lang:o.lang||q.lang||'zh-CN'})).catch(()=>{});
            let timer;await Promise.all([new Promise(r=>setTimeout(r,650)),Promise.race([voice,new Promise(r=>{timer=setTimeout(r,1600);})])]);clearTimeout(timer);
            if(current(version,nextToken))draw();
          }else if(!['idle','stale','unavailable'].includes(result.type))finishAnswer(result,index);
        };
      });
      const initialPrompt=repeat(),initialFocus=focusSerial;
      initialPrompt.then(()=>{if(current(version,token)&&!busy&&focusSerial===initialFocus&&q.focusVoicePolicy!=='silent')optionVoice(q.options[0],q,version,token,initialFocus);});
    }
    function poemBody(q){return `<div class="poem-line${q.wholePoem?' whole-poem':''}" lang="zh-CN">${q.wholePoem?q.poemLines.map(line=>`<span>${esc(line)}</span>`).join(''):esc(q.expectedText||q.expected_text)}</div>`;}
    function poetry(a,version){
      const q=a.q,token=a.token;
      const lines=Array.isArray(q.poemLines)&&q.poemLines.length?q.poemLines:[q.expectedText||q.expected_text].filter(Boolean);
      if(poemToken!==token){poemToken=token;poemStep=0;poemCurrent=[q.title,q.author].filter(Boolean).join('。');}
      showPanel(`<section class="adventure-quiz poem-quiz" aria-labelledby="quizTitle"><div class="poem-heading"><h2 id="quizTitle">${esc(q.title||'一起念古诗')}</h2><span>${esc(q.author)}</span></div>${poemBody(q)}<p id="poemStatus" role="status" aria-live="polite">先听题目和作者，再自己点下一句。</p><div class="poem-record-actions"><button class="wood-button" id="poemNext">${poemStep<lines.length?'下一句':'听整首古诗'}</button><button class="wood-button" id="selfReading">念完啦 · 继续</button></div>${footer(a)}</section>`,'quiz');
      $('panel').scrollTop=0;bindCommon();
      $('poemNext').onclick=()=>{if(!current(version,token))return;if(poemStep<lines.length){poemCurrent=lines[poemStep++];$('poemNext').textContent=poemStep<lines.length?'下一句':'听整首古诗';}else poemCurrent='__whole__';repeat();};
      $('selfReading').onclick=()=>{if(!current(version,token))return;const result=journey.confirmPoemBySelf(token);persist();if(result.q)finishAnswer(result,-1);};repeat();
    }
    function draw(){cancel();const a=journey.question;if(!a)return;if(a.q.region==='castle'&&a.q.kind==='character')a.q.focusVoicePolicy='silent';const version=epoch;a.q.kind==='poem'?poetry(a,version):choices(a,version);}
    return {draw,cancel,repeat};
  };
})(window);
