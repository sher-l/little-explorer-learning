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
    function footer(a){return `<div class="panel-actions quiz-actions"><button class="wood-button quiet-button" id="repeatQ">♫ 再听一次</button><button class="wood-button ${state.lamp?'':'is-dim'}" id="helpQ" ${a.review?'disabled':''}>${state.lamp?'请伙伴帮忙':'道具需要恢复'}</button><button class="wood-button quiet-button" id="leaveQ">先收起来</button></div><p class="quiz-caption">${a.review?`复习旧题 · ${esc(state.review)}/3`:a.q.kind==='poem'?'听一句，跟着念一句':'听清题目，再选答案'}</p>`;}
    function bindCommon(){
      $('repeatQ').onclick=()=>repeat();
      $('helpQ').onclick=()=>help();
      $('leaveQ').onclick=()=>{cancel();journey.cancelQuestion();persist();closePanel();onLeave?.();};
    }
    function status(text){if($('poemStatus'))$('poemStatus').textContent=text;}
    function syncMic(){
      const mic=$('poemMic');if(!mic)return;
      const recording=session?.state==='recording';
      mic.disabled=!recording&&(speaking||busy||!session?.ready);
      mic.textContent=recording?'■ 我念完了':'● 开始跟读';
      mic.classList.toggle('is-recording',recording);
      if($('repeatQ'))$('repeatQ').disabled=busy||recording||session?.state==='requesting';
      if($('helpQ'))$('helpQ').disabled=journey.question?.review||busy||recording;
      if($('parentReading'))$('parentReading').disabled=busy||recording;
      if($('voiceCheck'))$('voiceCheck').disabled=busy||recording||session?.state==='requesting';
    }
    function repeat(){
      const a=journey.question;if(!a)return Promise.resolve();
      if(busy)return Promise.resolve();
      if(a.q.kind==='poem'&&(busy||session?.state==='recording'||session?.state==='requesting'))return Promise.resolve();
      const version=epoch,token=a.token;
      focusSerial++;speaking=true;syncMic();
      if(a.q.kind==='poem')status(a.hinted?'小水母慢慢念，听完你再试一遍。':'先听这一句，听完再开始。');
      prompt=Promise.resolve(audio.say(a.q.say||a.q.text,{interrupt:true,lang:a.q.lang||'zh-CN',rate:a.hinted ? .72 : 1})).catch(()=>{}).then(()=>{
        if(!current(version,token))return;
        speaking=false;syncMic();
        if(a.q.kind==='poem')status(session?.ready?'轮到你啦，按“开始跟读”。':session?.base===null?'听完示范，可以请家长确认跟读。':'语音还没准备好，可以请家长检查服务。');
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
      repeat();
    }
    function parentGate(){
      const a=journey.question;if(!a||a.q.kind!=='poem')return;const token=a.token;cancel();
      const multiply=Math.random()<.5,one=2+Math.floor(Math.random()*8),two=multiply?12+Math.floor(Math.random()*78):one*(Math.ceil(10/one)+Math.floor(Math.random()*(Math.floor(99/one)-Math.ceil(10/one)+1))),answer=multiply?two*one:two/one;
      showPanel(`<section class="parent-gate"><h2>家长陪读</h2><p>没有麦克风也可以：请听孩子念完，再确认。</p><p class="poem-line">${esc(a.q.expectedText)}</p><label for="parentAnswer">${two} ${multiply?'×':'÷'} ${one} = ?</label><input id="parentAnswer" type="text" inputmode="numeric" autocomplete="off" maxlength="3" aria-label="乘除法答案"><div class="parent-keypad">${[1,2,3,4,5,6,7,8,9,'删除',0,'清空'].map(n=>`<button class="wood-button quiet-button" data-digit="${n}">${n}</button>`).join('')}</div><p id="gateError" class="gate-error" role="status"></p><button class="wood-button" id="unlockParent">下一步</button><button class="wood-button quiet-button" id="cancelParent">取消</button></section>`,'parent-gate');
      $('cancelParent').onclick=draw;
      $('panel').querySelectorAll('[data-digit]').forEach(b=>b.onclick=()=>{const input=$('parentAnswer'),n=b.dataset.digit;input.value=n==='删除'?input.value.slice(0,-1):n==='清空'?'':(input.value+n).slice(0,3);});
      $('parentAnswer').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();$('unlockParent').click();}};
      $('unlockParent').onclick=()=>{
        const value=$('parentAnswer').value.trim();if(!/^\d+$/.test(value)||Number(value)!==answer){$('gateError').textContent='答案还不对，再算一算。';return;}
        if(journey.question?.token!==token)return;showPanel(`<h2>听完这一句了吗？</h2><p class="poem-line">${esc(a.q.expectedText)}</p><p>请根据刚才的实际跟读选择。</p><div class="panel-actions"><button class="wood-button quiet-button" id="parentRetry">再练一次</button><button class="wood-button" id="parentPass">确认这句通过</button></div><button class="wood-button quiet-button" id="cancelParent">取消</button>`,'parent-confirm');
        $('cancelParent').onclick=draw;$('parentRetry').onclick=()=>{draw();notify('我们再听一遍，慢慢念',3);};
        $('parentPass').onclick=()=>{const result=journey.confirmPoemByParent(token,true);persist();if(result.q)finishAnswer(result,-1);};
      };
    }
    function poetry(a,version){
      const q=a.q,token=a.token;
      showPanel(`<section class="adventure-quiz poem-quiz" aria-labelledby="quizTitle"><div class="poem-heading"><h2 id="quizTitle">${esc(q.title||'一起念古诗')}</h2><span>${esc(q.author)}</span></div><div class="poem-line" lang="zh-CN">${esc(q.expectedText||q.expected_text)}</div><p id="poemStatus" role="status" aria-live="polite">先听这一句。</p><div class="poem-meter" aria-label="麦克风音量"><span id="poemLevel"></span></div><div class="poem-record-actions"><button class="wood-button poem-mic" id="poemMic" disabled>● 开始跟读</button><button class="wood-button quiet-button" id="voiceCheck">检查语音</button><button class="wood-button quiet-button" id="parentReading">没有麦克风 · 家长确认</button></div>${footer(a)}</section>`,'quiz');
      bindCommon();$('parentReading').onclick=parentGate;
      if(!root.PoetrySession){status('语音模块没有加载，请家长重新打开本机入口。');$('voiceCheck').disabled=true;repeat();return;}
      const asr=new root.PoetrySession({base:root.AdventureASRBase,onState:(name,detail)=>{
        if(!current(version,token))return;
        if(name==='requesting')status('请家长允许麦克风。');
        if(name==='recording')status('正在听你念，念完按一下。');
        if(name==='submitting')status('小伙伴正在听这一句……');
        if(name==='error')status(detail.message||'这次没听清，可以再试一次。');
        syncMic();
      },onLevel:(level,{seconds})=>{
        if(!current(version,token))return;
        if($('poemLevel'))$('poemLevel').style.width=Math.round(level*100)+'%';
        if($('poemMic')&&asr.state==='recording')$('poemMic').textContent='■ 我念完了 · '+Math.min(8,Math.ceil(seconds))+'秒';
      },onLimit:()=>submit()});
      session=asr;
      async function ready(){
        const result=await asr.checkReady();if(!current(version,token))return;
        if(!speaking)status(result.ready?'轮到你啦，按“开始跟读”。':result.message||'请家长运行“启动完整学习.cmd”，再按检查语音。');
        syncMic();
      }
      async function submit(){
        if(poemSubmit||!current(version,token))return;
        busy=true;syncMic();
        poemSubmit=(async()=>{
          try{
            const result=await asr.stopAndScore({poemId:q.poemId,lineIndex:q.lineIndex,expectedText:q.expectedText||q.expected_text});
            if(!current(version,token))return;
            if(!result.ok){status('这一句暂时没处理好，请家长检查语音服务，再试一次。');return;}
            if(result.code==='ok'){
              const completed=journey.completePoem(result,token);persist();
              if(!['stale','idle','unavailable'].includes(completed.type))finishAnswer(completed,-1);
              return;
            }
            if(result.code==='uncertain'){status('这次没听清，不算答错。可以再念一次，或请家长确认。');return;}
            const retried=journey.retryPoem(result,token);persist();
            if(retried.type==='easier'){notify('我们换一句短一点的，慢慢念。',3);draw();return;}
            if(result.code==='quiet')status('刚才没听到声音。靠近一点，再念一次吧。');
            else{
              notify(result.code==='close'?'快念好啦！再听一遍。':'跟着声音，慢慢念一次。',3);
              busy=false;await repeat();
            }
          }catch(error){if(current(version,token))status(root.PoetrySession.friendlyError(error));}
          finally{if(current(version,token)){busy=false;poemSubmit=null;if($('poemLevel'))$('poemLevel').style.width='0%';syncMic();}}
        })();
        return poemSubmit;
      }
      $('poemMic').onclick=async()=>{
        if(!current(version,token)||speaking||busy)return;
        if(asr.state==='recording'){submit();return;}
        busy=true;syncMic();
        try{await asr.startRecording();}catch(error){if(current(version,token))status(root.PoetrySession.friendlyError(error));}
        finally{if(current(version,token)){busy=false;syncMic();}}
      };
      if(asr.browser)$('voiceCheck').textContent=asr.browser.ready?'检查语音':'准备浏览器语音 · 241 MiB';
      $('voiceCheck').onclick=async()=>{if(!asr.browser||asr.browser.ready){ready();return;}if($('voiceCheck').dataset.loading){asr.browser.cancelLoad();return;}const button=$('voiceCheck');button.dataset.loading='true';button.textContent='取消准备';try{await asr.browser.load(({done,total})=>{if(current(version,token))status('正在准备本地语音 '+Math.round(done/total*100)+'% · 声音不会上传');});if(current(version,token)){button.textContent='检查语音';await ready();}}catch(e){if(current(version,token))status(e.message);}finally{if(current(version,token)){delete button.dataset.loading;if(!asr.browser.ready)button.textContent='准备浏览器语音 · 241 MiB';}}};
      repeat();ready();
    }
    function draw(){cancel();const a=journey.question;if(!a)return;const version=epoch;a.q.kind==='poem'?poetry(a,version):choices(a,version);}
    return {draw,cancel,repeat};
  };
})(window);
