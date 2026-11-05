(function(root){
  'use strict';
  // All paths and measured anchors are shipped content, never supplied by a save.
  root.AdventureCharacters=Object.freeze({
    rabbit:{name:'小兔',preview:'assets/rabbit-walk.png',assets:[],walk:'rabbit',actions:'actions',generic:'generic',roll:'rabbit-roll',catch:'rabbit-catch',front:'rabbit-catch-front',bakedLantern:true},
    kitten:{name:'小猫',preview:'assets/characters/kitten/walk.png',assets:['walk','actions','roll','catch','front'].map(n=>'characters/kitten/'+n),walk:'characters/kitten/walk',actions:'characters/kitten/actions',generic:'characters/kitten/actions',roll:'characters/kitten/roll',catch:'characters/kitten/catch',front:'characters/kitten/front',anchors:root.AdventureKittenAnchors,bakedLantern:false},
    puppy:{name:'小狗',preview:'assets/characters/puppy/walk.png',assets:['walk','actions','roll','catch','front'].map(n=>'characters/puppy/'+n),walk:'characters/puppy/walk',actions:'characters/puppy/actions',generic:'characters/puppy/actions',roll:'characters/puppy/roll',catch:'characters/puppy/catch',front:'characters/puppy/front',anchors:root.AdventurePuppyAnchors,bakedLantern:false}
  });
})(window);
