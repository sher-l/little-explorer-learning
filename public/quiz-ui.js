(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  root.createAdventureQuiz=function({journey,state,audio,showPanel,closePanel,notify,persist,finishAnswer,help,onLeave,picture,itemAsset}){
    let epoch=0,session=null,prompt=Promise.resolve(),speaking=false,busy=false,focusSerial=0,poemSubmit=null;
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
    function option(o,q){
      if(o.type==='number'||o.type==='count')return `<span class="quiz-answer-number">${esc(o.n)}</span>`;
      if(o.type==='shape')return shape(o.shape);
      if(o.type==='picture')return `<span class="quiz-option-picture">${pic(o.picture)}</span>${q.focusVoicePolicy==='silent'?'':`<span class="quiz-option-label">${esc(o.label)}</span>`}`;
      return `<span class="quiz-option-text">${esc(o.text||o.label)}</span>`;
    }
    function toolButton(a){const r=root.AdventureWorlds.regions[state.activeRegion],label=a.review?'复习中不使用道具':state.lamp?r.tool.use:r.tool.empty;return `<span class="asset tool-icon" aria-hidden="true" style="background-image:url('assets/helpers.webp');background-size:500% 200%;background-position:${r.index*25}% 0%"></span><span>${esc(label)}</span>`;}
    function footer(a){return `<div class="panel-actions quiz-actions"><button class="wood-button quiet-button" id="repeatQ">♫ 再听一次</button><button class="wood-button ${state.lamp?'':'is-dim'}" id="helpQ" ${a.review?'disabled':''}>${toolButton(a)}</button><button class="wood-button quiet-button" id="leaveQ">先收起来</button></div><p class="quiz-caption">${a.review?`复习旧题 · ${esc(state.review)}/3`:a.q.kind==='poem'?(a.q.wholePoem?'听完整首，再念给家长听':'听一句，跟着念一句'):'听清题目，再选答案'}</p>`;}
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
      if(a.q.kind==='poem')status(a.hinted?'用引路水母听慢速范读，再试一遍。':(a.q.wholePoem?'先听完整首，听完再开始。':'先听这一句，听完再开始。'));
      prompt=Promise.resolve(audio.say(a.q.say||a.q.text,{interrupt:true,lang:a.q.lang||'zh-CN',rate:a.hinted ? .72 : 1})).catch(()=>{}).then(()=>{
        if(!current(version,token))return;
        speaking=false;syncMic();
        if(a.q.kind==='poem')status('轮到你啦，念给爸爸妈妈听；念完请家长确认。');
      });
      return prompt;
    }
    async function optionVoice(o,q,version,token,serial){
      await prompt;
      if(!current(version,token)||(serial!==undefined&&serial!==focusSerial))return;
      if(q.focusVoicePolicy==='silent')return;
      await Promise.resolve(audio.say(o.voice||o.say||o.label||String(o.n??''),{interrupt:true,lang:o.lang||q.lang||'zh-CN'})).catch(()=>{});
    }
    function choices(a,version){
      const q=a.q,token=a.token;
      showPanel(`<section class="adventure-quiz" aria-labelledby="quizTitle"><h2 id="quizTitle">${esc(q.text)}</h2>${a.review?`<div id="reviewProgress" class="review-progress" aria-label="复习完成 ${state.review}/3">${[0,1,2].map(i=>`<span class="${i<state.review?'on':''}">${i<state.review?'✓':'○'}</span>`).join('')}</div>`:''}<div id="question-art" class="quiz-art">${art(q)}</div><div class="answers quiz-answers">${q.options.map((o,i)=>`<button class="answer" data-answer="${i}" aria-label="${esc(o.label||o.n)}">${option(o,q)}</button>`).join('')}</div><p id="choiceStatus" class="choice-status" role="status" aria-live="polite">${a.review?'再想一想，选一个答案':'听清题目，再选答案'}</p>${footer(a)}</section>`,'quiz');
      bindCommon();
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
    function parentConfirm(){
      const a=journey.question;if(!a||a.q.kind!=='poem')return;const token=a.token;cancel();
      showPanel(`<h2>请爸爸妈妈听一听</h2><div class="poem-heading"><h3>${esc(a.q.title)}</h3><span>${esc(a.q.author)}</span></div>${poemBody(a.q)}<p>孩子念完${a.q.wholePoem?'整首诗':'这一句'}后，由在旁边的家长确认。</p><div class="panel-actions"><button class="wood-button quiet-button" id="parentRetry">再听再念一次</button><button class="wood-button" id="parentPass">家长确认 · ${a.q.wholePoem?'整首':'这句'}通过</button></div><button class="wood-button quiet-button" id="cancelParent">返回</button>`,'parent-confirm');
      $('panel').scrollTop=0;$('cancelParent').onclick=draw;$('parentRetry').onclick=draw;
      let submitted=false;$('parentPass').onclick=()=>{if(submitted||journey.question?.token!==token)return;submitted=true;const result=journey.confirmPoemByParent(token,true);persist();if(result.q)finishAnswer(result,-1);};
    }
    function poetry(a,version){
      const q=a.q;
      showPanel(`<section class="adventure-quiz poem-quiz" aria-labelledby="quizTitle"><div class="poem-heading"><h2 id="quizTitle">${esc(q.title||'一起念古诗')}</h2><span>${esc(q.author)}</span></div>${poemBody(q)}<p id="poemStatus" role="status" aria-live="polite">听完整首示范，念给爸爸妈妈听。</p><div class="poem-record-actions"><button class="wood-button" id="parentReading">念完了 · 请家长确认</button></div>${footer(a)}</section>`,'quiz');
      $('panel').scrollTop=0;bindCommon();$('parentReading').onclick=parentConfirm;repeat();
    }
    function draw(){cancel();const a=journey.question;if(!a)return;const version=epoch;a.q.kind==='poem'?poetry(a,version):choices(a,version);}
    return {draw,cancel,repeat};
  };
})(window);
