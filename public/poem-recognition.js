/* Text recognition agreement, not a pronunciation score.
   Exceptions are whole, reviewed ASR outputs scoped to one expected line.
   Never apply a general homophone/fuzzy/edit-distance pass to children's speech. */
(function(root){
  'use strict';
  const normalize=s=>String(s??'').normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'');
  const reviewed=Object.freeze({'小娃撑小艇':Object.freeze(['小娃称小艇'])});
  root.AdventurePoemMatch=(recognized,expected)=>{
    const text=normalize(recognized),target=normalize(expected);
    if(!target)return{matched:false,match:'uncertain'};
    if(text===target)return{matched:true,match:'exact'};
    if(Object.hasOwn(reviewed,target)&&reviewed[target].includes(text))return{matched:true,match:'reviewed-asr-variant'};
    return{matched:false,match:'uncertain'};
  };
})(typeof self==='object'?self:globalThis);
