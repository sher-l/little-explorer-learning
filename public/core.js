(function(root){
  'use strict';
  const REGIONS=['forest','castle','beach','valley','sea'];
  const array=value=>Array.isArray(value)?value:[];
  const unique=values=>[...new Set(values)];
  const integer=(value,min,max,fallback=min)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Math.floor(Number(value)))):fallback;
  const copy=value=>JSON.parse(JSON.stringify(value));
  const regionOf=item=>REGIONS.includes(item?.region)?item.region:REGIONS[Math.floor(Number(item?.id)/15)]||'forest';
  const stageOf=item=>Number.isInteger(item?.stage)?item.stage:Math.floor((Number(item?.id)%15)/5);
  const fresh=()=>({version:4,character:'rabbit',celebrated:false,nature:{},replays:{},replayRounds:{},recentQuestions:{},skillRecords:{},activeRegion:'forest',regions:Object.fromEntries(REGIONS.map(id=>[id,{segments:0,bag:[],used:[],assignments:{},energy:1,review:0,reviewCursor:0}])),collected:[],learned:[],learnedSnapshots:{},poemRead:[],parentRead:[],selfRead:[],poemHinted:[],unverifiedPoems:[],lastQuestion:{},volume:0.7});

  // Only data fields needed to present a studied question survive a bank upgrade.
  function cleanQuestion(raw){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!raw.id||raw.id.length>160||['__proto__','prototype','constructor'].includes(raw.id))return null;
    const q={id:raw.id,region:REGIONS.includes(raw.region)?raw.region:'forest',level:integer(raw.level,0,3),kind:typeof raw.kind==='string'?raw.kind.slice(0,40):'count'};
    for(const key of ['text','say','lang','promptGlyph','glyph','title','author','hint','explanation','poemId','expectedText','expected_text','shape','objective','comparison','operation','missing','focusVoicePolicy','teachingPicture','baseId','skillId'])if(typeof raw[key]==='string')q[key]=raw[key].slice(0,1200);
    if(q.skillId&&(!/^[a-zA-Z0-9_.-]{1,100}$/.test(q.skillId)||['__proto__','prototype','constructor'].includes(q.skillId)))delete q.skillId;
    // Reading recognition must not turn into listening/matching, including old review snapshots.
    if(q.region==='castle'&&q.kind==='character')q.focusVoicePolicy='silent';
    if(q.region==='castle'&&q.id.startsWith('chinese.easy.')){q.text='慢慢看，这个字表示哪一样？';q.say='看看这个字，选出它表示的东西。';}
    if(q.region==='castle'&&q.id?.startsWith('zh.object.'))q.text=q.say=q.id.endsWith('.0')?'看一看，选出它名称中的一个字。':'看一看，选出它的名称。';
    for(const key of ['n','m','icon','lineIndex','missingIndex','start','step','answer'])if(Number.isFinite(raw[key]))q[key]=raw[key];
    if(typeof raw.icon==='string')q.icon=raw.icon.slice(0,100);
    if(Array.isArray(raw.itemTopics))q.itemTopics=raw.itemTopics.filter(n=>Number.isInteger(n)&&n>=0&&n<15);
    if(Array.isArray(raw.sequence))q.sequence=raw.sequence.slice(0,30).filter(v=>typeof v==='string'||Number.isFinite(v));
    for(const key of ['picture','art','visual']){
      const value=raw[key];
      if(typeof value==='string')q[key]=value.slice(0,100);
      else if(value&&typeof value==='object'&&!Array.isArray(value)){
        q[key]={};for(const k of ['type','kind','picture','icon','itemIcon','glyph','operator','n','m','left','right','result','value','count','missing','scene'])if(typeof value[k]==='string'||Number.isFinite(value[k]))q[key][k]=typeof value[k]==='string'?value[k].slice(0,200):value[k];
        if(Array.isArray(value.values))q[key].values=value.values.slice(0,30).filter(v=>typeof v==='string'||Number.isFinite(v)).map(v=>typeof v==='string'?v.slice(0,200):v);
        if(Array.isArray(value.groups))q[key].groups=value.groups.slice(0,8).filter(group=>group&&typeof group==='object'&&!Array.isArray(group)).map(group=>{
          const safe={};for(const k of ['count','picture','icon','itemIcon','label'])if(typeof group[k]==='string'||Number.isFinite(group[k]))safe[k]=typeof group[k]==='string'?group[k].slice(0,200):group[k];return safe;
        });
      }
    }
    if(q.kind==='poem'){
      if(raw.wholePoem===true&&Array.isArray(raw.poemLines)&&raw.poemLines.every(s=>typeof s==='string')){q.wholePoem=true;q.poemLines=raw.poemLines.slice(0,32).map(s=>s.slice(0,200));}
      const expected=q.expectedText??q.expected_text;
      if(!q.poemId||!Number.isInteger(q.lineIndex)||q.lineIndex<0||typeof expected!=='string'||!expected)return null;
      if(q.expectedText&&q.expected_text&&q.expectedText!==q.expected_text)return null;
      q.region='sea';q.expectedText=expected;q.expected_text=expected;q.text=q.text||expected;return q;
    }
    if(!Array.isArray(raw.options)||raw.options.length<2||raw.options.length>8)return null;
    q.options=raw.options.map((option,index)=>{
      if(!option||typeof option!=='object'||Array.isArray(option))return null;
      const o={id:typeof option.id==='string'&&option.id?option.id.slice(0,160):q.id+'.option'+index,type:typeof option.type==='string'?option.type.slice(0,30):'text'};
      for(const key of ['label','voice','say','text','picture','shape','lang'])if(typeof option[key]==='string')o[key]=option[key].slice(0,300);
      for(const key of ['n','icon'])if(Number.isFinite(option[key]))o[key]=option[key];
      if(typeof option.icon==='string')o.icon=option.icon.slice(0,100);
      return o;
    });
    if(q.options.some(o=>!o)||unique(q.options.map(o=>o.id)).length!==q.options.length)return null;
    const correctId=typeof raw.correctOptionId==='string'?raw.correctOptionId:q.options[raw.correct]?.id;
    const correct=q.options.findIndex(o=>o.id===correctId);if(correct<0)return null;
    q.correctOptionId=correctId;q.correct=correct;return q;
  }

  class Journey {
    constructor(content,saved,options={}){
      this.content=content||{};this.state=fresh();this.question=null;this.lastError=null;this.restoreIssue=null;this.canPersist=true;this.token=0;
      this.random=typeof options.random==='function'?options.random:Math.random;
      this.items=new Map(array(this.content.items).filter(it=>Number.isInteger(it?.id)&&it.id>=0&&it.id<125).map(it=>[it.id,it]));
      const normalize=list=>array(list).map(cleanQuestion).filter(Boolean);
      this.main=normalize(this.content.questions).filter(q=>q.kind!=='poem');
      this.easy=normalize(this.content.easy).filter(q=>q.kind!=='poem');
      this.poems=normalize(this.content.poems).map(q=>({...q,region:'sea'})).filter(q=>q.kind==='poem');
      this.lookup=new Map([...normalize(this.content.legacyQuestions),...this.easy,...this.poems,...this.main].map(q=>[q.id,q]));
      Object.defineProperties(this.state,{
        segments:{get:()=>this.current().segments,set:value=>{this.current().segments=integer(value,0,5);}},
        lamp:{enumerable:false,get:()=>this.current().energy,set:value=>{this.current().energy=value===0?0:1;}},
        review:{enumerable:false,get:()=>this.current().review,set:value=>{this.current().review=integer(value,0,3);}},
        reviewCursor:{enumerable:false,get:()=>this.current().reviewCursor,set:value=>{this.current().reviewCursor=integer(value,0,100000000);}},
        bag:{get:()=>this.current().bag,set:value=>{this.current().bag=array(value);}}
      });
      this.restore(saved);
    }
    current(){return this.state.replays[this.state.activeRegion]||this.state.regions[this.state.activeRegion];}
    isReplaying(region=this.state.activeRegion){return !!this.state.replays[region];}
    bindReplay(region,progress){for(const key of ['energy','review','reviewCursor'])Object.defineProperty(progress,key,{configurable:true,get:()=>this.state.regions[region][key],set:value=>{this.state.regions[region][key]=value;}});return progress;}
    startReplay(region){
      if(!REGIONS.includes(region)||this.question||this.state.regions[region].segments!==5)return false;
      this.state.activeRegion=region;if(this.isReplaying(region))return true;
      this.state.replays[region]=this.bindReplay(region,{segments:0,bag:[],used:[],assignments:{}});return true;
    }
    issue(code){this.restoreIssue=this.restoreIssue||code;this.canPersist=false;}
    restore(saved){
      let s=saved;if(s===undefined||s===null)return;
      if(typeof s==='string'){try{s=JSON.parse(s);}catch{this.issue('INVALID_SAVE_JSON');return;}}
      if(!s||typeof s!=='object'||Array.isArray(s)){this.issue('INVALID_SAVE_SHAPE');return;}
      if(![1,2,3,4].includes(s.version)){this.issue('UNSUPPORTED_SAVE_VERSION');return;}
      for(const key of ['collected','learned','parentRead','selfRead','poemRead','poemHinted','unverifiedPoems'])if(key in s&&!Array.isArray(s[key]))this.issue('INVALID_SAVE_ARRAY');
      this.state.character=['rabbit','kitten','puppy'].includes(s.character)?s.character:'rabbit';
      this.state.activeRegion=REGIONS.includes(s.activeRegion)?s.activeRegion:'forest';
      if(s.version>=2&&s.regions&&(typeof s.regions!=='object'||Array.isArray(s.regions)))this.issue('INVALID_REGION_PROGRESS');
      this.state.collected=unique(array(s.collected).filter(id=>this.items.has(id)));
      for(const region of REGIONS){
        const source=s.version===1?(region==='forest'?s:{}):s.regions?.[region]||{};
        const target=this.state.regions[region];
        if(!source||typeof source!=='object'||Array.isArray(source)){this.issue('INVALID_REGION_PROGRESS');continue;}
        for(const key of ['bag','used'])if(key in source&&!Array.isArray(source[key]))this.issue('INVALID_SAVE_ARRAY');
        target.segments=integer(source.segments,0,5);
        target.bag=target.segments===5?[]:unique(array(source.bag).filter(id=>this.items.has(id)&&regionOf(this.items.get(id))===region&&stageOf(this.items.get(id))===target.segments)).slice(0,5);
        this.state.collected=unique(this.state.collected.concat(target.bag));
        target.energy=s.version>=3?(source.energy===0?0:1):(s.lamp===0?0:1);target.review=s.version>=3&&!target.energy?integer(source.review,0,2):0;target.reviewCursor=s.version>=3?integer(source.reviewCursor,0,100000000):0;
        target.used=unique(array(source.used).filter(id=>this.getQuestion(id)?.region===region).map(id=>this.getQuestion(id).baseId||id));
        if(source.assignments&&typeof source.assignments==='object'&&!Array.isArray(source.assignments)){
          const assigned=new Set();
          for(const [key,id] of Object.entries(source.assignments)){
            const item=this.items.get(Number(key)),q=this.getQuestion(id);
            if(item&&regionOf(item)===region&&stageOf(item)===target.segments&&q?.region===region&&!assigned.has(id)){
              target.assignments[item.id]=id;assigned.add(id);if(!target.used.includes(q.baseId||id))target.used.push(q.baseId||id);
            }
          }
        }
      }
      if(s.nature&&typeof s.nature==='object'&&!Array.isArray(s.nature))for(const [id,record] of Object.entries(s.nature)){if(/^\d+$/.test(id)&&Number(id)<15&&record&&typeof record==='object')this.state.nature[id]={count:integer(record.count,1,9999),regions:unique(array(record.regions).filter(r=>REGIONS.includes(r)||r==='hub'))};}
      this.state.celebrated=s.version>=3&&s.celebrated===true;
      if(s.learnedSnapshots&&typeof s.learnedSnapshots==='object'&&!Array.isArray(s.learnedSnapshots)){
        for(const [id,raw] of Object.entries(s.learnedSnapshots)){
          const q=cleanQuestion(raw);if(q&&q.id===id){
            const match=id.match(/\.item(\d+)$/),item=match&&this.items.get(Number(match[1]));
            this.state.learnedSnapshots[id]=item&&['count','sum','subtract','story','compare','missing'].includes(q.kind)?this.contextualize(q,item):q;
          }
        }
      }
      const requestedLearned=unique(array(s.learned).filter(id=>typeof id==='string'));
      const validLearned=requestedLearned.filter(id=>!!this.getQuestion(id));
      for(const key of ['parentRead','selfRead','poemRead','poemHinted','unverifiedPoems'])this.state[key]=unique(array(s[key]).filter(id=>this.getQuestion(id)?.kind==='poem'));
      // Old saves did not distinguish listening with help from an ASR pass. Preserve
      // their discoveries, but retain those poem records as unverified exposure.
      this.state.unverifiedPoems=unique(this.state.unverifiedPoems.concat(validLearned.filter(id=>this.getQuestion(id).kind==='poem'&&!this.state.poemRead.includes(id)&&!this.state.parentRead.includes(id)&&!this.state.selfRead.includes(id)))).filter(id=>!this.state.poemRead.includes(id)&&!this.state.parentRead.includes(id)&&!this.state.selfRead.includes(id));
      this.state.learned=validLearned.filter(id=>this.getQuestion(id).kind!=='poem'||this.state.poemRead.includes(id)||this.state.parentRead.includes(id)||this.state.selfRead.includes(id));
      // A shared review counter has no per-answer subject log. Only migrate its
      // partial credit when the entire surviving old pool proves one subject.
      if(s.version<3&&s.lamp===0){
        const oldIds=unique(array(s.learned).concat(array(s.unverifiedPoems))),oldQuestions=oldIds.map(id=>this.getQuestion(id));
        const scopes=unique(oldQuestions.filter(Boolean).map(q=>q.region));
        if(oldIds.length&&oldQuestions.every(Boolean)&&scopes.length===1){
          const progress=this.state.regions[scopes[0]];
          progress.review=integer(s.review,0,2);progress.reviewCursor=integer(s.reviewCursor,0,100000000);
        }
      }
      if(!this.state.lamp&&requestedLearned.length&&!validLearned.length)this.issue('MISSING_REVIEW_CONTENT');
      for(const region of REGIONS)if(typeof s.lastQuestion?.[region]==='string')this.state.lastQuestion[region]=s.lastQuestion[region];
      this.state.volume=[0,0.35,0.7,1].includes(s.volume)?s.volume:0.7;
      for(const region of REGIONS){
        this.state.replayRounds[region]=integer(s.replayRounds?.[region],0,99999);
        this.state.recentQuestions[region]=array(s.recentQuestions?.[region]).filter(id=>typeof id==='string'&&id.length<160).slice(-24);
        const p=s.replays?.[region];if(!p||this.state.regions[region].segments!==5)continue;
        const segments=integer(p.segments,0,4),bag=unique(array(p.bag).filter(id=>{const item=this.items.get(id);return item&&regionOf(item)===region&&stageOf(item)===segments;})).slice(0,5),used=unique(array(p.used).filter(id=>this.getQuestion(id)?.region===region)),assignments={};
        for(const[key,id]of Object.entries(p.assignments||{})){const item=this.items.get(Number(key));if(item&&regionOf(item)===region&&stageOf(item)===segments&&this.getQuestion(id)?.region===region)assignments[key]=id;}
        this.state.replays[region]=this.bindReplay(region,{segments,bag,used,assignments});
      }
      if(s.skillRecords&&typeof s.skillRecords==='object')for(const[id,r]of Object.entries(s.skillRecords).slice(0,300)){if(/^[a-zA-Z0-9_.-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)&&r&&typeof r==='object')this.state.skillRecords[id]={attempts:integer(r.attempts,0,1000000),correct:integer(r.correct,0,1000000),helped:integer(r.helped,0,1000000),reviewed:integer(r.reviewed,0,1000000)};}
    }
    getQuestion(id){
      if(Object.hasOwn(this.state.learnedSnapshots,id))return this.state.learnedSnapshots[id];
      if(this.lookup.has(id))return this.lookup.get(id);
      const match=typeof id==='string'&&id.match(/^(.*)\.item(\d+)$/);return match?this.contextualize(this.lookup.get(match[1]),this.items.get(Number(match[2]))):null;
    }
    contextualize(source,item){
      if(!source||!item||source.region!=='forest'||source.kind==='shape')return source;
      const q=copy(source);q.baseId=source.baseId||source.id;q.id=q.baseId+'.item'+item.id;
      const name=item.name,n=q.n,m=q.m,art={picture:'seed',itemIcon:item.icon},unit=item.measure||({松果:'颗',蘑菇:'朵',橡果:'颗',橡树叶:'片',红莓:'串',梨:'个',银杏叶:'片',鸡油菌:'朵',葡萄:'串',苹果:'个',柠檬:'个',枫叶:'片',蓝莓:'堆',青松果:'颗',栗子:'颗'}[name]||'个');
      if(q.kind==='count'){q.text='这里有几'+unit+name+'？选出数字。';q.art={type:'groups',groups:[{count:n,...art}]};}
      else if(['sum','subtract','story'].includes(q.kind)){const add=q.kind==='sum'||q.operation==='sum';q.text='有'+n+unit+name+'，'+(add?'又找到':'拿走')+m+unit+'。'+(add?'一共有':'还剩')+'几'+unit+'？';q.art={type:'equation',...(n<10&&m<10?art:{}),left:n,operator:add?'+':'−',right:m,result:'?'};}
      else if(q.kind==='compare'){q.text='两边分别有'+n+unit+'和'+m+unit+name+'。'+(q.comparison==='difference'?'相差几'+unit+'？':q.comparison==='more'?'较多的一边有几'+unit+'？':'较少的一边有几'+unit+'？');q.art={type:'groups',groups:[{count:n,...art},{count:m,...art}]};}
      else if(q.kind==='missing'){q.text='袋里有'+n+unit+name+'，一共需要'+m+unit+'。还缺几'+unit+'？';q.art={type:'equation',...art,left:n,operator:'+',right:'?',result:m};}
      else if(q.kind==='pattern')q.text=name+'旁有一串数字。'+source.text;
      if(q.kind==='count')q.explanation='一共有'+n+unit+name+'，对应数字'+n+'。';
      else if(['sum','subtract','story'].includes(q.kind)){const add=q.kind==='sum'||q.operation==='sum';q.explanation=n+(add?'加':'减')+m+'等于'+(add?n+m:n-m)+'。';}
      else if(q.kind==='missing')q.explanation=n+'再加'+(m-n)+'，就是'+m+'。';
      else if(q.kind==='compare')q.explanation=q.comparison==='difference'?'相差'+Math.abs(n-m)+unit+'。':(q.comparison==='more'?'较多':'较少')+'的一边是'+(q.comparison==='more'?Math.max(n,m):Math.min(n,m))+unit+'。';
      q.say=q.baseId.startsWith('math.twodigit.')?source.say:q.text;return q;
    }
    selectRegion(region){
      if(!REGIONS.includes(region))return false;
      this.cancelQuestion();this.state.activeRegion=region;this.lastError=null;return true;
    }
    reset(){Object.assign(this.state,fresh());this.cancelQuestion();this.restoreIssue=null;this.lastError=null;this.canPersist=true;return this.state;}
    available(){return [...this.items.values()].filter(it=>regionOf(it)===this.state.activeRegion&&stageOf(it)===this.state.segments&&!this.state.bag.includes(it.id));}
    pick(pool){if(!pool.length)return null;const r=Number(this.random());const index=Math.min(pool.length-1,Math.max(0,Math.floor((Number.isFinite(r)?r:0)*pool.length)));return pool[index];}
    present(question){
      const q=copy(question);if(q.kind==='poem')return q;
      let seed=2166136261;for(const c of String(q.id))seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;for(let i=q.options.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[q.options[i],q.options[j]]=[q.options[j],q.options[i]];}
      q.correct=q.options.findIndex(o=>o.id===q.correctOptionId);return q;
    }
    beginItem(id){
      if(this.question||!this.available().some(it=>it.id===id))return false;
      const progress=this.current(),region=this.state.activeRegion,target=Math.min(3,progress.segments+1),stageIds=this.content.stageQuestionIds?.[region]?.[progress.segments];
      let q=this.getQuestion(progress.assignments[id]);
      // Preserve historical records, but an unanswered retired task must use
      // the current curriculum rather than keep a specialist vocabulary prompt.
      if(q&&(this.content.retiredTaskIds?.includes(q.baseId||q.id)||(stageIds&&!stageIds.includes(q.baseId||q.id))))q=null;
      if(!q){
        const source=region==='sea'?this.poems:this.main;
        const freshPool=source.filter(q=>q.region===region&&(!stageIds||stageIds.includes(q.id))&&!progress.used.includes(q.id));
        const item=this.items.get(id),related=freshPool.filter(q=>(stageIds||q.level===target)&&item.questionTopics?.some(topic=>q.itemTopics?.includes(topic)));
        let pool=related.length?related:stageIds?freshPool:freshPool.filter(q=>q.level===target);
        if(!pool.length)pool=freshPool.filter(q=>q.level<=target);
        // Delivery resets only the five-item assignment pool. Keep using the
        // existing learned history to prefer unseen questions across stages.
        const learnedBases=new Set(this.state.learned.map(id=>{const old=this.getQuestion(id);return old?.baseId||id;}));
        const unseen=pool.filter(q=>!learnedBases.has(q.baseId||q.id));if(unseen.length)pool=unseen;
        else {const recent=this.state.recentQuestions[region]||[],unused=pool.filter(q=>!recent.includes(q.baseId||q.id));if(unused.length)pool=unused;else if(pool.length>1){const oldest=Math.min(...pool.map(q=>recent.lastIndexOf(q.baseId||q.id)));pool=pool.filter(q=>recent.lastIndexOf(q.baseId||q.id)===oldest);}}
        const notLast=pool.filter(q=>q.id!==this.state.lastQuestion[region]);q=this.pick(notLast.length?notLast:pool);
        if(!q){this.lastError='QUESTION_POOL_EXHAUSTED';return false;}
        progress.assignments[id]=q.id;progress.used.push(q.id);
      }
      q=this.contextualize(q,this.items.get(id));progress.assignments[id]=q.id;this.state.lastQuestion[region]=q.baseId||q.id;this.lastError=null;
      this.question={item:id,region,q:this.present(q),wrong:0,review:false,hinted:this.state.poemHinted.includes(q.id),token:++this.token};return true;
    }
    beginReview(region=this.state.activeRegion){
      if(!REGIONS.includes(region)||this.question)return false;this.state.activeRegion=region;
      if(this.question||this.state.lamp===1)return false;
      const available=this.reviewQuestions();if(!available.length){this.lastError='NO_LEARNED_QUESTIONS';return false;}
      const q=available[this.state.reviewCursor%available.length];
      this.question={item:null,region:q.region,q:this.present(q),wrong:0,review:true,token:++this.token};this.lastError=null;return true;
    }
    lowerQuestion(active){
      const source=active.review?this.reviewQuestions():this.main.concat(this.easy);
      let lower=source.filter(q=>q.kind!=='poem'&&q.region===active.region&&q.level<active.q.level);
      if(!active.review){const item=this.items.get(active.item);lower=lower.filter(q=>!this.current().used.includes(q.baseId||q.id));if(item.questionTopics){const related=lower.filter(q=>item.questionTopics.some(t=>q.itemTopics?.includes(t)));if(related.length)lower=related;}}
      if(lower.length){const closest=Math.max(...lower.map(q=>q.level));return this.pick(lower.filter(q=>q.level===closest));}
      return null;
    }
    switchToEasier(){
      const active=this.question;if(!active)return {type:'idle'};
      let q;
      if(active.q.kind==='poem'){
        const source=active.review?this.reviewQuestions():this.poems;
        let pool=source.filter(q=>q.kind==='poem'&&q.id!==active.q.id&&q.level<=active.q.level&&(q.level<active.q.level||q.expectedText.length<active.q.expectedText.length));
        if(!active.review)pool=pool.filter(q=>!this.state.regions[active.region].used.includes(q.id));
        if(pool.length){const level=Math.max(...pool.map(q=>q.level));q=this.pick(pool.filter(q=>q.level===level));}
      }else q=this.lowerQuestion(active);
      active.wrong=0;if(!q)return {type:'retry'};
      q=active.review?q:this.contextualize(q,this.items.get(active.item));active.q=this.present(q);active.token=++this.token;
      if(!active.review){const progress=this.current();progress.assignments[active.item]=q.id;progress.used.push(q.baseId||q.id);this.state.lastQuestion[active.region]=q.baseId||q.id;}
      return {type:'easier'};
    }
    retryPoem(response,token){
      const active=this.question;if(!active)return {type:'idle'};
      if(token!==undefined&&token!==active.token)return {type:'stale'};
      if(active.q.kind!=='poem')return {type:'unavailable'};
      const code=typeof response==='string'?response:response?.ok===true?response.code:null;
      if(code==='quiet')return {type:'retry'};
      if(!['close','wrong'].includes(code))return {type:'unavailable'};
      active.wrong++;return active.wrong>=2?this.switchToEasier():{type:'retry'};
    }
    answer(index,token){
      const active=this.question;if(!active)return {type:'idle'};
      if(token!==undefined&&token!==active.token)return {type:'stale'};
      if(active.q.kind==='poem')return {type:'unavailable'};
      if(!Number.isInteger(index)||index<0||index>=active.q.options.length)return {type:'unavailable'};
      this.trackSkill(active.q,index===active.q.correct,false,active.review);
      if(index!==active.q.correct){
        active.wrong++;
        if(active.wrong>=2)return this.switchToEasier();
        return {type:'retry'};
      }
      return this.complete(false);
    }
    completePoem(response,token){
      const active=this.question;if(!active)return {type:'idle'};
      if(token!==undefined&&token!==active.token)return {type:'stale'};
      if(active.q.kind!=='poem'||response?.ok!==true||response.code!=='ok')return {type:'unavailable'};
      if(!this.state.poemRead.includes(active.q.id))this.state.poemRead.push(active.q.id);
      this.state.unverifiedPoems=this.state.unverifiedPoems.filter(id=>id!==active.q.id);
      return this.complete(false);
    }
    confirmPoemBySelf(token){
      const active=this.question;if(!active||active.token!==token)return {type:'stale'};
      if(active.q.kind!=='poem')return {type:'unavailable'};
      if(!this.state.selfRead.includes(active.q.id))this.state.selfRead.push(active.q.id);
      this.state.unverifiedPoems=this.state.unverifiedPoems.filter(id=>id!==active.q.id);
      return this.complete(false);
    }
    confirmPoemByParent(token,confirmed){
      const active=this.question;if(!active||active.token!==token)return {type:'stale'};
      if(active.q.kind!=='poem'||confirmed!==true)return {type:'unavailable'};
      if(!this.state.parentRead.includes(active.q.id))this.state.parentRead.push(active.q.id);
      this.state.unverifiedPoems=this.state.unverifiedPoems.filter(id=>id!==active.q.id);
      return this.complete(false);
    }
    lamp(){
      if(!this.question||this.question.review||!this.state.lamp)return {type:'unavailable'};
      this.state.lamp=0;
      if(this.question.q.kind==='poem'){
        this.question.hinted=true;const id=this.question.q.id;
        if(!this.state.poemHinted.includes(id))this.state.poemHinted.push(id);
        return {type:'poem_hint',q:this.question.q};
      }
      return this.complete(true);
    }
    trackSkill(q,correct,helped,review){const id=q.skillId||q.region+'.'+q.kind,r=this.state.skillRecords[id]||(this.state.skillRecords[id]={attempts:0,correct:0,helped:0,reviewed:0});r.attempts++;if(correct)r.correct++;if(helped)r.helped++;if(review)r.reviewed++;}
    complete(helped){
      const active=this.question;if(!active)return {type:'idle'};
      if(active.q.kind==='poem'&&helped)return {type:'unavailable'};
      if(!this.state.learned.includes(active.q.id))this.state.learned.push(active.q.id);
      this.state.learnedSnapshots[active.q.id]=cleanQuestion(active.q);
      if(helped||active.q.kind==='poem')this.trackSkill(active.q,!helped&&!this.state.selfRead.includes(active.q.id),helped,active.review);
      const base=active.q.baseId||active.q.id,recent=this.state.recentQuestions[active.region]||[];this.state.recentQuestions[active.region]=recent.filter(id=>id!==base).concat(base).slice(-24);
      this.question=null;
      if(active.review){
        this.state.review++;this.state.reviewCursor++;
        if(this.state.review>=3){this.state.review=0;this.state.lamp=1;return {type:'charged',q:active.q,helped:false};}
        return {type:'reviewed',remaining:3-this.state.review,q:active.q,helped:false};
      }
      const progress=this.current();
      if(!this.state.collected.includes(active.item))this.state.collected.push(active.item);
      if(!progress.bag.includes(active.item))progress.bag.push(active.item);
      return {type:'collected',item:this.items.get(active.item),helped:!!helped,q:active.q,full:progress.bag.length===5};
    }
    recordCatch(species,region){
      if(!Number.isInteger(species)||species<0||species>=15||!REGIONS.concat('hub').includes(region)||this.question)return false;
      const old=this.state.nature[species];this.state.nature[species]={count:Math.min(9999,(old?.count||0)+1),regions:unique((old?.regions||[]).concat(region))};return {first:!old,count:this.state.nature[species].count};
    }
    deliver(){
      if(this.question||this.state.segments>=5||this.state.bag.length!==5)return false;
      const progress=this.current();progress.segments++;progress.bag=[];progress.used=[];progress.assignments={};
      if(this.isReplaying()&&progress.segments===5){const id=this.state.activeRegion;this.state.replayRounds[id]=(this.state.replayRounds[id]||0)+1;delete this.state.replays[id];}return true;
    }
    allComplete(){return REGIONS.every(id=>this.state.regions[id].segments===5);}
    reviewQuestions(region=this.state.activeRegion){
      const seen=new Set();return unique(this.state.learned.concat(this.state.unverifiedPoems)).map(id=>this.getQuestion(id)).filter(q=>q&&q.region===region&&!this.content.retiredReviewIds?.includes(q.baseId||q.id)).map(q=>q.kind==='poem'&&!q.wholePoem?(this.poems.find(p=>p.wholePoem&&p.poemId===q.poemId)||q):q).filter(q=>{if(seen.has(q.id))return false;seen.add(q.id);return true;});
    }
    cancelQuestion(){this.question=null;this.token++;}
    snapshot(){return copy(this.state);}
  }
  root.ForestJourney=Journey;root.AdventureJourney=Journey;
  if(typeof module!=='undefined')module.exports={Journey,fresh,REGIONS,cleanQuestion};
})(typeof window!=='undefined'?window:globalThis);
