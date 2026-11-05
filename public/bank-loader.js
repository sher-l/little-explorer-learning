(function(root){
  'use strict';
  const VERSION=2;
  const regionIds=['forest','castle','beach','valley','sea'];
  const choiceKinds=new Set(['count','sum','subtract','compare','pattern','missing','story','shape','character','listen','knowledge','picture']);
  const optionTypes=new Set(['number','shape','picture','text']);
  const artTypes=new Set(['equation','groups','sequence','picture','glyph']);
  const stableId=s=>typeof s==='string'&&/^[a-zA-Z0-9_.-]+$/.test(s)&&s.length<=100;
  const plain=s=>typeof s==='string'&&s.trim().length>0&&s.length<=600&&!/[<>]/.test(s);
  const number=n=>typeof n==='number'&&Number.isFinite(n);
  function validate(bank){
    const errors=[];const fail=(path,message)=>errors.push(path+': '+message);
    if(!bank||typeof bank!=='object'||Array.isArray(bank))return {ok:false,errors:['bank: 应为对象']};
    if(![1,VERSION].includes(bank.schemaVersion))fail('schemaVersion','只支持版本 '+VERSION);
    if(!stableId(bank.bankId))fail('bankId','缺少稳定 ID');
    const array=key=>{if(!Array.isArray(bank[key])){fail(key,'应为数组');return [];}return bank[key];};
    const regions=array('regions'),items=array('items'),questions=array('questions'),easy=array('easy'),poems=array('poems'),legacy=bank.legacyQuestions===undefined?[]:array('legacyQuestions');
    const pictures=array('pictureIds');const pictureSet=new Set(pictures);
    if(bank.retiredReviewIds!==undefined&&(!Array.isArray(bank.retiredReviewIds)||bank.retiredReviewIds.some(id=>!stableId(id))))fail('retiredReviewIds','应为稳定题目 ID 数组');
    if(bank.retiredTaskIds!==undefined&&(!Array.isArray(bank.retiredTaskIds)||bank.retiredTaskIds.some(id=>!stableId(id))))fail('retiredTaskIds','应为稳定题目 ID 数组');
    if(pictureSet.size!==pictures.length)fail('pictureIds','素材 ID 重复');
    pictures.forEach((p,i)=>{if(!stableId(p))fail('pictureIds['+i+']','非法素材 ID');});
    if(regions.length!==5||new Set(regions.map(r=>r?.id)).size!==5||regionIds.some(id=>!regions.some(r=>r?.id===id)))fail('regions','必须包含五个不同区域');
    regions.forEach((r,i)=>{if(!r||!regionIds.includes(r.id)||!plain(r.name)||!plain(r.subject)||!stableId(r.atlasName))fail('regions['+i+']','区域元信息不完整');});
    const capacity=bank.schemaVersion===1?75:125;if(items.length!==capacity)fail('items','任务结构需要 125 个收集条目');
    const seenItems=new Set();items.forEach((it,i)=>{
      const p='items['+i+']';if(!it||typeof it!=='object'){fail(p,'应为对象');return;}
      if(!Number.isInteger(it.id)||it.id<0||it.id>=capacity||seenItems.has(it.id))fail(p+'.id','必须是互不重复的 0..124');seenItems.add(it.id);
      const added=it.id>=75,expected=regionIds[added?Math.floor((it.id-75)/10):Math.floor(it.id/15)],stage=added?3+Math.floor(((it.id-75)%10)/5):Math.floor((it.id%15)/5);
      if(it.region!==expected||it.stage!==stage||!Number.isInteger(it.icon)||it.icon<0||it.icon>14)fail(p,'region/stage/icon 与稳定收集编号不符');
      if(!plain(it.name)||!plain(it.desc))fail(p,'名称及说明必须是纯文本');
      if(it.measure!==undefined&&(!plain(it.measure)||it.measure.length>4))fail(p+'.measure','量词应为 1..4 字的纯文本');
      if(it.questionTopics!==undefined&&(!Array.isArray(it.questionTopics)||it.questionTopics.some(n=>!Number.isInteger(n)||n<0||n>14)))fail(p+'.questionTopics','应为 0..14 的物品主题索引数组');
    });
    const allIds=new Set();
    function art(a,path){
      if(!a||!artTypes.has(a.type)){fail(path,'未知题面素材类型');return;}
      if(a.picture!==undefined&&!pictureSet.has(a.picture))fail(path+'.picture','未注册的素材 '+a.picture);
      if(a.itemIcon!==undefined&&(!Number.isInteger(a.itemIcon)||a.itemIcon<0||a.itemIcon>14))fail(path+'.itemIcon','森林收集图索引应为 0..14');
      if(a.type==='glyph'&&!plain(a.value))fail(path+'.value','应为纯文本');
      if(a.type==='picture'&&!pictureSet.has(a.picture))fail(path+'.picture','缺少图片引用');
      if(a.type==='sequence'&&(!Array.isArray(a.values)||a.values.length<2||a.values.some(v=>!number(v)&&!plain(v))))fail(path+'.values','规律序列无效');
      if(a.type==='groups'){
        if(!Array.isArray(a.groups)||!a.groups.length)fail(path+'.groups','缺少数量组');
        else a.groups.forEach((g,i)=>{if(!g||!Number.isInteger(g.count)||g.count<0||g.count>20||!pictureSet.has(g.picture))fail(path+'.groups['+i+']','数量或图片引用无效');if(g?.itemIcon!==undefined&&(!Number.isInteger(g.itemIcon)||g.itemIcon<0||g.itemIcon>14))fail(path+'.groups['+i+'].itemIcon','森林收集图索引应为 0..14');});
      }
      if(a.type==='equation'){
        if(!['+','−','-','×','÷'].includes(a.operator))fail(path+'.operator','未知运算符');
        for(const key of ['left','right','result'])if(!number(a[key])&&a[key]!=='?')fail(path+'.'+key,'应为数值或问号');
      }
    }
    function common(q,path){
      if(!q||typeof q!=='object'){fail(path,'应为对象');return false;}
      if(!stableId(q.id)||allIds.has(q.id))fail(path+'.id','无效或重复的稳定 ID');allIds.add(q.id);
      if(!regionIds.includes(q.region))fail(path+'.region','未知学科区域');
      if(q.skillId!==undefined&&(!stableId(q.skillId)||['__proto__','constructor','prototype'].includes(q.skillId)))fail(path+'.skillId','技能 ID 无效');
      if(!plain(q.text)||!plain(q.say)||!plain(q.objective))fail(path,'题干、语音和学习目标必须是纯文本');
      if(!['zh-CN','en-US'].includes(q.lang))fail(path+'.lang','当前支持 zh-CN / en-US');
      if(q.lang==='en-US'&&/[\u3400-\u9fff]/.test(q.say))fail(path+'.say','英文题语音不能混入汉字');
      if(!Number.isInteger(q.level)||q.level<0||q.level>3)fail(path+'.level','难度应为 0..3');
      if(q.itemTopics!==undefined&&(!Array.isArray(q.itemTopics)||q.itemTopics.some(n=>!Number.isInteger(n)||n<0||n>14)))fail(path+'.itemTopics','应为 0..14 的物品主题索引数组');
      art(q.art,path+'.art');return true;
    }
    function choice(q,path,mode){
      if(!common(q,path))return;
      if(q.region==='sea'||!choiceKinds.has(q.kind))fail(path+'.kind','非选择题类型或区域');
      if(mode==='main'&&q.level<1)fail(path+'.level','主池难度为 1..3');
      if(mode==='easy'&&q.level!==0)fail(path+'.level','降难度示范池应为 0');
      if(mode==='legacy'&&!q.reviewOnly)fail(path+'.reviewOnly','旧题必须标记只供复习');
      if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6){fail(path+'.options','需要 2..6 个选项');return;}
      const ids=new Set(),values=new Set();q.options.forEach((o,i)=>{
        const p=path+'.options['+i+']';if(!o||!optionTypes.has(o.type)){fail(p,'未知选项类型');return;}
        if(!stableId(o.id)||ids.has(o.id))fail(p+'.id','缺少或重复的选项 ID');ids.add(o.id);
        if(!plain(o.label)||!plain(o.voice))fail(p,'选项名称和语音必须是纯文本');
        if(o.type==='number'&&(!Number.isInteger(o.n)||o.n<0||o.n>100))fail(p+'.n','数字选项应为 0..100 整数');
        if(o.type==='picture'&&!pictureSet.has(o.picture))fail(p+'.picture','未注册素材');
        if(o.type==='text'&&!plain(o.text))fail(p+'.text','缺少选项文字');
        if(o.type==='shape'&&!['circle','square','triangle'].includes(o.shape))fail(p+'.shape','未知形状');
        const value=o.type+':'+String(o.type==='number'?o.n:o.type==='picture'?o.picture:o.type==='text'?o.text:o.shape);
        if(values.has(value))fail(p,'不能出现内容相同的重复选项');values.add(value);
      });
      if(!ids.has(q.correctOptionId))fail(path+'.correctOptionId','正确选项 ID 不存在');
      if(q.teachingPicture!==undefined&&!pictureSet.has(q.teachingPicture))fail(path+'.teachingPicture','未注册教学素材');
      if(q.region==='forest'&&mode==='main'){
        const expected=q.kind==='count'?q.n:q.kind==='sum'?q.n+q.m:q.kind==='subtract'?q.n-q.m:q.kind==='missing'?q.m-q.n:q.kind==='story'?(q.operation==='sum'?q.n+q.m:q.n-q.m):q.kind==='compare'?(q.comparison==='difference'?Math.abs(q.n-q.m):q.comparison==='more'?Math.max(q.n,q.m):Math.min(q.n,q.m)):undefined;
        const correct=q.options.find(o=>o?.id===q.correctOptionId);
        if(expected!==undefined&&correct?.n!==expected)fail(path+'.correctOptionId','与数学计算结果不一致');
        if(q.options.some(o=>o?.type!=='number'))fail(path+'.options','当前数学主池以数字作答，不能重复题面数量图');
      }
    }
    questions.forEach((q,i)=>choice(q,'questions['+i+']','main'));
    easy.forEach((q,i)=>choice(q,'easy['+i+']','easy'));
    legacy.forEach((q,i)=>choice(q,'legacyQuestions['+i+']','legacy'));
    poems.forEach((q,i)=>{
      const p='poems['+i+']';if(!common(q,p))return;
      if(q.region!=='sea'||q.kind!=='poem'||q.level<1)fail(p,'诗句必须为 sea/poem/难度 1..3');
      if(!stableId(q.poemId)||!Number.isInteger(q.lineIndex)||q.lineIndex<0)fail(p,'诗 ID 或零基行号无效');
      if(!plain(q.expectedText)||q.expected_text!==q.expectedText||q.text!==q.expectedText||q.say!==q.expectedText)fail(p+'.expectedText','诗句原文和协议字段必须完全相同');
      if(!plain(q.title)||!plain(q.author))fail(p,'诗题和作者缺失');
    });
    for(const region of regionIds){for(let level=1;level<=3;level++){
      const pool=region==='sea'?poems:questions;
      if(pool.filter(q=>q?.region===region&&q?.level===level).length<5)fail(region+'.level'+level,'每级至少五道，保证一轮不重复');
    }}
    if(bank.stageQuestionIds!==undefined){
      for(const region of regionIds){const stages=bank.stageQuestionIds?.[region],source=region==='sea'?poems:questions;
        if(!Array.isArray(stages)||stages.length!==5){fail('stageQuestionIds.'+region,'需要五关题池');continue;}
        stages.forEach((ids,i)=>{if(!Array.isArray(ids)||new Set(ids).size<5||new Set(ids).size!==ids.length||ids.some(id=>!source.some(q=>q.id===id&&q.region===region)))fail('stageQuestionIds.'+region+'.'+i,'每关至少五个不同、同区域的现有题目');});
        if(!Array.isArray(bank.stageObjectives?.[region])||bank.stageObjectives[region].length!==5||bank.stageObjectives[region].some(x=>!plain(x)))fail('stageObjectives.'+region,'需要五关学习目标');
      }
    }
    return {ok:errors.length===0,errors};
  }
  function stats(bank){return {schemaVersion:bank.schemaVersion,bankId:bank.bankId,revision:bank.revision,regions:Object.fromEntries(regionIds.map(region=>[region,{main:(region==='sea'?bank.poems:bank.questions).filter(q=>q.region===region).length,byLevel:[1,2,3].map(level=>(region==='sea'?bank.poems:bank.questions).filter(q=>q.region===region&&q.level===level).length),easy:bank.easy.filter(q=>q.region===region).length}])),collectibles:bank.items.length,legacyReviewOnly:(bank.legacyQuestions||[]).length};}
  function load(input){
    const bank=typeof input==='string'?JSON.parse(input):input,result=validate(bank);
    if(!result.ok){const error=new Error('题库校验未通过：\n'+result.errors.join('\n'));error.validationErrors=result.errors;throw error;}
    const normalized=JSON.parse(JSON.stringify(bank));
    if(normalized.schemaVersion===1){
      for(let r=0;r<5;r++)for(let n=0;n<10;n++)normalized.items.push({...normalized.items[r*15+n],id:75+r*10+n,stage:3+Math.floor(n/5)});
      normalized.schemaVersion=2;normalized.stagesPerRegion=5;
    }
    for(const q of normalized.questions.concat(normalized.easy,normalized.legacyQuestions||[]))q.correct=q.options.findIndex(o=>o.id===q.correctOptionId);
    return normalized;
  }
  const api={schemaVersion:VERSION,validate,load,normalize:load,stats};root.AdventureBank=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
