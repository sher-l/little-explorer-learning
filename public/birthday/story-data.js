/**
 * 《林缨祈 KIKI 的5岁生日大冒险》全书数据与 V2 分层精灵动画契约
 *
 * 规范说明：
 * 1. 纯全局脚本挂载 window.KIKI_STORY_DATA，兼容严格 CSP（无 ES module、无 eval）。
 * 2. 所有媒体资源统一使用相对路径 `./assets/...`，同时兼容本地与 GitHub Pages 子路径 `/little-explorer-learning/birthday/`。
 * 3. V2 分层结构：
 *    - Layer 1 背景层：bg-01.webp ~ bg-08.webp（16:9 纯净空场景，自动降级兜底 page-01..08.webp）
 *    - Layer 2 精灵层：./assets/sprites/*.webp 透明 RGBA 精灵，结合 sprites-meta.json 自动对齐宽高比与 P7 蜡烛焰芯
 *    - Layer 3 特效层：Canvas 蝴蝶花瓣、彩虹尾焰、彩带碎纸屑、烛芯白烟、夜空烟花
 */
(function (global) {
  "use strict";

  var DEFAULT_SPRITE_RATIOS = {
    "kiki-idle.webp": 0.47,
    "kiki-cheer.webp": 0.5815,
    "kiki-idle-coat.webp": 0.4719,
    "kiki-cheer-coat.webp": 0.5805,
    "crown-5.webp": 1.2392,
    "jett.webp": 1.2202,
    "dizzy.webp": 0.8699,
    "parcel-closed.webp": 0.9388,
    "parcel-open.webp": 0.7983,
    "bluey.webp": 0.737,
    "bingo.webp": 0.7476,
    "chase.webp": 0.6368,
    "skye.webp": 1.3154,
    "marshall.webp": 0.689,
    "lego-minifig-1.webp": 0.5676,
    "lego-minifig-2.webp": 0.5676,
    "lego-minifig-3.webp": 0.6275,
    "lego-castle.webp": 0.8024,
    "lego-flag-5.webp": 0.6471,
    "cake-5candles.webp": 0.8293
  };

  // 相对于 cake-5candles.webp 自身宽高的 5 根蜡烛芯百分比位置（会被 sprites-meta.json 中的实测 cakeCandleTips 覆盖）
  var DEFAULT_CAKE_CANDLE_TIPS = [
    { id: "candle-1", index: 1, label: "第1根草莓红蜡烛", color: "#FF5E7E", xPct: 32.21, yPct: 0.58 },
    { id: "candle-2", index: 2, label: "第2根柠檬黄蜡烛", color: "#FFBE0B", xPct: 41.18, yPct: 0.58 },
    { id: "candle-3", index: 3, label: "第3根天空蓝蜡烛", color: "#3A86FF", xPct: 50.28, yPct: 0.58 },
    { id: "candle-4", index: 4, label: "第4根蜜桃橙蜡烛", color: "#FB5607", xPct: 59.31, yPct: 0.93 },
    { id: "candle-5", index: 5, label: "第5根葡萄紫蜡烛", color: "#9B5DE5", xPct: 67.23, yPct: 0.58 }
  ];

  // 皇冠相对于新版 kiki-idle.webp 自身盒子的精确锚点（发顶正中）
  var KIKI_CROWN_ANCHOR = {
    xPct: 59.0,
    yPct: 1.6,
    widthPct: 38.0,
    rotateDeg: -2
  };

  // 皇冠相对于欢呼帧 kiki-cheer.webp 自身盒子的精确锚点
  var KIKI_CHEER_CROWN_ANCHOR = {
    xPct: 52.3,
    yPct: 1.6,
    widthPct: 35.0,
    rotateDeg: -2
  };

  global.KIKI_STORY_DATA = {
    version: "4.0",
    bookMeta: {
      title: "林缨祈 KIKI 的5岁生日大冒险",
      subtitle: "5th Birthday Interactive Storybook",
      childNameZh: "林缨祈",
      childNameEn: "KIKI",
      birthDate: "2021-11-18",
      age: 5,
      assetVersion: "20",
      deploySubpath: "/little-explorer-learning/birthday/",
      audioManifestPath: "./assets/audio/audio-manifest.json",
      spritesMetaPath: "./assets/sprites/sprites-meta.json",
      spritesBasePath: "./assets/sprites/",
      // 爸爸妈妈可随时修改下方寄语内容，保存后刷新页面立即生效
      parentNote: {
        title: "爸爸妈妈给5岁林缨祈的一封信",
        greeting: "亲爱的小宝贝林缨祈（KIKI）：",
        paragraphs: [
          "时间过得真快，2021年11月18日那个软软糯糯的小天使，一眨眼就迎来了闪闪发光的5岁生日！",
          "这五年里，你像超级飞侠一样对世界充满好奇，像布鲁伊和宾果一样笑声清脆，像汪汪队一样勇敢善良，也像拼乐高一样把每一天都搭得五彩斑斓。",
          "5岁啦，爸爸妈妈不求你走得最快，只愿你永远眼中有光、心里有爱、脚下有风，在自己的小宇宙里自在开花，永远快乐健康！"
        ],
        signature: "永远爱你的爸爸妈妈 · 五岁生日纪念"
      }
    },

    spriteConfig: {
      defaultRatios: DEFAULT_SPRITE_RATIOS,
      kikiCrownAnchor: KIKI_CROWN_ANCHOR,
      kikiCheerCrownAnchor: KIKI_CHEER_CROWN_ANCHOR,
      kikiOutfits: {
        pumpkin: {
          label: "橘色南瓜羽绒服",
          idle: "kiki-idle.webp",
          cheer: "kiki-cheer.webp",
          crownAnchor: KIKI_CROWN_ANCHOR,
          cheerCrownAnchor: KIKI_CHEER_CROWN_ANCHOR
        },
        coat: {
          label: "粉白毛绒外套",
          idle: "kiki-idle-coat.webp",
          cheer: "kiki-cheer-coat.webp",
          crownAnchor: { xPct: 58.6, yPct: 1.6, widthPct: 38.0, rotateDeg: -2 },
          cheerCrownAnchor: { xPct: 52.6, yPct: 1.6, widthPct: 35.0, rotateDeg: -2 }
        }
      },
      defaultCakeCandleTips: DEFAULT_CAKE_CANDLE_TIPS
    },

    bgm: {
      gentle: "./assets/audio/bgm-gentle.mp3",
      birthdaySong: "./assets/audio/happy-birthday-en.mp3"
    },

    treasures: [
      {
        id: "crown-5",
        name: "金色5岁小皇冠",
        emoji: "👑",
        icon: "👑",
        sprite: "crown-5.webp",
        color: "#FFBE0B",
        sourcePage: 2,
        description: "超级飞侠准时送达的闪耀“5”字生日小皇冠！"
      },
      {
        id: "rainbow-balloons",
        name: "发光彩虹气球束",
        emoji: "🎈",
        icon: "🎈",
        color: "#FF70A6",
        sourcePage: 3,
        description: "和布鲁伊、宾果一起颠出来的五彩快乐气球！"
      },
      {
        id: "paw-musicbox",
        name: "勇敢徽章音乐盒",
        emoji: "🐾",
        icon: "🐾",
        color: "#3A86FF",
        sourcePage: 4,
        description: "阿奇、天天、毛毛共同守护的冒险湾生日徽章！"
      },
      {
        id: "lego-candy-tower",
        name: "乐高彩虹糖果塔",
        emoji: "🧱",
        icon: "🧱",
        color: "#2EC4B6",
        sourcePage: 5,
        description: "用彩色凸点积木一块块搭成的五岁奇迹城堡！"
      }
    ],

    pages: [
      {
        id: "page-01",
        pageNumber: 1,
        title: "林缨祈 KIKI，5岁生日快乐！",
        subtitle: "魔法花园邀请函 · Magic Garden Invitation",
        image: "./assets/images/bg-01.webp",
        fallbackImage: "./assets/images/page-01.webp",
        narrationAudio: "./assets/audio/p1-narrator.mp3",
        storyText: "暖暖的阳光洒在鲜花盛开的魔法花园里！今天是林缨祈 KIKI 的5岁生日！蝴蝶在花丛间翩翩起舞，快点一点彩色花丛或推开魔法花拱门，开启生日惊喜之旅吧！",
        speakerTag: "✨ 魔法邀请",
        bgmMode: "gentle",
        ambientFx: "petals-butterflies",
        interactionType: "cover-start",
        interactionHint: "点一点 KIKI、草地或彩色小花让 KIKI 跑去赏花和吸引彩蝶，准备好了就点魔法花拱门出发！",
        rewardTreasureId: null,
        actors: [
          {
            id: "p1-kiki",
            role: "kiki",
            label: "小寿星 KIKI",
            sprite: "kiki-idle.webp",
            x: 42,
            y: 78,
            heightPct: 48,
            anchor: "bottom",
            idle: "breathe",
            hasCrown: false,
            zIndex: 15,
            clickable: true,
            bubbleSide: "right",
            audio: "./assets/audio/kiki-1.mp3",
            audioPool: ["./assets/audio/kiki-1.mp3", "./assets/audio/kiki-2.mp3", "./assets/audio/kiki-3.mp3"],
            feedbackText: "KIKI 朝你挥挥手：欢迎来到我的5岁生日花园派对！",
            action: "kiki-welcome",
            tag: "👋 点一点 KIKI"
          }
        ],
        hotspots: [
          {
            id: "p1-arch-gate",
            label: "魔法花拱门入口",
            x: 64,
            y: 42,
            width: 28,
            height: 34,
            shape: "circle",
            action: "start-adventure"
          }
        ],
        items: [
          {
            id: "p1-start-gate",
            label: "打开5岁生日魔法书",
            icon: "🎂",
            action: "start-adventure"
          }
        ],
        voices: [
          {
            id: "p1-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p1-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "暖暖的阳光照进鲜花盛开的魔法花园啦！今天是小寿星林缨祈的五岁生日！让我们一起祝 Kiki 生日快乐！花丛里有彩色蝴蝶飞舞，推开魔法花拱门，看看好朋友们准备了什么神秘惊喜吧！"
          }
        ]
      },

      {
        id: "page-02",
        pageNumber: 2,
        title: "超级飞侠准时送达！",
        subtitle: "Super Wings Special Delivery",
        image: "./assets/images/bg-02.webp",
        fallbackImage: "./assets/images/page-02.webp",
        narrationAudio: "./assets/audio/p2-narrator.mp3",
        storyText: "“听，天空传来呼呼的风声！”超级飞侠乐迪正抱着亮黄色的超级快递箱，和粉色小爱一起飞进花园啦！等乐迪把箱子稳稳放下，快点一点拆开看看吧！",
        speakerTag: "✈️ 超级飞侠",
        bgmMode: "gentle",
        ambientFx: "sparkles",
        interactionType: "unbox-parcel",
        interactionHint: "看看乐迪抱着快递箱飞入投递与小爱伴飞护航，落地后再点快递箱看金色皇冠飞戴到 KIKI 头顶！",
        rewardTreasureId: "crown-5",
        actors: [
          {
            id: "p2-kiki",
            role: "kiki",
            label: "小寿星 KIKI",
            sprite: "kiki-idle.webp",
            x: 23,
            y: 78,
            heightPct: 45,
            anchor: "bottom",
            idle: "breathe",
            hasCrown: false,
            dynamicCrown: "p2-opened",
            zIndex: 15,
            clickable: true,
            bubbleSide: "right",
            audio: "./assets/audio/kiki-2.mp3",
            audioPool: ["./assets/audio/kiki-2.mp3", "./assets/audio/kiki-1.mp3", "./assets/audio/kiki-3.mp3"],
            feedbackText: "KIKI：哇！乐迪送来的超级快递箱里会装着什么惊喜呢？",
            action: "kiki-cheer",
            tag: "🎀 小寿星 KIKI"
          },
          {
            id: "p2-parcel-box",
            role: "parcel",
            label: "亮黄色超级快递箱",
            sprite: "parcel-closed.webp",
            openedSprite: "parcel-open.webp",
            x: 56,
            y: 78,
            heightPct: 30,
            anchor: "bottom",
            idle: "box-tease",
            zIndex: 14,
            clickable: true,
            bubbleSide: "top",
            audio: "./assets/audio/p2-unbox.mp3",
            feedbackText: "哇塞！金色5岁小皇冠飞到 KIKI 头顶戴上啦！",
            action: "unbox-reward",
            tag: "🎁 点我拆箱"
          },
          {
            id: "p2-jett",
            role: "jett",
            label: "乐迪 Jett",
            sprite: "jett.webp",
            x: 31,
            y: 25,
            heightPct: 24,
            anchor: "center",
            idle: "float-left",
            zIndex: 18,
            clickable: true,
            bubbleSide: "bottom",
            audio: "./assets/audio/p2-jett.mp3",
            audioPool: ["./assets/audio/p2-jett.mp3", "./assets/audio/jett-2.mp3", "./assets/audio/jett-3.mp3"],
            feedbackText: "乐迪：每时每刻，准时送达！KIKI 生日快乐！",
            action: "jett-fly-loop",
            tag: "✈️ 点乐迪飞一圈"
          },
          {
            id: "p2-dizzy",
            role: "dizzy",
            label: "小爱 Dizzy",
            sprite: "dizzy.webp",
            x: 75,
            y: 25,
            heightPct: 23,
            anchor: "center",
            idle: "float-right",
            zIndex: 18,
            clickable: true,
            bubbleSide: "bottom",
            audio: "./assets/audio/p2-dizzy.mp3",
            audioPool: ["./assets/audio/p2-dizzy.mp3", "./assets/audio/dizzy-2.mp3", "./assets/audio/dizzy-3.mp3"],
            feedbackText: "小爱：粉粉的祝福和爱心送给最可爱的 KIKI！",
            action: "dizzy-spin-hearts",
            tag: "🚁 点小爱转圈撒爱心"
          }
        ],
        items: [
          { id: "parcel-main", label: "超级快递箱", icon: "🎁", targetActorId: "p2-parcel-box" },
          { id: "jett-greet", label: "乐迪特技飞", icon: "🛩️", targetActorId: "p2-jett" },
          { id: "dizzy-greet", label: "小爱转圈撒爱心", icon: "🚁", targetActorId: "p2-dizzy" }
        ],
        voices: [
          {
            id: "p2-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p2-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "听，天空传来呼呼的风声！超级飞侠乐迪正抱着亮黄色的超级快递箱，和粉色小爱一起飞进花园啦！"
          },
          {
            id: "p2-jett",
            character: "乐迪 Jett",
            audio: "./assets/audio/p2-jett.mp3",
            voice: "动漫原声 · 乐迪",
            text: "我是乐迪！每时每刻，准时送达！超级快递箱我已经稳稳放好啦，快点点箱子拆开看看吧！"
          },
          {
            id: "p2-dizzy",
            character: "小爱 Dizzy",
            audio: "./assets/audio/p2-dizzy.mp3",
            voice: "动漫原声 · 小爱",
            text: "你好 Kiki，我是小爱！粉粉的祝福全部送给你！"
          },
          {
            id: "p2-unbox",
            character: "拆箱惊喜",
            audio: "./assets/audio/p2-unbox.mp3",
            voice: "动漫原声 · 小爱 & KIKI",
            text: "快看，快看！箱子里飞出了一顶闪闪发光的金色五岁小皇冠！哇，我戴上金色的小皇冠，就像小小生日公主啦！"
          }
        ]
      },

      {
        id: "page-03",
        pageNumber: 3,
        title: "布鲁伊和宾果的颠气球派对！",
        subtitle: "布鲁伊与宾果 · 快乐颠气球",
        image: "./assets/images/bg-03.webp",
        fallbackImage: "./assets/images/page-03.webp",
        narrationAudio: "./assets/audio/p3-narrator.mp3",
        storyText: "戴上闪闪发光的5岁小皇冠，KIKI 来到了布鲁伊和宾果的后院草坪！五只彩色气球飘起来又慢慢往下落，快帮布鲁伊和宾果一起把气球颠高高，别让它们掉下来！",
        speakerTag: "🎈 布鲁伊和宾果",
        bgmMode: "gentle",
        ambientFx: "sparkles",
        interactionType: "keepy-uppy",
        interactionHint: "布鲁伊、宾果和 KIKI 会追着下落的彩色气球跳起来颠高高！你也可以主动点击气球帮它们飞得更高！",
        rewardTreasureId: "rainbow-balloons",
        actors: [
          {
            id: "p3-bluey",
            role: "bluey",
            label: "布鲁伊 Bluey",
            sprite: "bluey.webp",
            x: 24,
            y: 78,
            heightPct: 37,
            anchor: "bottom",
            idle: "bob",
            zIndex: 14,
            clickable: true,
            bubbleSide: "top",
            audio: "./assets/audio/p3-bluey.mp3",
            audioPool: ["./assets/audio/p3-bluey.mp3", "./assets/audio/bluey-2.mp3", "./assets/audio/bluey-3.mp3"],
            feedbackText: "太好玩啦！千万别让彩色气球掉到地上哦！",
            action: "actor-jump",
            tag: "💙 布鲁伊"
          },
          {
            id: "p3-kiki",
            role: "kiki",
            label: "小寿星 KIKI",
            sprite: "kiki-idle.webp",
            x: 50,
            y: 79,
            heightPct: 43,
            anchor: "bottom",
            idle: "breathe",
            hasCrown: true,
            zIndex: 15,
            clickable: true,
            bubbleSide: "top",
            audio: "./assets/audio/kiki-3.mp3",
            audioPool: ["./assets/audio/kiki-3.mp3", "./assets/audio/kiki-2.mp3", "./assets/audio/kiki-1.mp3"],
            feedbackText: "KIKI：嘻嘻，我的5岁小皇冠亮晶晶的！一起来颠气球吧！",
            action: "actor-jump",
            tag: "👑 KIKI"
          },
          {
            id: "p3-bingo",
            role: "bingo",
            label: "宾果 Bingo",
            sprite: "bingo.webp",
            x: 76,
            y: 78,
            heightPct: 31,
            anchor: "bottom",
            idle: "sway",
            zIndex: 14,
            clickable: true,
            bubbleSide: "top",
            audio: "./assets/audio/p3-bingo.mp3",
            audioPool: ["./assets/audio/p3-bingo.mp3", "./assets/audio/bingo-2.mp3", "./assets/audio/bingo-3.mp3"],
            feedbackText: "宾果：嘻嘻，一起把彩色气球颠高高！",
            action: "actor-jump",
            tag: "🧡 宾果"
          }
        ],
        items: [
          { id: "balloon-red", index: 1, label: "红气球", colorName: "red", hex: "#FF595E", x: 16, y: 20 },
          { id: "balloon-yellow", index: 2, label: "黄气球", colorName: "yellow", hex: "#FFCA3A", x: 33, y: 26 },
          { id: "balloon-blue", index: 3, label: "蓝气球", colorName: "blue", hex: "#1982C4", x: 50, y: 17 },
          { id: "balloon-pink", index: 4, label: "粉气球", colorName: "pink", hex: "#FF70A6", x: 67, y: 25 },
          { id: "balloon-purple", index: 5, label: "紫气球", colorName: "purple", hex: "#9B5DE5", x: 84, y: 20 }
        ],
        voices: [
          {
            id: "p3-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p3-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "戴上了闪闪发光的金色小皇冠，小寿星 Kiki 来到了布鲁伊和宾果的后院草坪！哇，五只彩色气球飘起来又慢慢往下落，快帮布鲁伊和宾果一起把气球颠高高，别让它们掉到地上哦！"
          },
          {
            id: "p3-bluey",
            character: "布鲁伊 Bluey",
            audio: "./assets/audio/p3-bluey.mp3",
            voice: "动漫原声 · 布鲁伊",
            text: "太好玩啦！千万别让彩色气球掉到地上哦！"
          },
          {
            id: "p3-bingo",
            character: "宾果 Bingo",
            audio: "./assets/audio/p3-bingo.mp3",
            voice: "动漫原声 · 宾果",
            text: "我来啦，我是宾果！我也想要一直把彩色气球颠高高！"
          },
          {
            id: "p3-balloon-win",
            character: "派对欢呼",
            audio: "./assets/audio/p3-balloon-win.mp3",
            voice: "动漫原声 · 布鲁伊 & 宾果",
            text: "太棒啦！五只彩色气球都飞得好高呀！发光的彩虹气球，送给 Kiki 的礼物！"
          }
        ]
      },

      {
        id: "page-04",
        pageNumber: 4,
        title: "汪汪队出动！护送生日惊喜！",
        subtitle: "PAW Patrol · Adventure Bay Escort",
        image: "./assets/images/bg-04.webp",
        fallbackImage: "./assets/images/page-04.webp",
        narrationAudio: "./assets/audio/p4-narrator.mp3",
        storyText: "“没有困难的工作，只有勇敢的狗狗！”冒险湾的草坪上，远方的瞭望塔闪闪发亮。阿奇、天天和毛毛整装出发来为 KIKI 护航啦，点一点每只小狗看绝招并收集徽章！",
        speakerTag: "🐾 汪汪队立大功",
        bgmMode: "gentle",
        ambientFx: "sparkles",
        interactionType: "paw-badges",
        interactionHint: "依次点击阿奇、天天、毛毛或身旁的3D勇敢徽章，看徽章飞绕 KIKI 护航并集齐 3 枚徽章！",
        rewardTreasureId: "paw-musicbox",
        actors: [
          {
            id: "p4-chase",
            role: "chase",
            label: "阿奇 Chase",
            sprite: "chase.webp",
            x: 20,
            y: 77,
            heightPct: 35,
            anchor: "bottom",
            idle: "bob",
            zIndex: 14,
            clickable: true,
            bubbleSide: "top",
            badgeId: "chase",
            audio: "./assets/audio/p4-chase.mp3",
            audioPool: ["./assets/audio/p4-chase.mp3", "./assets/audio/chase-2.mp3", "./assets/audio/chase-3.mp3"],
            feedbackText: "阿奇：生日守护任务，包在我身上！",
            action: "paw-chase-dash",
            tag: "⭐ 点阿奇冲刺"
          },
          {
            id: "p4-skye",
            role: "skye",
            label: "天天 Skye",
            sprite: "skye.webp",
            x: 39,
            y: 77,
            heightPct: 31,
            anchor: "bottom",
            idle: "sway",
            zIndex: 18,
            clickable: true,
            bubbleSide: "top",
            badgeId: "skye",
            audio: "./assets/audio/p4-skye.mp3",
            audioPool: ["./assets/audio/p4-skye.mp3", "./assets/audio/skye-2.mp3", "./assets/audio/skye-3.mp3"],
            feedbackText: "天天：飞上云霄！祝 KIKI 每天都快乐自由！",
            action: "paw-skye-soar",
            tag: "🩷 点天天高飞盘旋"
          },
          {
            id: "p4-marshall",
            role: "marshall",
            label: "毛毛 Marshall",
            sprite: "marshall.webp",
            x: 58,
            y: 77,
            heightPct: 34,
            anchor: "bottom",
            idle: "bob",
            zIndex: 14,
            clickable: true,
            bubbleSide: "top",
            badgeId: "marshall",
            audio: "./assets/audio/p4-marshall.mp3",
            audioPool: ["./assets/audio/p4-marshall.mp3", "./assets/audio/marshall-2.mp3", "./assets/audio/marshall-3.mp3"],
            feedbackText: "毛毛：哈哈！祝 KIKI 吃好多美味草莓大蛋糕！",
            action: "paw-marshall-flip",
            tag: "🔥 点毛毛翻滚"
          },
          {
            id: "p4-kiki",
            role: "kiki",
            label: "小寿星 KIKI",
            sprite: "kiki-idle.webp",
            x: 80,
            y: 78,
            heightPct: 42,
            anchor: "bottom",
            idle: "breathe",
            hasCrown: true,
            zIndex: 15,
            clickable: true,
            bubbleSide: "left",
            audio: "./assets/audio/kiki-2.mp3",
            audioPool: ["./assets/audio/kiki-2.mp3", "./assets/audio/kiki-3.mp3", "./assets/audio/kiki-1.mp3"],
            feedbackText: "KIKI：汪汪队太帅啦！每只狗狗都有超酷的绝招！",
            action: "actor-jump",
            tag: "👑 KIKI"
          }
        ],
        items: [
          {
            id: "chase",
            name: "阿奇 Chase",
            targetActorId: "p4-chase",
            badgeTitle: "蓝色警徽",
            badgeIcon: "⭐",
            color: "#1D4ED8",
            x: 20,
            y: 62,
            audio: "./assets/audio/p4-chase.mp3",
            line: "汪汪队阿奇报到！生日守护任务交给我！"
          },
          {
            id: "skye",
            name: "天天 Skye",
            targetActorId: "p4-skye",
            badgeTitle: "粉色飞翼",
            badgeIcon: "🩷",
            color: "#EC4899",
            x: 39,
            y: 63,
            audio: "./assets/audio/p4-skye.mp3",
            line: "飞上云霄！祝五岁的 KIKI 快乐飞翔！"
          },
          {
            id: "marshall",
            name: "毛毛 Marshall",
            targetActorId: "p4-marshall",
            badgeTitle: "红色消防章",
            badgeIcon: "🔥",
            color: "#EF4444",
            x: 58,
            y: 62,
            audio: "./assets/audio/p4-marshall.mp3",
            line: "哈哈，祝 KIKI 每天笑哈哈，吃甜美蛋糕！"
          }
        ],
        voices: [
          {
            id: "p4-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p4-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "冒险湾的瞭望塔闪闪发亮！汪汪队阿奇、天天和毛毛带着勇敢徽章整装出发，来为 Kiki 护航啦！点一点三只小狗，看他们拿出绝招为你点亮徽章吧！"
          },
          {
            id: "p4-chase",
            character: "阿奇 Chase",
            audio: "./assets/audio/p4-chase.mp3",
            voice: "动漫原声 · 阿奇",
            text: "汪汪队阿奇报到！祝 Kiki 生日快乐，保护任务交给我！"
          },
          {
            id: "p4-skye",
            character: "天天 Skye",
            audio: "./assets/audio/p4-skye.mp3",
            voice: "动漫原声 · 天天",
            text: "飞上云霄！我是天天！祝小寿星 Kiki 自由快乐地飞翔！"
          },
          {
            id: "p4-marshall",
            character: "毛毛 Marshall",
            audio: "./assets/audio/p4-marshall.mp3",
            voice: "动漫原声 · 毛毛",
            text: "我来啦，我是毛毛！祝 Kiki 吃好多香甜草莓蛋糕！"
          },
          {
            id: "p4-team-cheer",
            character: "汪汪队合声",
            audio: "./assets/audio/p4-team-cheer.mp3",
            voice: "动漫原声 · 汪汪队",
            text: "汪汪队出动！没有困难的工作，只有勇敢的狗狗！祝亲爱的 Kiki 五岁生日快乐！"
          }
        ]
      },

      {
        id: "page-05",
        pageNumber: 5,
        title: "乐高大师的 5 岁梦幻城堡！",
        subtitle: "LEGO Workshop · 5th Birthday Castle",
        image: "./assets/images/bg-05.webp",
        fallbackImage: "./assets/images/page-05.webp",
        narrationAudio: "./assets/audio/p5-narrator.mp3",
        storyText: "叮叮当当！走进五彩缤纷的乐高积木工坊，三个黄色小人仔正在帮 KIKI 搭建“5”字生日大城堡！快点击桌上的 5 块彩色凸点积木，看它们飞进城堡升起 5 岁旗帜吧！",
        speakerTag: "🧱 乐高大师工坊",
        bgmMode: "gentle",
        ambientFx: "sparkles",
        interactionType: "lego-build",
        interactionHint: "点击桌上的 5 块彩色凸点乐高积木，拼满 5 块后城堡最高塔尖会升起“5”字彩旗，还可以点一点在桌上巡游的乐高积木小车哦！",
        rewardTreasureId: "lego-candy-tower",
        actors: [
          {
            id: "p5-kiki",
            role: "kiki",
            label: "小寿星 KIKI",
            sprite: "kiki-idle.webp",
            x: 15,
            y: 74,
            heightPct: 40,
            anchor: "bottom",
            idle: "breathe",
            hasCrown: true,
            zIndex: 15,
            clickable: true,
            bubbleSide: "right",
            audio: "./assets/audio/kiki-1.mp3",
            audioPool: ["./assets/audio/kiki-1.mp3", "./assets/audio/kiki-2.mp3", "./assets/audio/kiki-3.mp3"],
            feedbackText: "KIKI：哇，好多五彩凸点积木！我们一起来搭梦幻城堡吧！",
            action: "actor-jump",
            tag: "👑 KIKI"
          },
          {
            id: "p5-minifig-1",
            role: "minifig",
            label: "乐高小人仔 1 号",
            sprite: "lego-minifig-1.webp",
            x: 33,
            y: 67,
            heightPct: 19,
            anchor: "bottom",
            idle: "sway",
            zIndex: 16,
            clickable: true,
            bubbleSide: "top",
            audio: "./assets/audio/p5-lego-click.mp3",
            audioPool: ["./assets/audio/p5-lego-click.mp3", "./assets/audio/lego-2.mp3", "./assets/audio/lego-3.mp3"],
            feedbackText: "咔哒！积木小蓝随时准备接住飞来的积木！",
            action: "actor-jump",
            tag: "🧱 积木工匠"
          },
          {
            id: "p5-minifig-2",
            role: "minifig",
            label: "乐高小人仔 2 号",
            sprite: "lego-minifig-2.webp",
            x: 42,
            y: 68,
            heightPct: 19,
            anchor: "bottom",
            idle: "bob",
            zIndex: 16,
            clickable: true,
            bubbleSide: "top",
            audio: "./assets/audio/lego-2.mp3",
            audioPool: ["./assets/audio/lego-2.mp3", "./assets/audio/p5-lego-click.mp3", "./assets/audio/lego-3.mp3"],
            feedbackText: "咔哒！每一块凸点都咬合得稳稳当当！",
            action: "actor-jump",
            tag: "🧱 积木助手"
          },
          {
            id: "p5-castle",
            role: "castle",
            label: "5岁乐高生日城堡",
            sprite: "lego-castle.webp",
            x: 66,
            y: 67,
            heightPct: 58,
            anchor: "bottom",
            idle: "none",
            zIndex: 12,
            clickable: true,
            bubbleSide: "left",
            audio: "./assets/audio/p5-lego-click.mp3",
            feedbackText: "咔哒！又一块漂亮的彩色凸点积木搭上去啦！",
            action: "castle-build-next",
            tag: "🏰 点击城堡拼搭积木"
          },
          {
            id: "p5-flag-5",
            role: "flag",
            label: "5岁城堡彩旗",
            sprite: "lego-flag-5.webp",
            x: 66,
            y: 23.5,
            heightPct: 13,
            anchor: "bottom",
            idle: "flag-wave",
            zIndex: 13,
            clickable: false,
            hiddenUntil: "p5-won"
          },
          {
            id: "p5-minifig-3",
            role: "minifig",
            label: "乐高小人仔 3 号",
            sprite: "lego-minifig-3.webp",
            x: 87,
            y: 68,
            heightPct: 19,
            anchor: "bottom",
            idle: "sway",
            zIndex: 16,
            clickable: true,
            bubbleSide: "left",
            audio: "./assets/audio/lego-3.mp3",
            audioPool: ["./assets/audio/lego-3.mp3", "./assets/audio/lego-2.mp3", "./assets/audio/p5-lego-click.mp3"],
            feedbackText: "耶！五岁城堡拼完还要升起漂亮的旗帜哦！",
            action: "actor-jump",
            tag: "🧱 升旗手"
          }
        ],
        // 严格置于桌面位置且完全位于桌面端 .caption-card（bottom:8px; max-height:20%）上方
        items: [
          { id: "brick-1", index: 1, label: "红色积木", colorName: "red", hex: "#EF233C", x: 35, y: 74.2 },
          { id: "brick-2", index: 2, label: "明黄积木", colorName: "yellow", hex: "#FFD60A", x: 46.5, y: 74.2 },
          { id: "brick-3", index: 3, label: "天蓝积木", colorName: "blue", hex: "#0096C7", x: 58, y: 74.2 },
          { id: "brick-4", index: 4, label: "糖果粉积木", colorName: "pink", hex: "#FF70A6", x: 69.5, y: 74.2 },
          { id: "brick-5", index: 5, label: "翠绿积木", colorName: "green", hex: "#2EC4B6", x: 81, y: 74.2 }
        ],
        voices: [
          {
            id: "p5-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p5-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "欢迎来到五彩斑斓的乐高工坊！三个黄色小人仔还有积木小车，正在忙着为小寿星 Kiki 搭建五岁生日城堡！点一点桌上的彩色凸点积木，或者点一点积木小车，大家一起来盖大城堡吧！"
          },
          {
            id: "p5-lego-click",
            character: "乐高小人仔",
            audio: "./assets/audio/p5-lego-click.mp3",
            voice: "动漫原声 · 乐高小人仔",
            text: "咔哒！这块彩色积木拼上去真稳当，加油！"
          },
          {
            id: "p5-lego-win",
            character: "乐高欢呼",
            audio: "./assets/audio/p5-lego-win.mp3",
            voice: "动漫原声 · 乐高小人仔",
            text: "太棒啦！五岁乐高大城堡终于搭好啦！祝 Kiki 成为最厉害的小小建筑师！"
          }
        ]
      },

      {
        id: "page-06",
        pageNumber: 6,
        title: "魔法汇合！派对大厅点亮！",
        subtitle: "Party Hall Lights On!",
        image: "./assets/images/bg-06.webp",
        fallbackImage: "./assets/images/page-06.webp",
        narrationAudio: "./assets/audio/p6-narrator.mp3",
        storyText: "夜幕温柔降临，花园帐篷大厅布置好啦！所有好朋友都围绕着中央魔法宝物展示台欢呼聚集。快点击上方魔法星光灯串，看飞侠顺着灯线一路点亮派对吧！",
        speakerTag: "💡 派对星光大厅",
        bgmMode: "gentle",
        ambientFx: "fireflies",
        interactionType: "party-lights",
        interactionHint: "点击帐篷顶端的魔法星光灯串，看乐迪和小爱掠空逐盏点亮灯串并照耀中央宝物台！",
        rewardTreasureId: null,
        actors: [
          { id: "p6-jett", role: "jett", label: "乐迪", sprite: "jett.webp", x: 14, y: 27, heightPct: 18, anchor: "center", idle: "float-left", zIndex: 16, clickable: true, bubbleSide: "bottom", audio: "./assets/audio/jett-2.mp3", audioPool: ["./assets/audio/jett-2.mp3", "./assets/audio/jett-3.mp3"], feedbackText: "乐迪：花园帐篷大厅准备就绪！", action: "actor-jump" },
          { id: "p6-dizzy", role: "dizzy", label: "小爱", sprite: "dizzy.webp", x: 86, y: 27, heightPct: 18, anchor: "center", idle: "float-right", zIndex: 16, clickable: true, bubbleSide: "bottom", audio: "./assets/audio/p2-dizzy.mp3", audioPool: ["./assets/audio/p2-dizzy.mp3", "./assets/audio/dizzy-2.mp3", "./assets/audio/dizzy-3.mp3"], feedbackText: "小爱：点亮星光灯肯定超梦幻！", action: "actor-jump" },
          { id: "p6-bluey", role: "bluey", label: "布鲁伊", sprite: "bluey.webp", x: 14, y: 77, heightPct: 29, anchor: "bottom", idle: "bob", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p3-bluey.mp3", audioPool: ["./assets/audio/p3-bluey.mp3", "./assets/audio/bluey-2.mp3", "./assets/audio/bluey-3.mp3"], feedbackText: "布鲁伊：太棒啦！大家都集合啦！", action: "actor-jump" },
          { id: "p6-bingo", role: "bingo", label: "宾果", sprite: "bingo.webp", x: 24, y: 77, heightPct: 24, anchor: "bottom", idle: "sway", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p3-bingo.mp3", audioPool: ["./assets/audio/p3-bingo.mp3", "./assets/audio/bingo-2.mp3", "./assets/audio/bingo-3.mp3"], feedbackText: "宾果：派对宝物台好漂亮呀！", action: "actor-jump" },
          { id: "p6-chase", role: "chase", label: "阿奇", sprite: "chase.webp", x: 35, y: 77, heightPct: 27, anchor: "bottom", idle: "bob", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p4-chase.mp3", audioPool: ["./assets/audio/p4-chase.mp3", "./assets/audio/chase-2.mp3", "./assets/audio/chase-3.mp3"], feedbackText: "阿奇：派对大厅安全守护中！", action: "actor-jump" },
          { id: "p6-kiki", role: "kiki", label: "小寿星 KIKI", sprite: "kiki-idle.webp", x: 50, y: 78, heightPct: 37, anchor: "bottom", idle: "breathe", hasCrown: true, zIndex: 17, clickable: true, bubbleSide: "top", audio: "./assets/audio/kiki-1.mp3", audioPool: ["./assets/audio/kiki-1.mp3", "./assets/audio/kiki-2.mp3", "./assets/audio/kiki-3.mp3"], feedbackText: "KIKI：谢谢所有好朋友陪我过5岁生日！", action: "actor-jump" },
          { id: "p6-skye", role: "skye", label: "天天", sprite: "skye.webp", x: 64, y: 77, heightPct: 25, anchor: "bottom", idle: "sway", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p4-skye.mp3", audioPool: ["./assets/audio/p4-skye.mp3", "./assets/audio/skye-2.mp3", "./assets/audio/skye-3.mp3"], feedbackText: "天天：星光闪闪，飞向快乐吧！", action: "actor-jump" },
          { id: "p6-marshall", role: "marshall", label: "毛毛", sprite: "marshall.webp", x: 74, y: 77, heightPct: 27, anchor: "bottom", idle: "bob", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p4-marshall.mp3", audioPool: ["./assets/audio/p4-marshall.mp3", "./assets/audio/marshall-2.mp3", "./assets/audio/marshall-3.mp3"], feedbackText: "毛毛：等会儿就可以切大蛋糕啦！", action: "actor-jump" },
          { id: "p6-minifig-1", role: "minifig", label: "乐高小伙伴", sprite: "lego-minifig-1.webp", x: 84, y: 76, heightPct: 16, anchor: "bottom", idle: "sway", zIndex: 15, clickable: true, bubbleSide: "left", audio: "./assets/audio/p5-lego-click.mp3", audioPool: ["./assets/audio/p5-lego-click.mp3", "./assets/audio/lego-2.mp3", "./assets/audio/lego-3.mp3"], feedbackText: "乐高小人仔：我们的宝物也带来派对啦！", action: "actor-jump" },
          { id: "p6-minifig-2", role: "minifig", label: "乐高小人仔", sprite: "lego-minifig-2.webp", x: 91, y: 76, heightPct: 16, anchor: "bottom", idle: "bob", zIndex: 15, clickable: true, bubbleSide: "left", audio: "./assets/audio/lego-3.mp3", audioPool: ["./assets/audio/lego-3.mp3", "./assets/audio/lego-2.mp3", "./assets/audio/p5-lego-click.mp3"], feedbackText: "乐高小人仔：闪耀星光派对开始啦！", action: "actor-jump" }
        ],
        hotspots: [
          {
            id: "p6-string-lights",
            label: "魔法星光灯串",
            role: "lights",
            x: 50,
            y: 13,
            width: 86,
            height: 20,
            shape: "pill",
            audio: "./assets/audio/p6-party-light.mp3",
            feedbackText: "啪嗒！星光逐盏亮起，四件魔法宝物闪耀在餐桌啦！",
            action: "toggle-party-lights"
          }
        ],
        items: [
          { id: "light-switch", label: "点亮星光灯串", icon: "✨", targetHotspotId: "p6-string-lights" }
        ],
        voices: [
          {
            id: "p6-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p6-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "夜晚悄悄降临，花园帐篷派对大厅准备就绪啦！四组好朋友都带着收集到的魔法宝物来到了草坪上。快点亮上方的魔法星光灯串，把宝物台点亮吧！"
          },
          {
            id: "p6-party-light",
            character: "全场好朋友合声",
            audio: "./assets/audio/p6-party-light.mp3",
            voice: "动漫原声 · 小爱 & 乐迪",
            text: "哇，星光彩灯全都亮起来啦！魔法宝物台好梦幻呀！我们一起祝 Kiki 五岁生日快乐，派对正式开始！"
          }
        ]
      },

      {
        id: "page-07",
        pageNumber: 7,
        title: "许愿吹蜡烛！Happy 5th Birthday!",
        subtitle: "Make a Wish & Blow 5 Candles",
        image: "./assets/images/bg-07.webp",
        fallbackImage: "./assets/images/page-07.webp",
        narrationAudio: "./assets/audio/p7-narrator.mp3",
        storyText: "最幸福的时刻到啦！桌上摆满了甜甜的纸杯蛋糕、马卡龙甜点碟、派对帽和闪烁的许愿茶烛！双层草莓彩虹大蛋糕上插着 5 根彩色蜡烛，快闭眼许个愿望，再让小云朵一口气吹灭它们吧！",
        speakerTag: "🕯️ 五岁许愿时刻",
        bgmMode: "gentle",
        ambientFx: "warm-sparkles",
        interactionType: "blow-candles",
        interactionHint: "可以点一点桌上的小甜点，或者点一点可爱的小云朵和蜡烛，看小云朵飞下来吹灭 5 根蜡烛并唱响生日快乐歌！",
        rewardTreasureId: null,
        actors: [
          { id: "p7-bluey", role: "bluey", label: "布鲁伊", sprite: "bluey.webp", x: 11, y: 76, heightPct: 30, anchor: "bottom", idle: "bob", zIndex: 13, clickable: true, bubbleSide: "top", audio: "./assets/audio/bluey-3.mp3", audioPool: ["./assets/audio/bluey-3.mp3", "./assets/audio/p3-bluey.mp3", "./assets/audio/bluey-2.mp3"], feedbackText: "布鲁伊：Kiki 快许一个最美的五岁愿望！", action: "actor-jump" },
          { id: "p7-kiki", role: "kiki", label: "小寿星 KIKI", sprite: "kiki-idle.webp", x: 24, y: 78, heightPct: 41, anchor: "bottom", idle: "breathe", hasCrown: true, zIndex: 15, clickable: true, bubbleSide: "top", audio: "./assets/audio/kiki-3.mp3", audioPool: ["./assets/audio/kiki-3.mp3", "./assets/audio/kiki-2.mp3", "./assets/audio/kiki-1.mp3"], feedbackText: "KIKI 闭上眼睛许愿：希望每天都和好朋友们一起开心玩！", action: "actor-jump" },
          { id: "p7-bingo", role: "bingo", label: "宾果", sprite: "bingo.webp", x: 35, y: 76, heightPct: 24, anchor: "bottom", idle: "sway", zIndex: 13, clickable: true, bubbleSide: "top", audio: "./assets/audio/bingo-3.mp3", audioPool: ["./assets/audio/bingo-3.mp3", "./assets/audio/p3-bingo.mp3", "./assets/audio/bingo-2.mp3"], feedbackText: "宾果：我数好啦，一、二、三、四、五根蜡烛！", action: "actor-jump" },
          {
            id: "p7-cake",
            role: "cake",
            label: "双层草莓彩虹大蛋糕",
            sprite: "cake-5candles.webp",
            x: 51,
            y: 79,
            heightPct: 51,
            anchor: "bottom",
            idle: "none",
            zIndex: 18,
            clickable: false
          },
          { id: "p7-chase", role: "chase", label: "阿奇", sprite: "chase.webp", x: 68, y: 76, heightPct: 28, anchor: "bottom", idle: "bob", zIndex: 13, clickable: true, bubbleSide: "top", audio: "./assets/audio/chase-2.mp3", audioPool: ["./assets/audio/chase-2.mp3", "./assets/audio/p4-chase.mp3", "./assets/audio/chase-3.mp3"], feedbackText: "阿奇：准备帮寿星一起倒数三二一吹蜡烛！", action: "actor-jump" },
          { id: "p7-skye", role: "skye", label: "天天", sprite: "skye.webp", x: 78, y: 76, heightPct: 25, anchor: "bottom", idle: "sway", zIndex: 13, clickable: true, bubbleSide: "top", audio: "./assets/audio/skye-3.mp3", audioPool: ["./assets/audio/skye-3.mp3", "./assets/audio/p4-skye.mp3", "./assets/audio/skye-2.mp3"], feedbackText: "天天：愿望一定会像气球一样飞上天！", action: "actor-jump" },
          { id: "p7-marshall", role: "marshall", label: "毛毛", sprite: "marshall.webp", x: 89, y: 76, heightPct: 28, anchor: "bottom", idle: "bob", zIndex: 13, clickable: true, bubbleSide: "left", audio: "./assets/audio/p4-marshall.mp3", audioPool: ["./assets/audio/p4-marshall.mp3", "./assets/audio/marshall-2.mp3", "./assets/audio/marshall-3.mp3"], feedbackText: "毛毛：呼——！哈哈，好大的草莓蛋糕呀！", action: "actor-jump" }
        ],
        candles: DEFAULT_CAKE_CANDLE_TIPS,
        items: DEFAULT_CAKE_CANDLE_TIPS,
        voices: [
          {
            id: "p7-narrator",
            character: "旁白姐姐",
            audio: "./assets/audio/p7-narrator.mp3",
            voice: "冰糖 · 幼教",
            text: "哇，满桌都是甜甜的纸杯蛋糕、马卡龙和闪烁烛光的许愿杯！正中央的双层草莓彩虹大蛋糕上，插着五根生日蜡烛。快闭上眼睛许个愿望，再点一点小云朵或蜡烛，一口气吹灭它们吧！"
          },
          {
            id: "p7-blow-cheer",
            character: "全员欢呼",
            audio: "./assets/audio/p7-blow-cheer.mp3",
            voice: "动漫原声 · KIKI & 阿奇",
            text: "耶！五根生日蜡烛全部吹灭啦！祝亲爱的 Kiki 五岁生日快乐！"
          }
        ]
      },

      {
        id: "page-08",
        pageNumber: 8,
        title: "终章：星光大合唱 & 生日快乐歌",
        subtitle: "All-Star Finale · Happy Birthday KIKI!",
        image: "./assets/images/bg-08.webp",
        fallbackImage: "./assets/images/page-08.webp",
        narrationAudio: "./assets/audio/p8-outro.mp3",
        storyText: "五岁愿望飞向闪闪发光的夜空啦！绚丽的烟花为林缨祈 KIKI 绽放，乐迪和小爱拉着发光彩带滑翔，所有好朋友跟着节拍摇摆起舞，齐声唱响《Happy Birthday to You》！",
        speakerTag: "🎆 全明星星光大合唱",
        bgmMode: "birthday",
        ambientFx: "fireworks-ribbons",
        interactionType: "finale-singalong",
        interactionHint: "点击夜空随时加放爱心烟花！点击“🎶 再唱一遍”或打开“💌 爸爸妈妈的信”珍藏美好祝福！",
        rewardTreasureId: null,
        actors: [
          { id: "p8-jett", role: "jett", label: "乐迪", sprite: "jett.webp", x: 24, y: 27, heightPct: 18, anchor: "center", idle: "glide-patrol-left", zIndex: 18, clickable: true, bubbleSide: "bottom", audio: "./assets/audio/jett-2.mp3", audioPool: ["./assets/audio/jett-2.mp3", "./assets/audio/jett-3.mp3"], feedbackText: "乐迪：为 KIKI 在夜空拉出彩虹彩带！", action: "jett-fly-loop" },
          { id: "p8-dizzy", role: "dizzy", label: "小爱", sprite: "dizzy.webp", x: 76, y: 27, heightPct: 17, anchor: "center", idle: "glide-patrol-right", zIndex: 18, clickable: true, bubbleSide: "bottom", audio: "./assets/audio/p2-dizzy.mp3", audioPool: ["./assets/audio/p2-dizzy.mp3", "./assets/audio/dizzy-2.mp3", "./assets/audio/dizzy-3.mp3"], feedbackText: "小爱：满天星光都是给 KIKI 的祝福！", action: "dizzy-spin-hearts" },
          { id: "p8-bluey", role: "bluey", label: "布鲁伊", sprite: "bluey.webp", x: 11, y: 77, heightPct: 29, anchor: "bottom", idle: "dance", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/bluey-3.mp3", audioPool: ["./assets/audio/bluey-3.mp3", "./assets/audio/p3-bluey.mp3", "./assets/audio/bluey-2.mp3"], feedbackText: "布鲁伊：一起摇摆合唱生日快乐歌！", action: "actor-jump" },
          { id: "p8-bingo", role: "bingo", label: "宾果", sprite: "bingo.webp", x: 21, y: 77, heightPct: 24, anchor: "bottom", idle: "dance-alt", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/bingo-3.mp3", audioPool: ["./assets/audio/bingo-3.mp3", "./assets/audio/p3-bingo.mp3", "./assets/audio/bingo-2.mp3"], feedbackText: "宾果：啦啦啦～祝 KIKI 五岁生日快乐！", action: "actor-jump" },
          { id: "p8-chase", role: "chase", label: "阿奇", sprite: "chase.webp", x: 31, y: 77, heightPct: 27, anchor: "bottom", idle: "dance", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p4-chase.mp3", audioPool: ["./assets/audio/p4-chase.mp3", "./assets/audio/chase-2.mp3", "./assets/audio/chase-3.mp3"], feedbackText: "阿奇：永远勇敢快乐地成长吧 KIKI！", action: "actor-jump" },
          { id: "p8-skye", role: "skye", label: "天天", sprite: "skye.webp", x: 40, y: 77, heightPct: 24, anchor: "bottom", idle: "dance-alt", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p4-skye.mp3", audioPool: ["./assets/audio/p4-skye.mp3", "./assets/audio/skye-2.mp3", "./assets/audio/skye-3.mp3"], feedbackText: "天天：跟着音乐跳起来吧！", action: "actor-jump" },
          { id: "p8-kiki", role: "kiki", label: "小寿星 KIKI", sprite: "kiki-idle.webp", x: 51, y: 79, heightPct: 39, anchor: "bottom", idle: "dance-lead", hasCrown: true, zIndex: 17, clickable: true, bubbleSide: "top", audio: "./assets/audio/kiki-1.mp3", audioPool: ["./assets/audio/kiki-1.mp3", "./assets/audio/kiki-2.mp3", "./assets/audio/kiki-3.mp3"], feedbackText: "KIKI：谢谢大家，我好喜欢这个5岁生日派对！", action: "actor-jump" },
          { id: "p8-marshall", role: "marshall", label: "毛毛", sprite: "marshall.webp", x: 63, y: 77, heightPct: 27, anchor: "bottom", idle: "dance", zIndex: 14, clickable: true, bubbleSide: "top", audio: "./assets/audio/p4-marshall.mp3", audioPool: ["./assets/audio/p4-marshall.mp3", "./assets/audio/marshall-2.mp3", "./assets/audio/marshall-3.mp3"], feedbackText: "毛毛：耶！大合唱太快乐啦！", action: "actor-jump" },
          { id: "p8-minifig-1", role: "minifig", label: "乐高小人仔 1", sprite: "lego-minifig-1.webp", x: 74, y: 76, heightPct: 16, anchor: "bottom", idle: "dance-alt", zIndex: 15, clickable: true, bubbleSide: "top", audio: "./assets/audio/lego-3.mp3", audioPool: ["./assets/audio/lego-3.mp3", "./assets/audio/p5-lego-click.mp3", "./assets/audio/lego-2.mp3"], feedbackText: "乐高小人仔：祝 KIKI 五岁快乐无敌！", action: "actor-jump" },
          { id: "p8-minifig-2", role: "minifig", label: "乐高小人仔 2", sprite: "lego-minifig-2.webp", x: 82, y: 76, heightPct: 16, anchor: "bottom", idle: "dance", zIndex: 15, clickable: true, bubbleSide: "left", audio: "./assets/audio/p5-lego-click.mp3", audioPool: ["./assets/audio/p5-lego-click.mp3", "./assets/audio/lego-2.mp3", "./assets/audio/lego-3.mp3"], feedbackText: "乐高小人仔：咔哒咔哒打节拍！", action: "actor-jump" },
          { id: "p8-minifig-3", role: "minifig", label: "乐高小人仔 3", sprite: "lego-minifig-3.webp", x: 90, y: 76, heightPct: 16, anchor: "bottom", idle: "dance-alt", zIndex: 15, clickable: true, bubbleSide: "left", audio: "./assets/audio/lego-2.mp3", audioPool: ["./assets/audio/lego-2.mp3", "./assets/audio/lego-3.mp3", "./assets/audio/p5-lego-click.mp3"], feedbackText: "乐高小人仔：五岁生日快乐！", action: "actor-jump" }
        ],
        hotspots: [
          {
            id: "p8-fireworks-sky",
            label: "夜空星光烟花",
            role: "fireworks",
            x: 50,
            y: 22,
            width: 92,
            height: 38,
            shape: "rect",
            audio: "./assets/audio/happy-birthday-en.mp3",
            feedbackText: "漫天烟花绽放！祝 KIKI 5岁生日快乐！",
            action: "launch-fireworks"
          }
        ],
        items: [
          {
            id: "play-birthday-song",
            label: "唱响英文生日快乐歌",
            icon: "🎶",
            audio: "./assets/audio/happy-birthday-en.mp3",
            action: "sing-along"
          },
          {
            id: "open-parent-note",
            label: "打开爸爸妈妈的5岁寄语",
            icon: "💌",
            action: "open-parent-note"
          }
        ],
        voices: [
          {
            id: "p8-outro",
            character: "旁白 & 全明星齐祝",
            audio: "./assets/audio/p8-outro.mp3",
            voice: "冰糖 · 幼教 + 全体动漫小伙伴齐声",
            text: "五岁愿望顺着星光飞向夜空啦！璀璨的烟花为你绽放，所有好朋友都聚在一起啦——祝林缨祈，Kiki，五岁生日快乐！"
          },
          {
            id: "happy-birthday-en",
            character: "生日快乐歌大合唱",
            audio: "./assets/audio/happy-birthday-en.mp3",
            voice: "乌克丽丽真人欢唱",
            text: "Happy Birthday to you, Happy Birthday to you, Happy Birthday, happy birthday, Happy Birthday to you!"
          }
        ]
      }
    ]
  };
})(window);
