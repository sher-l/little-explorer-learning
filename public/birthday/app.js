/**
 * 《林缨祈 KIKI 的5岁生日大冒险》V2 分层精灵动态交互与音频引擎
 *
 * 核心升级：
 * - Layer 1 背景层：16:9 纯净空场景插画 ./assets/images/bg-01..08.webp（带平滑降级兜底）
 * - Layer 2 透明精灵层：./assets/sprites/*.webp 独立角色与道具，全员持续生命 Idle 动画，
 *   支持 P2 皇冠箱中旋转升起并沿高抛物线戴到 KIKI 头顶、P4 天天高空盘旋、P5 积木飞入与升旗、
 *   P7 蛋糕内嵌 5 根蜡烛精准动态火苗、P8 滑翔彩带与全员节拍共舞
 * - Layer 3 特效层：Canvas 扇翅蝴蝶/花瓣、彩虹星光拖尾、粉红爱心、烛芯袅袅白烟、夜空循环烟花
 * - 严守相对路径 ./assets/...、严格 CSP 零内联脚本/事件、独立存储键 kiki-birthday-5.*
 */
(function (global, doc) {
  "use strict";

  var DATA = global.KIKI_STORY_DATA;
  if (!DATA || !Array.isArray(DATA.pages) || DATA.pages.length === 0) {
    return;
  }

  var Sfx = global.KikiSfx || {
    unlock: function () {},
    setMuted: function () {},
    playPageTurn: function () {},
    playSparkle: function () {},
    playPop: function () {},
    playFlyWhoosh: function () {},
    playBoxShake: function () {},
    playBoxOpen: function () {},
    playCrownRise: function () {},
    playCrownLand: function () {},
    playBadgeChime: function () {},
    playLegoSnap: function () {},
    playBulbTick: function () {},
    playLightsOn: function () {},
    playBlow: function () {},
    playWinChime: function () {},
    playFirework: function () {}
  };

  var STORAGE_KEYS = {
    voicePack: "kiki-birthday-5.voicePack",
    treasures: "kiki-birthday-5.treasures"
  };

  var BASE_GENTLE_VOL = 0.25;
  var BASE_BIRTHDAY_VOL = 0.78;
  var DUCK_FACTOR = 0.25;
  var STAGE_RATIO = 16 / 9;

  var dom = {
    body: doc.body,
    bookTitle: doc.getElementById("book-title"),
    btnBookCover: doc.getElementById("btn-book-cover"),
    btnOpenBook: doc.getElementById("btn-open-book"),
    pageIndicator: doc.getElementById("page-indicator"),
    pageSubtitlePill: doc.getElementById("page-subtitle-pill"),
    treasureBar: doc.getElementById("treasure-bar"),
    btnToggleBgm: doc.getElementById("btn-toggle-bgm"),
    btnReplayVoice: doc.getElementById("btn-replay-voice"),
    btnLookCloser: doc.getElementById("btn-look-closer"),
    btnToggleSubtitle: doc.getElementById("btn-toggle-subtitle"),
    btnOpenDrawer: doc.getElementById("btn-open-drawer"),
    btnPrevPage: doc.getElementById("btn-prev-page"),
    btnNextPage: doc.getElementById("btn-next-page"),
    popup3dCanvas: doc.getElementById("popup3d-canvas"),
    stageFrame: doc.getElementById("stage-frame"),
    bookEdgeLeft: doc.getElementById("book-edge-left"),
    bookEdgeRight: doc.getElementById("book-edge-right"),
    stageScene: doc.getElementById("stage-scene"),
    stageImage: doc.getElementById("stage-image"),
    stageImageFallback: doc.getElementById("stage-image-fallback"),
    fallbackPageName: doc.getElementById("fallback-page-name"),
    stageMoodLayer: doc.getElementById("stage-mood-layer"),
    stageActorsLayer: doc.getElementById("stage-actors-layer"),
    stageInteractiveLayer: doc.getElementById("stage-interactive-layer"),
    fxCanvas: doc.getElementById("fx-canvas"),
    cssFlipFallback: doc.getElementById("css-flip-fallback"),
    btnCornerPrev: doc.getElementById("btn-corner-prev"),
    btnCornerNext: doc.getElementById("btn-corner-next"),
    stageBubblesLayer: doc.getElementById("stage-bubbles-layer"),
    stageHud: doc.getElementById("stage-hud"),
    karaokeBar: doc.getElementById("karaoke-bar"),
    finaleFloatActions: doc.getElementById("finale-float-actions"),
    btnFinaleSing: doc.getElementById("btn-finale-sing"),
    btnFinaleNote: doc.getElementById("btn-finale-note"),
    btnFinaleReplay: doc.getElementById("btn-finale-replay"),
    stageToast: doc.getElementById("stage-toast"),
    captionCard: doc.getElementById("caption-card"),
    captionSpeaker: doc.getElementById("caption-speaker"),
    audioStatusChip: doc.getElementById("audio-status-chip"),
    captionActions: doc.getElementById("caption-actions"),
    btnToggleCaption: doc.getElementById("btn-toggle-caption"),
    captionStory: doc.getElementById("caption-story"),
    captionHint: doc.getElementById("caption-hint"),
    pageDots: doc.getElementById("page-dots"),
    parentNoteBackdrop: doc.getElementById("parent-note-backdrop"),
    parentNoteModal: doc.getElementById("parent-note-modal"),
    btnCloseParentNote: doc.getElementById("btn-close-parent-note"),
    parentNoteTitle: doc.getElementById("parent-note-title"),
    parentNoteGreeting: doc.getElementById("parent-note-greeting"),
    parentNoteParagraphs: doc.getElementById("parent-note-paragraphs"),
    parentNoteSignature: doc.getElementById("parent-note-signature"),
    parentNoteHint: doc.getElementById("parent-note-hint"),
    drawerBackdrop: doc.getElementById("drawer-backdrop"),
    parentDrawer: doc.getElementById("parent-drawer"),
    btnCloseDrawer: doc.getElementById("btn-close-drawer"),
    drawerVoiceBadge: doc.getElementById("drawer-voice-badge"),
    drawerVoiceStatus: doc.getElementById("drawer-voice-status"),
    drawerHashDisplay: doc.getElementById("drawer-hash-display"),
    btnResetCurrentPage: doc.getElementById("btn-reset-current-page"),
    btnResetAllProgress: doc.getElementById("btn-reset-all-progress"),
    drawerTreasureSummary: doc.getElementById("drawer-treasure-summary"),
    drawerPageList: doc.getElementById("drawer-page-list"),
    drawerAudioState: doc.getElementById("drawer-audio-state"),
    drawerVoiceList: doc.getElementById("drawer-voice-list")
  };

  function createFreshPageState() {
    return {
      p2: { parcelTaps: 0, opened: false, crownInFlight: false },
      p3: { bounces: 0, won: false },
      p4: { collected: {}, cheered: false },
      p5: { placed: {}, won: false },
      p6: { lightsOn: false },
      p7: { blown: {}, allBlown: false }
    };
  }

  var state = {
    currentPage: 1,
    voicePack: "mimo",
    audioUnlocked: false,
    musicMuted: false,
    isVoicePlaying: false,
    activeBgmMode: "gentle",
    currentVoiceRawPath: null,
    lastPageVoiceRawPath: null,
    voicePlaybackToken: 0,
    narrationTimer: null,
    toastTimer: null,
    bubbleTimer: null,
    drawerOpen: false,
    parentNoteOpen: false,
    captionVisible: false,
    captionCollapsed: false,
    bookClosed: false,
    isFlippingPage: false,
    justUnlockedTreasureId: null,
    unlockedTreasures: {},
    manifests: {},
    spritesMeta: null,
    pageState: createFreshPageState(),
    swipeJustHappened: false,
    actorNodes: {},
    actorVoiceTracker: {},
    pendingSceneVoice: null,
    pageAutoSpoken: {},
    pageSessionToken: 0
  };

  // ======================== 音频引擎 ========================

  var bgmGentleAudio = new Audio();
  bgmGentleAudio.loop = true;
  bgmGentleAudio.preload = "auto";
  bgmGentleAudio.volume = 0;

  var birthdaySongAudio = new Audio();
  birthdaySongAudio.loop = false;
  birthdaySongAudio.preload = "auto";
  birthdaySongAudio.volume = 0;

  var voiceAudio = new Audio();
  voiceAudio.preload = "auto";

  var audioFadeRafs = new WeakMap();
  var karaokeRafId = null;

  function withAssetVersion(url) {
    if (!url) {
      return url;
    }
    var cleaned = String(url).trim();
    if (!cleaned || cleaned.indexOf("data:") === 0 || cleaned.indexOf("blob:") === 0) {
      return cleaned;
    }
    var ver = (DATA.bookMeta && DATA.bookMeta.assetVersion) || "15";
    if (cleaned.indexOf("?v=") !== -1 || cleaned.indexOf("&v=") !== -1) {
      return cleaned;
    }
    return cleaned + (cleaned.indexOf("?") === -1 ? "?v=" : "&v=") + encodeURIComponent(ver);
  }

  function resolveAudioPath(rawPath, pack) {
    if (!rawPath) {
      return null;
    }
    var activePack = pack === "edge" ? "edge" : "mimo";
    var cleaned = String(rawPath).trim();
    if (!cleaned) {
      return null;
    }
    if (cleaned === "./assets/audio/bgm-gentle.mp3" || /\/bgm-gentle\.mp3$/i.test(cleaned)) {
      return withAssetVersion("./assets/audio/bgm-gentle.mp3");
    }
    var prefix = "./assets/audio/";
    if (cleaned.indexOf(prefix) === 0) {
      var rest = cleaned.slice(prefix.length).replace(/^(mimo|edge)\//, "");
      return withAssetVersion(prefix + activePack + "/" + rest);
    }
    return withAssetVersion(cleaned);
  }

  function getManifestPath(pack) {
    return withAssetVersion("./assets/audio/" + (pack === "edge" ? "edge" : "mimo") + "/audio-manifest.json");
  }

  function safeStorageGet(key) {
    try {
      return global.localStorage ? global.localStorage.getItem(key) : null;
    } catch (_err) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(key, value);
      }
    } catch (_err) {
      // 忽略隐私模式或禁用存储
    }
  }

  function loadInitialVoicePack() {
    try {
      var params = new URLSearchParams(global.location.search || "");
      var queryVoice = (params.get("voice") || "").toLowerCase();
      if (queryVoice === "mimo" || queryVoice === "edge") {
        safeStorageSet(STORAGE_KEYS.voicePack, queryVoice);
        return queryVoice;
      }
    } catch (_err) {
      // 忽略旧环境 URLSearchParams 异常
    }
    var saved = (safeStorageGet(STORAGE_KEYS.voicePack) || "").toLowerCase();
    if (saved === "mimo" || saved === "edge") {
      return saved;
    }
    return "mimo";
  }

  function loadSavedTreasures() {
    var raw = safeStorageGet(STORAGE_KEYS.treasures);
    if (!raw) {
      return {};
    }
    try {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        var map = {};
        for (var i = 0; i < parsed.length; i += 1) {
          if (typeof parsed[i] === "string") {
            map[parsed[i]] = true;
          }
        }
        return map;
      }
    } catch (_err) {
      // 忽略坏数据
    }
    return {};
  }

  function saveUnlockedTreasures() {
    var ids = Object.keys(state.unlockedTreasures).filter(function (id) {
      return Boolean(state.unlockedTreasures[id]);
    });
    safeStorageSet(STORAGE_KEYS.treasures, JSON.stringify(ids));
  }

  function buildFallbackManifest(pack) {
    return {
      version: "fallback",
      pack: pack,
      loadedFromFile: false,
      files: {},
      happyBirthdayLyrics: [
        { start: 0.2, end: 8.0, text: "🎵 Happy Birthday · Ukulele Intro", zh: "乌克丽丽欢乐前奏响起，准备一起大合唱！" },
        { start: 8.05, end: 12.45, text: "Happy Birthday to you,", zh: "祝你生日快乐，" },
        { start: 12.48, end: 16.95, text: "Happy Birthday to you,", zh: "祝你生日快乐，" },
        { start: 16.98, end: 23.45, text: "Happy Birthday, happy birthday,", zh: "祝亲爱的 Kiki 五岁生日快乐，" },
        { start: 23.48, end: 32.8, text: "Happy Birthday to you!", zh: "祝你生日快乐！🎉" }
      ]
    };
  }

  function loadManifest(pack) {
    if (state.manifests[pack] && state.manifests[pack].loadedFromFile) {
      updateVoiceUiMetadata();
      return Promise.resolve(state.manifests[pack]);
    }
    return fetch(getManifestPath(pack), { cache: "no-store" })
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error("HTTP " + resp.status);
        }
        return resp.json();
      })
      .then(function (json) {
        json.loadedFromFile = true;
        state.manifests[pack] = json;
        updateVoiceUiMetadata();
        if (state.currentPage === 8) {
          updateKaraokeDisplay();
        }
        return json;
      })
      .catch(function () {
        if (!state.manifests[pack]) {
          state.manifests[pack] = buildFallbackManifest(pack);
        }
        updateVoiceUiMetadata();
        if (state.currentPage === 8) {
          updateKaraokeDisplay();
        }
        return state.manifests[pack];
      });
  }

  function getActiveManifest() {
    return state.manifests[state.voicePack] || buildFallbackManifest(state.voicePack);
  }

  function fadeAudioVolume(audioEl, targetVol, durationMs, onDone) {
    var prevRaf = audioFadeRafs.get(audioEl);
    if (prevRaf) {
      global.cancelAnimationFrame(prevRaf);
      audioFadeRafs.delete(audioEl);
    }
    var clampedTarget = Math.max(0, Math.min(1, targetVol));
    var startVol = typeof audioEl.volume === "number" ? audioEl.volume : clampedTarget;
    if (durationMs <= 16 || Math.abs(startVol - clampedTarget) < 0.005) {
      audioEl.volume = clampedTarget;
      if (onDone) {
        onDone();
      }
      return;
    }

    var startTs = global.performance ? global.performance.now() : Date.now();
    function step(nowTs) {
      var now = nowTs || Date.now();
      var t = Math.min(1, (now - startTs) / durationMs);
      var eased = 1 - Math.pow(1 - t, 2);
      audioEl.volume = Math.max(0, Math.min(1, startVol + (clampedTarget - startVol) * eased));
      if (t < 1) {
        var nextId = global.requestAnimationFrame(step);
        audioFadeRafs.set(audioEl, nextId);
      } else {
        audioFadeRafs.delete(audioEl);
        if (onDone) {
          onDone();
        }
      }
    }
    var rafId = global.requestAnimationFrame(step);
    audioFadeRafs.set(audioEl, rafId);
  }

  function getTargetBgmVolume(mode) {
    if (state.musicMuted) {
      return 0;
    }
    var base = mode === "birthday" ? BASE_BIRTHDAY_VOL : BASE_GENTLE_VOL;
    return state.isVoicePlaying ? base * DUCK_FACTOR : base;
  }

  function applyBgmDucking(isDucking) {
    state.isVoicePlaying = Boolean(isDucking);
    if (!state.audioUnlocked || state.musicMuted) {
      return;
    }
    var dur = isDucking ? 200 : 450;
    if (state.activeBgmMode === "birthday") {
      if (!birthdaySongAudio.paused) {
        fadeAudioVolume(birthdaySongAudio, getTargetBgmVolume("birthday"), dur);
      }
    } else if (!bgmGentleAudio.paused) {
      fadeAudioVolume(bgmGentleAudio, getTargetBgmVolume("gentle"), dur);
    }
  }

  function getDesiredBgmMode() {
    var page = getPageByNumber(state.currentPage);
    if (page.bgmMode === "birthday") {
      return "birthday";
    }
    if (page.pageNumber === 7 && state.pageState.p7.allBlown) {
      return "birthday";
    }
    return "gentle";
  }

  function safePlayAudio(audioEl, onSuccess, onBlockedOrError) {
    try {
      var playPromise = audioEl.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(function () {
            if (onSuccess) {
              onSuccess();
            }
          })
          .catch(function (err) {
            if (onBlockedOrError) {
              onBlockedOrError(err);
            }
          });
      } else if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      if (onBlockedOrError) {
        onBlockedOrError(err);
      }
    }
  }

  function syncBgmSources(forceRestartBirthday) {
    if (!state.audioUnlocked) {
      return;
    }
    var gentleResolved = resolveAudioPath(DATA.bgm.gentle, state.voicePack);
    if (bgmGentleAudio.getAttribute("data-src") !== gentleResolved) {
      bgmGentleAudio.setAttribute("data-src", gentleResolved);
      bgmGentleAudio.src = gentleResolved;
    }

    var birthdayResolved = resolveAudioPath(DATA.bgm.birthdaySong, state.voicePack);
    var birthdayChanged = birthdaySongAudio.getAttribute("data-src") !== birthdayResolved;
    if (birthdayChanged || forceRestartBirthday) {
      birthdaySongAudio.setAttribute("data-src", birthdayResolved);
      birthdaySongAudio.src = birthdayResolved;
      birthdaySongAudio.currentTime = 0;
    }
  }

  function ensureBgmForState(options) {
    var opts = options || {};
    var desiredMode = getDesiredBgmMode();
    var prevMode = state.activeBgmMode;
    state.activeBgmMode = desiredMode;

    syncBgmSources(Boolean(opts.restartBirthday));

    if (state.musicMuted || !state.audioUnlocked) {
      fadeAudioVolume(bgmGentleAudio, 0, 180, function () {
        bgmGentleAudio.pause();
      });
      fadeAudioVolume(birthdaySongAudio, 0, 180, function () {
        birthdaySongAudio.pause();
      });
      stopKaraokeLoop();
      updateAudioStatusIndicators();
      return;
    }

    if (desiredMode === "birthday") {
      if (!bgmGentleAudio.paused) {
        fadeAudioVolume(bgmGentleAudio, 0, 1200, function () {
          bgmGentleAudio.pause();
        });
      }
      var shouldStartBirthday =
        prevMode !== "birthday" || birthdaySongAudio.paused || opts.restartBirthday;
      if (shouldStartBirthday) {
        if (opts.restartBirthday || birthdaySongAudio.ended || prevMode !== "birthday") {
          try {
            birthdaySongAudio.currentTime = 0;
          } catch (_err) {
            // 忽略 seek 异常
          }
        }
        birthdaySongAudio.volume = 0;
        safePlayAudio(
          birthdaySongAudio,
          function () {
            fadeAudioVolume(birthdaySongAudio, getTargetBgmVolume("birthday"), 900);
            startKaraokeLoop();
            updateAudioStatusIndicators();
          },
          function () {
            updateAudioStatusIndicators();
          }
        );
      } else {
        fadeAudioVolume(birthdaySongAudio, getTargetBgmVolume("birthday"), 350);
        startKaraokeLoop();
      }
    } else {
      stopKaraokeLoop();
      if (!birthdaySongAudio.paused) {
        fadeAudioVolume(birthdaySongAudio, 0, 650, function () {
          birthdaySongAudio.pause();
          try {
            birthdaySongAudio.currentTime = 0;
          } catch (_err) {
            // 忽略
          }
        });
      }
      if (bgmGentleAudio.paused) {
        bgmGentleAudio.volume = 0;
        safePlayAudio(
          bgmGentleAudio,
          function () {
            fadeAudioVolume(bgmGentleAudio, getTargetBgmVolume("gentle"), 850);
            updateAudioStatusIndicators();
          },
          function () {
            updateAudioStatusIndicators();
          }
        );
      } else {
        fadeAudioVolume(bgmGentleAudio, getTargetBgmVolume("gentle"), 400);
      }
    }
    updateAudioStatusIndicators();
  }

  function unlockAudio() {
    Sfx.unlock();
    if (state.audioUnlocked) {
      return;
    }
    state.audioUnlocked = true;
    setAudioChip("");
    ensureBgmForState();
    updateAudioStatusIndicators();
  }

  function stopVoice() {
    state.voicePlaybackToken += 1;
    state.pendingSceneVoice = null;
    if (state.narrationTimer) {
      global.clearTimeout(state.narrationTimer);
      state.narrationTimer = null;
    }
    if (!voiceAudio.paused) {
      voiceAudio.pause();
    }
    try {
      voiceAudio.currentTime = 0;
    } catch (_err) {
      // 忽略
    }
    state.currentVoiceRawPath = null;
    applyBgmDucking(false);
    updateAudioStatusIndicators();
  }

  function playVoice(rawPath, options) {
    var opts = options || {};
    if (!rawPath) {
      return;
    }
    unlockAudio();

    if (state.narrationTimer) {
      global.clearTimeout(state.narrationTimer);
      state.narrationTimer = null;
    }
    if (!voiceAudio.paused) {
      voiceAudio.pause();
    }

    var resolved = resolveAudioPath(rawPath, state.voicePack);
    if (!resolved) {
      return;
    }

    state.voicePlaybackToken += 1;
    var token = state.voicePlaybackToken;
    state.currentVoiceRawPath = rawPath;
    state.lastPageVoiceRawPath = rawPath;

    voiceAudio.src = resolved;
    voiceAudio.volume = 0.96;

    function finishCleanup(wasError) {
      if (token !== state.voicePlaybackToken) {
        return;
      }
      state.currentVoiceRawPath = null;
      applyBgmDucking(false);
      updateAudioStatusIndicators();
      if (wasError && !opts.silentOnMissing) {
        setAudioChip("语音加载中");
      }
      if (!wasError && typeof opts.onEnded === "function") {
        opts.onEnded();
      }
    }

    voiceAudio.onended = function () {
      finishCleanup(false);
    };
    voiceAudio.onerror = function () {
      finishCleanup(true);
    };

    applyBgmDucking(true);
    setAudioChip("");
    updateAudioStatusIndicators();

    safePlayAudio(
      voiceAudio,
      function () {
        if (token !== state.voicePlaybackToken) {
          return;
        }
        updateAudioStatusIndicators();
      },
      function (err) {
        if (token !== state.voicePlaybackToken) {
          return;
        }
        applyBgmDucking(false);
        state.currentVoiceRawPath = null;
        if (err && err.name === "NotAllowedError") {
          setAudioChip("点一下开启声音 🔊");
        }
        updateAudioStatusIndicators();
      }
    );
  }

  function findActorById(page, actorId) {
    if (!page || !Array.isArray(page.actors) || !actorId) {
      return null;
    }
    for (var i = 0; i < page.actors.length; i += 1) {
      if (page.actors[i].id === actorId) {
        return page.actors[i];
      }
    }
    return null;
  }

  function queueOrPlaySceneVoice(pageNum, opts) {
    var cfg = opts || {};
    if (state.currentPage !== pageNum || !state.audioUnlocked) {
      return false;
    }
    var page = getPageByNumber(pageNum);
    if (!page) {
      return false;
    }
    var isNarrating = Boolean(page.narrationAudio && state.currentVoiceRawPath === page.narrationAudio && !voiceAudio.paused);
    var isAnyVoiceBusy = Boolean(state.currentVoiceRawPath && !voiceAudio.paused);
    if (isNarrating || isAnyVoiceBusy) {
      if (cfg.priority === "high" && isNarrating) {
        state.pendingSceneVoice = {
          pageNum: pageNum,
          actorId: cfg.actorId || null,
          rawPath: cfg.rawPath || null
        };
      }
      return false;
    }
    var actor = cfg.actorId ? findActorById(page, cfg.actorId) : null;
    var ok = false;
    if (cfg.rawPath) {
      playVoice(cfg.rawPath);
      ok = true;
    } else if (actor) {
      ok = playActorVoiceSmart(actor, pageNum);
    }
    if (ok && cfg.actorId && global.KikiPopup3D && typeof global.KikiPopup3D.nudgeActor === "function") {
      global.KikiPopup3D.nudgeActor(cfg.actorId);
    }
    return ok;
  }

  function runPagePostNarrationFollowUp(pageNum) {
    if (state.currentPage !== pageNum || !state.audioUnlocked) {
      return;
    }
    var page = getPageByNumber(pageNum);
    if (!page) {
      return;
    }
    if (state.pendingSceneVoice && state.pendingSceneVoice.pageNum === pageNum) {
      var queued = state.pendingSceneVoice;
      state.pendingSceneVoice = null;
      state.pageAutoSpoken[pageNum] = true;
      var qActor = queued.actorId ? findActorById(page, queued.actorId) : null;
      if (queued.rawPath) {
        playVoice(queued.rawPath);
      } else if (qActor) {
        playActorVoiceSmart(qActor, pageNum);
      }
      if (queued.actorId && global.KikiPopup3D && typeof global.KikiPopup3D.nudgeActor === "function") {
        global.KikiPopup3D.nudgeActor(queued.actorId);
      }
      return;
    }
    if (state.pageAutoSpoken[pageNum] || (state.currentVoiceRawPath && !voiceAudio.paused)) {
      return;
    }

    var pickActorId = null;
    var explicitPath = null;
    if (pageNum === 1) {
      pickActorId = "p1-kiki";
      explicitPath = "./assets/audio/kiki-1.mp3";
    } else if (pageNum === 2 && !state.pageState.p2.opened) {
      // Wait for parcel delivery completion if P2 parcel is still flying in
      if (!state.pageAutoSpoken["p2-landed"]) {
        return;
      }
      pickActorId = "p2-jett";
      explicitPath = "./assets/audio/p2-jett.mp3";
    } else if (pageNum === 3 && !state.pageState.p3.won) {
      pickActorId = "p3-bluey";
      explicitPath = "./assets/audio/p3-bluey.mp3";
    } else if (pageNum === 4 && !state.pageState.p4.cheered) {
      pickActorId = "p4-chase";
      explicitPath = "./assets/audio/chase-2.mp3";
    } else if (pageNum === 5 && !state.pageState.p5.won) {
      pickActorId = "p5-minifig-1";
      explicitPath = "./assets/audio/lego-2.mp3";
      if (typeof Sfx.playCarHorn === "function") {
        Sfx.playCarHorn();
      }
    } else if (pageNum === 6 && !state.pageState.p6.lightsOn) {
      pickActorId = "p6-dizzy";
      explicitPath = "./assets/audio/dizzy-3.mp3";
    } else if (pageNum === 7 && !state.pageState.p7.allBlown) {
      pickActorId = "p7-bingo";
      explicitPath = "./assets/audio/bingo-3.mp3";
    }
    if (!pickActorId || !explicitPath) {
      return;
    }
    state.pageAutoSpoken[pageNum] = true;
    playVoice(explicitPath, { silentOnMissing: true });
    if (global.KikiPopup3D && typeof global.KikiPopup3D.nudgeActor === "function") {
      global.KikiPopup3D.nudgeActor(pickActorId);
    }
  }

  function schedulePageNarration(page) {
    if (state.narrationTimer) {
      global.clearTimeout(state.narrationTimer);
    }
    if (!state.audioUnlocked || !page || !page.narrationAudio) {
      return;
    }
    var targetPageNum = page.pageNumber;
    state.narrationTimer = global.setTimeout(function () {
      state.narrationTimer = null;
      if (state.currentPage !== targetPageNum) {
        return;
      }
      var expectedToken = state.voicePlaybackToken + 1;
      playVoice(page.narrationAudio, {
        silentOnMissing: true,
        onEnded: function () {
          global.setTimeout(function () {
            if (state.currentPage === targetPageNum && state.voicePlaybackToken === expectedToken) {
              runPagePostNarrationFollowUp(targetPageNum);
            }
          }, 180);
        }
      });
    }, 320);
  }

  function playActorVoiceSmart(actor, pageNum) {
    if (!actor) {
      return false;
    }
    var pool = Array.isArray(actor.audioPool) && actor.audioPool.length > 0
      ? actor.audioPool
      : (actor.audio ? [actor.audio] : []);
    if (pool.length === 0) {
      return false;
    }
    if (state.currentVoiceRawPath && !voiceAudio.paused && pool.indexOf(state.currentVoiceRawPath) !== -1) {
      return false;
    }
    var pNum = pageNum || state.currentPage;
    var key = pNum + ":" + (actor.role || actor.id);
    var now = Date.now();
    var tr = state.actorVoiceTracker[key];
    if (!tr) {
      tr = { nextIdx: 0, spokenCount: 0, cooldownUntil: 0 };
      state.actorVoiceTracker[key] = tr;
    }
    if (now < tr.cooldownUntil) {
      return false;
    }
    var chosen = pool[tr.nextIdx % pool.length];
    tr.nextIdx = (tr.nextIdx + 1) % pool.length;
    tr.spokenCount += 1;
    if (tr.spokenCount >= pool.length) {
      tr.spokenCount = 0;
      tr.cooldownUntil = now + 12000;
    }
    playVoice(chosen);
    return true;
  }

  function setAudioChip(text) {
    if (!text) {
      dom.audioStatusChip.textContent = "";
      dom.audioStatusChip.classList.add("hidden");
      return;
    }
    dom.audioStatusChip.textContent = text;
    dom.audioStatusChip.classList.remove("hidden");
  }

  function switchVoicePack(newPack) {
    var normalized = newPack === "edge" ? "edge" : "mimo";
    unlockAudio();
    var wasVoicePlaying = Boolean(state.currentVoiceRawPath && !voiceAudio.paused);
    var activeVoicePath = state.currentVoiceRawPath || state.lastPageVoiceRawPath;
    var page = getPageByNumber(state.currentPage);
    var inBirthdaySongMode = state.activeBgmMode === "birthday";

    state.voicePack = normalized;
    safeStorageSet(STORAGE_KEYS.voicePack, normalized);
    updateVoiceUiMetadata();

    loadManifest(normalized).then(function () {
      if (state.currentPage === 8) {
        updateKaraokeDisplay();
      }
    });

    if (inBirthdaySongMode && !state.musicMuted) {
      stopVoice();
      ensureBgmForState({ restartBirthday: true });
    } else if (wasVoicePlaying && activeVoicePath) {
      playVoice(activeVoicePath, { silentOnMissing: true });
    } else if (page && page.narrationAudio) {
      playVoice(activeVoicePath || page.narrationAudio, { silentOnMissing: true });
    }

    showToast(
      normalized === "mimo"
        ? "已切换至：🌟 小米 MiMo 动漫版"
        : "已切换至：🎙️ Edge 卡通版"
    );
  }

  // ======================== 精灵元数据 & 宽高比例引擎 ========================

  function getSpritesBasePath() {
    return (DATA.bookMeta && DATA.bookMeta.spritesBasePath) || "./assets/sprites/";
  }

  function getSpriteSrc(fileName) {
    if (!fileName) {
      return "";
    }
    if (fileName.indexOf("./") === 0 || fileName.indexOf("/") === 0) {
      return withAssetVersion(fileName);
    }
    return withAssetVersion(getSpritesBasePath() + fileName);
  }

  function getSpriteAspectRatio(fileName) {
    var meta = state.spritesMeta;
    if (meta && fileName) {
      var stem = String(fileName).replace(/\.webp$/i, "");
      var entry =
        (meta.sprites && (meta.sprites[fileName] || meta.sprites[stem])) ||
        (meta.files && (meta.files[fileName] || meta.files[stem])) ||
        meta[fileName] ||
        meta[stem];
      if (entry) {
        if (typeof entry.aspectRatio === "number" && entry.aspectRatio > 0) {
          return entry.aspectRatio;
        }
        if (entry.width > 0 && entry.height > 0) {
          return entry.width / entry.height;
        }
      }
    }
    var defaults = (DATA.spriteConfig && DATA.spriteConfig.defaultRatios) || {};
    return defaults[fileName] || 0.9;
  }

  function getKikiCrownAnchor(isCheer) {
    var meta = state.spritesMeta;
    if (isCheer) {
      if (meta && meta.kikiCheerCrownAnchor && typeof meta.kikiCheerCrownAnchor.xPct === "number") {
        return meta.kikiCheerCrownAnchor;
      }
      return (
        (DATA.spriteConfig && DATA.spriteConfig.kikiCheerCrownAnchor) || {
          xPct: 50.6,
          yPct: 2.3,
          widthPct: 35.0,
          rotateDeg: -2
        }
      );
    }
    if (meta && meta.kikiCrownAnchor && typeof meta.kikiCrownAnchor.xPct === "number") {
      return meta.kikiCrownAnchor;
    }
    return (
      (DATA.spriteConfig && DATA.spriteConfig.kikiCrownAnchor) || {
        xPct: 54.5,
        yPct: 1.8,
        widthPct: 38.0,
        rotateDeg: -2
      }
    );
  }

  function getCakeCandleTips() {
    var defaults =
      (DATA.spriteConfig && DATA.spriteConfig.defaultCakeCandleTips) ||
      getPageByNumber(7).candles ||
      [];
    var meta = state.spritesMeta;
    if (meta && Array.isArray(meta.cakeCandleTips) && meta.cakeCandleTips.length > 0) {
      return meta.cakeCandleTips.map(function (tip, idx) {
        var idxNum = typeof tip.index === "number" ? tip.index : idx + 1;
        var base = defaults[idxNum - 1] || defaults[idx] || {};
        var xVal = typeof tip.xPct === "number" ? tip.xPct : (typeof tip.x === "number" ? tip.x : base.xPct || 50);
        var yVal = typeof tip.yPct === "number" ? tip.yPct : (typeof tip.y === "number" ? tip.y : base.yPct || 0.6);
        return {
          id: tip.id || base.id || "candle-" + idxNum,
          index: idxNum,
          label: tip.label || base.label || "第" + idxNum + "根蜡烛",
          color: tip.color || base.color || "#FFBE0B",
          xPct: xVal,
          yPct: yVal,
          x: xVal,
          y: yVal
        };
      });
    }
    return defaults;
  }

  function loadSpritesMeta() {
    var rawMetaPath = (DATA.bookMeta && DATA.bookMeta.spritesMetaPath) || "./assets/sprites/sprites-meta.json";
    var metaPath = withAssetVersion(rawMetaPath);
    return fetch(metaPath, { cache: "no-store" })
      .then(function (resp) {
        if (!resp.ok) {
          throw new Error("HTTP " + resp.status);
        }
        return resp.json();
      })
      .then(function (json) {
        state.spritesMeta = json;
        preloadCommonSprites();
        return json;
      })
      .catch(function () {
        return null;
      });
  }

  function preloadCommonSprites() {
    var files = Object.keys((DATA.spriteConfig && DATA.spriteConfig.defaultRatios) || {});
    files.forEach(function (f) {
      var img = new Image();
      img.src = getSpriteSrc(f);
    });
  }

  // ======================== Layer 3 Canvas 增强型粒子与特效引擎 ========================

  var FxEngine = (function () {
    var particles = [];
    var ambientMode = "none";
    var ambientTick = 0;
    var ribbonHooks = [];
    var rafId = null;

    var PALETTE = ["#FF5E7E", "#FFBE0B", "#3A86FF", "#2EC4B6", "#9B5DE5", "#FF8FAB", "#FFF3B0"];
    var PETAL_COLORS = ["#FFB3C6", "#FFC8DD", "#FFAFCC", "#FDE2E4", "#FFF1E6"];
    var BUTTERFLY_COLORS = ["#FF8FAB", "#CDB4DB", "#BDE0FE", "#FFD166", "#A7F3D0"];

    function syncCanvasSize() {
      var canvas = dom.fxCanvas;
      var rect = dom.stageScene.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return { w: 0, h: 0, dpr: 1 };
      }
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var targetW = Math.round(rect.width * dpr);
      var targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      return { w: targetW, h: targetH, dpr: dpr, cssW: rect.width, cssH: rect.height };
    }

    function pctToPx(xPct, yPct, dims) {
      return {
        x: (xPct / 100) * dims.w,
        y: (yPct / 100) * dims.h
      };
    }

    function ensureLoop() {
      if (rafId !== null) {
        return;
      }
      rafId = global.requestAnimationFrame(tick);
    }

    function spawnAmbientParticles(dims) {
      ambientTick += 1;
      if (ambientMode === "petals-butterflies") {
        if (ambientTick % 14 === 0) {
          particles.push({
            kind: "petal",
            x: Math.random() * dims.w,
            y: -12 * dims.dpr,
            vx: (Math.random() - 0.35) * 0.85 * dims.dpr,
            vy: (0.75 + Math.random() * 0.7) * dims.dpr,
            gravity: 0,
            drag: 1,
            size: (5 + Math.random() * 4.5) * dims.dpr,
            color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
            rot: Math.random() * Math.PI,
            vRot: (Math.random() - 0.5) * 0.04,
            life: 0,
            maxLife: 240,
            alphaStart: 0.88,
            wobble: 0.65 * dims.dpr,
            seed: Math.random() * 6.28
          });
        }
        if (ambientTick % 65 === 0) {
          var fromLeft = Math.random() > 0.5;
          particles.push({
            kind: "butterfly",
            x: fromLeft ? -16 * dims.dpr : dims.w + 16 * dims.dpr,
            y: dims.h * (0.15 + Math.random() * 0.45),
            vx: (fromLeft ? 1 : -1) * (1.2 + Math.random() * 0.9) * dims.dpr,
            vy: (Math.random() - 0.5) * 0.45 * dims.dpr,
            gravity: 0,
            drag: 1,
            size: (6.5 + Math.random() * 3.5) * dims.dpr,
            color: BUTTERFLY_COLORS[Math.floor(Math.random() * BUTTERFLY_COLORS.length)],
            rot: fromLeft ? 0.2 : -0.2,
            vRot: 0,
            life: 0,
            maxLife: 300,
            alphaStart: 0.92,
            wobble: 0.95 * dims.dpr,
            wobbleY: 0.9 * dims.dpr,
            seed: Math.random() * 6.28
          });
        }
      } else if (ambientMode === "sparkles" || ambientMode === "warm-sparkles") {
        if (ambientTick % 24 === 0) {
          particles.push({
            kind: "star",
            x: Math.random() * dims.w,
            y: dims.h * (0.1 + Math.random() * 0.65),
            vx: (Math.random() - 0.5) * 0.25 * dims.dpr,
            vy: -(0.22 + Math.random() * 0.35) * dims.dpr,
            gravity: 0,
            drag: 0.995,
            size: (2.8 + Math.random() * 2.8) * dims.dpr,
            color: ambientMode === "warm-sparkles" ? "#FFE066" : "#FFF8D6",
            rot: Math.random() * Math.PI,
            vRot: 0.03,
            life: 0,
            maxLife: 85,
            alphaStart: 0.7,
            wobble: 0.2 * dims.dpr,
            seed: Math.random() * 6.28
          });
        }
      } else if (ambientMode === "fireflies") {
        if (ambientTick % 16 === 0) {
          particles.push({
            kind: "glow-orb",
            x: Math.random() * dims.w,
            y: dims.h * (0.18 + Math.random() * 0.55),
            vx: (Math.random() - 0.5) * 0.5 * dims.dpr,
            vy: -(0.15 + Math.random() * 0.4) * dims.dpr,
            gravity: 0,
            drag: 0.995,
            size: (3 + Math.random() * 3.5) * dims.dpr,
            color: Math.random() > 0.4 ? "#FFE066" : "#FFAFCC",
            rot: 0,
            vRot: 0,
            life: 0,
            maxLife: 110,
            alphaStart: 0.85,
            wobble: 0.45 * dims.dpr,
            seed: Math.random() * 6.28
          });
        }
      } else if (ambientMode === "fireworks-ribbons") {
        if (ambientTick % 18 === 0) {
          particles.push({
            kind: "star",
            x: Math.random() * dims.w,
            y: dims.h * (0.06 + Math.random() * 0.48),
            vx: 0,
            vy: 0,
            gravity: 0,
            drag: 1,
            size: (2.4 + Math.random() * 3) * dims.dpr,
            color: "#FFF3B0",
            rot: Math.random() * Math.PI,
            vRot: 0.02,
            life: 0,
            maxLife: 70,
            alphaStart: 0.85,
            wobble: 0,
            seed: 0
          });
        }
      }
    }

    function drawParticle(ctx, p) {
      if (p.kind === "smoke") {
        var progress = p.life / p.maxLife;
        var radius = p.size * (1 + progress * 2.1);
        var smokeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        smokeGrad.addColorStop(0, "rgba(255, 252, 245, 0.72)");
        smokeGrad.addColorStop(0.6, "rgba(240, 240, 248, 0.35)");
        smokeGrad.addColorStop(1, "rgba(240, 240, 248, 0)");
        ctx.fillStyle = smokeGrad;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "butterfly") {
        var flap = 0.32 + 0.68 * Math.abs(Math.sin(p.life * 0.25 + p.seed));
        var bs = p.size;
        ctx.fillStyle = p.color;
        // 左翅
        ctx.save();
        ctx.scale(flap, 1);
        ctx.beginPath();
        ctx.ellipse(-bs * 0.52, -bs * 0.25, bs * 0.62, bs * 0.46, -0.35, 0, Math.PI * 2);
        ctx.ellipse(-bs * 0.42, bs * 0.3, bs * 0.46, bs * 0.35, 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 右翅
        ctx.save();
        ctx.scale(flap, 1);
        ctx.beginPath();
        ctx.ellipse(bs * 0.52, -bs * 0.25, bs * 0.62, bs * 0.46, 0.35, 0, Math.PI * 2);
        ctx.ellipse(bs * 0.42, bs * 0.3, bs * 0.46, bs * 0.35, -0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // 身体
        ctx.fillStyle = "#5b3b4c";
        ctx.beginPath();
        ctx.ellipse(0, 0, bs * 0.14, bs * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "petal") {
        var ps = p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, ps * 0.7, ps * 0.38, 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "glow-orb") {
        var gs = p.size * 2.2;
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, gs);
        g.addColorStop(0, p.color);
        g.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, gs, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "heart") {
        var hs = p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, hs * 0.35);
        ctx.bezierCurveTo(-hs * 0.9, -hs * 0.4, -hs * 0.55, -hs * 1.05, 0, -hs * 0.45);
        ctx.bezierCurveTo(hs * 0.55, -hs * 1.05, hs * 0.9, -hs * 0.4, 0, hs * 0.35);
        ctx.fill();
      } else if (p.kind === "star") {
        var sr = p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        for (var k = 0; k < 4; k += 1) {
          var angle = (k * Math.PI) / 2;
          ctx.lineTo(Math.cos(angle) * sr, Math.sin(angle) * sr);
          ctx.lineTo(Math.cos(angle + Math.PI / 4) * sr * 0.35, Math.sin(angle + Math.PI / 4) * sr * 0.35);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === "confetti") {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.6, -p.size * 0.35, p.size * 1.2, p.size * 0.7);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawRibbonHooks(ctx, dims) {
      if (!ribbonHooks.length) {
        return;
      }
      for (var i = 0; i < ribbonHooks.length; i += 1) {
        ribbonHooks[i](ctx, dims, ambientTick);
      }
    }

    function tick() {
      var canvas = dom.fxCanvas;
      var ctx = canvas.getContext("2d");
      if (!ctx) {
        particles = [];
        rafId = null;
        return;
      }
      var dims = syncCanvasSize();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (ambientMode !== "none" && dims.w > 0) {
        spawnAmbientParticles(dims);
      }

      drawRibbonHooks(ctx, dims);

      for (var i = particles.length - 1; i >= 0; i -= 1) {
        var p = particles[i];
        p.life += 1;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= p.drag;
        p.vy = p.vy * p.drag + p.gravity;
        if (p.wobble) {
          p.x += Math.sin(p.life * 0.1 + p.seed) * p.wobble;
        }
        if (p.wobbleY) {
          p.y += Math.cos(p.life * 0.14 + p.seed) * p.wobbleY;
        }
        p.rot += p.vRot;
        var lifeRatio = p.life / p.maxLife;
        var alpha = p.alphaStart * (lifeRatio < 0.12 ? lifeRatio / 0.12 : 1 - (lifeRatio - 0.12) / 0.88);

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawParticle(ctx, p);
        ctx.restore();
      }

      if (particles.length > 0 || ambientMode !== "none" || ribbonHooks.length > 0) {
        rafId = global.requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }

    function setAmbientMode(mode) {
      ambientMode = mode || "none";
      if (ambientMode !== "none") {
        ensureLoop();
      }
    }

    function registerRibbonHook(fn) {
      ribbonHooks.push(fn);
      ensureLoop();
    }

    function clearRibbonHooks() {
      ribbonHooks = [];
    }

    function burstConfetti(xPct, yPct, count) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var pt = pctToPx(xPct, yPct, dims);
      var total = count || 28;
      for (var i = 0; i < total; i += 1) {
        var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
        var speed = (2.4 + Math.random() * 5.2) * dims.dpr;
        particles.push({
          kind: i % 3 === 0 ? "star" : "confetti",
          x: pt.x,
          y: pt.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1.5 * dims.dpr,
          gravity: 0.14 * dims.dpr,
          drag: 0.97,
          size: (4.5 + Math.random() * 4.5) * dims.dpr,
          color: PALETTE[i % PALETTE.length],
          rot: Math.random() * Math.PI,
          vRot: (Math.random() - 0.5) * 0.25,
          life: 0,
          maxLife: 45 + Math.random() * 30,
          alphaStart: 0.95,
          wobble: 0.6 * dims.dpr,
          seed: Math.random() * 6
        });
      }
      ensureLoop();
    }

    function burstSparkles(xPct, yPct, count) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var pt = pctToPx(xPct, yPct, dims);
      var total = count || 16;
      for (var i = 0; i < total; i += 1) {
        var angle = (Math.PI * 2 * i) / total + Math.random() * 0.4;
        var speed = (1.4 + Math.random() * 3.2) * dims.dpr;
        particles.push({
          kind: i % 2 === 0 ? "star" : "dot",
          x: pt.x,
          y: pt.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 0.03 * dims.dpr,
          drag: 0.95,
          size: (4 + Math.random() * 4) * dims.dpr,
          color: PALETTE[i % PALETTE.length],
          rot: Math.random() * Math.PI,
          vRot: 0.08,
          life: 0,
          maxLife: 32 + Math.random() * 18,
          alphaStart: 0.96,
          wobble: 0,
          seed: 0
        });
      }
      ensureLoop();
    }

    function burstHearts(xPct, yPct, count) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var pt = pctToPx(xPct, yPct, dims);
      var total = count || 16;
      var pinks = ["#FF5E7E", "#FF8FAB", "#FFB3C6", "#FF70A6"];
      for (var i = 0; i < total; i += 1) {
        var angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
        var speed = (1.5 + Math.random() * 3.1) * dims.dpr;
        particles.push({
          kind: "heart",
          x: pt.x + (Math.random() - 0.5) * 20 * dims.dpr,
          y: pt.y + (Math.random() - 0.5) * 14 * dims.dpr,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.8 * dims.dpr,
          gravity: 0.035 * dims.dpr,
          drag: 0.965,
          size: (6.5 + Math.random() * 4.5) * dims.dpr,
          color: pinks[i % pinks.length],
          rot: (Math.random() - 0.5) * 0.5,
          vRot: (Math.random() - 0.5) * 0.04,
          life: 0,
          maxLife: 46 + Math.random() * 20,
          alphaStart: 0.98,
          wobble: 0.5 * dims.dpr,
          seed: Math.random() * 6
        });
      }
      ensureLoop();
    }

    function spawnTrailParticle(xPct, yPct, kind, color) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var pt = pctToPx(xPct, yPct, dims);
      var chosenColor = color || PALETTE[Math.floor(Math.random() * PALETTE.length)];
      particles.push({
        kind: kind || "star",
        x: pt.x + (Math.random() - 0.5) * 10 * dims.dpr,
        y: pt.y + (Math.random() - 0.5) * 10 * dims.dpr,
        vx: (Math.random() - 0.5) * 0.8 * dims.dpr,
        vy: (Math.random() - 0.5) * 0.8 * dims.dpr,
        gravity: 0.015 * dims.dpr,
        drag: 0.95,
        size: (kind === "heart" ? 6.5 : 4.2 + Math.random() * 3) * dims.dpr,
        color: chosenColor,
        rot: Math.random() * Math.PI,
        vRot: 0.08,
        life: 0,
        maxLife: 24 + Math.random() * 14,
        alphaStart: 0.95,
        wobble: 0.25 * dims.dpr,
        seed: Math.random() * 6
      });
      ensureLoop();
    }

    function spawnSmoke(xPct, yPct) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var pt = pctToPx(xPct, yPct, dims);
      for (var i = 0; i < 6; i += 1) {
        particles.push({
          kind: "smoke",
          x: pt.x + (Math.random() - 0.5) * 8 * dims.dpr,
          y: pt.y - i * 1.5 * dims.dpr,
          vx: (Math.random() - 0.5) * 0.45 * dims.dpr,
          vy: -(0.8 + Math.random() * 0.95) * dims.dpr,
          gravity: -0.012 * dims.dpr,
          drag: 0.992,
          size: (3.8 + Math.random() * 3.8) * dims.dpr,
          color: "#ffffff",
          rot: 0,
          vRot: 0,
          life: 0,
          maxLife: 58 + Math.random() * 24,
          alphaStart: 0.68,
          wobble: 0.85 * dims.dpr,
          seed: Math.random() * 6
        });
      }
      ensureLoop();
    }

    function spawnContinuousSmoke(xPct, yPct, pageToken) {
      var bursts = 7;
      for (var b = 0; b < bursts; b += 1) {
        (function (delayIdx) {
          global.setTimeout(function () {
            if (state.pageSessionToken === pageToken && state.currentPage === 7) {
              spawnSmoke(xPct, yPct);
            }
          }, delayIdx * 200);
        })(b);
      }
    }

    function burstFirework(xPct, yPct, withHearts) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var pt = pctToPx(xPct, yPct, dims);
      var total = 36;
      for (var i = 0; i < total; i += 1) {
        var angle = (Math.PI * 2 * i) / total + (Math.random() - 0.5) * 0.18;
        var speed = (1.8 + Math.random() * 4.4) * dims.dpr;
        var kind = withHearts && i % 7 === 0 ? "heart" : i % 3 === 0 ? "star" : "dot";
        particles.push({
          kind: kind,
          x: pt.x,
          y: pt.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 0.055 * dims.dpr,
          drag: 0.965,
          size: (kind === "heart" ? 7.5 : 4.2 + Math.random() * 3.5) * dims.dpr,
          color: PALETTE[i % PALETTE.length],
          rot: Math.random() * 0.4 - 0.2,
          vRot: 0.03,
          life: 0,
          maxLife: 48 + Math.random() * 24,
          alphaStart: 0.98,
          wobble: 0,
          seed: 0
        });
      }
      ensureLoop();
    }

    function spawnWindGust(fromX, fromY, toX, toY) {
      var dims = syncCanvasSize();
      if (!dims.w) {
        return;
      }
      var p1 = pctToPx(fromX, fromY, dims);
      var p2 = pctToPx(toX, toY, dims);
      var dx = p2.x - p1.x;
      var dy = p2.y - p1.y;
      var dist = Math.max(20, Math.hypot(dx, dy));
      for (var i = 0; i < 12; i += 1) {
        var speed = (dist / 26) * (0.78 + Math.random() * 0.42);
        particles.push({
          kind: i % 4 === 0 ? "star" : "smoke",
          x: p1.x + (Math.random() - 0.5) * 14 * dims.dpr,
          y: p1.y + (Math.random() - 0.5) * 14 * dims.dpr,
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed + (Math.random() - 0.5) * 0.6 * dims.dpr,
          gravity: -0.008 * dims.dpr,
          drag: 0.96,
          size: (4 + Math.random() * 4) * dims.dpr,
          color: i % 4 === 0 ? "#BAE6FD" : "#FFFFFF",
          rot: 0,
          vRot: 0.08,
          life: 0,
          maxLife: 24 + Math.random() * 12,
          alphaStart: 0.78,
          wobble: 0.4 * dims.dpr,
          seed: Math.random() * 6
        });
      }
      ensureLoop();
    }

    function launchFireworkRocket(startX, startY, targetX, targetY, pageToken) {
      runTween({
        duration: 420,
        onUpdate: function (t) {
          if (state.pageSessionToken !== pageToken || state.currentPage !== 8) {
            return;
          }
          var ease = 1 - Math.pow(1 - t, 2);
          var x = startX + (targetX - startX) * ease;
          var y = startY + (targetY - startY) * ease;
          spawnTrailParticle(x, y, Math.random() > 0.45 ? "star" : "dot", "#FFE066");
        },
        onDone: function () {
          if (state.pageSessionToken !== pageToken || state.currentPage !== 8) {
            return;
          }
          Sfx.playFirework();
          burstFirework(targetX, targetY, true);
        }
      });
    }

    function clear() {
      particles = [];
      ambientMode = "none";
      ribbonHooks = [];
      var ctx = dom.fxCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, dom.fxCanvas.width, dom.fxCanvas.height);
      }
    }

    return {
      setAmbientMode: setAmbientMode,
      registerRibbonHook: registerRibbonHook,
      clearRibbonHooks: clearRibbonHooks,
      burstConfetti: burstConfetti,
      burstSparkles: burstSparkles,
      burstHearts: burstHearts,
      spawnTrailParticle: spawnTrailParticle,
      spawnSmoke: spawnSmoke,
      spawnContinuousSmoke: spawnContinuousSmoke,
      spawnWindGust: spawnWindGust,
      burstFirework: burstFirework,
      launchFireworkRocket: launchFireworkRocket,
      clear: clear
    };
  })();

  // ======================== 轨迹与演出动画控制器 ========================

  var activeTweens = [];

  function stopAllTweens() {
    for (var i = 0; i < activeTweens.length; i += 1) {
      if (activeTweens[i].rafId) {
        global.cancelAnimationFrame(activeTweens[i].rafId);
      }
      activeTweens[i].cancelled = true;
    }
    activeTweens = [];
  }

  function runTween(opts) {
    var token = state.pageSessionToken;
    var tween = { rafId: null, cancelled: false };
    activeTweens.push(tween);
    var duration = Math.max(16, opts.duration || 1000);
    var startTs = global.performance ? global.performance.now() : Date.now();

    function frame(nowTs) {
      if (tween.cancelled || state.pageSessionToken !== token) {
        return;
      }
      var now = nowTs || Date.now();
      var t = Math.min(1, (now - startTs) / duration);
      if (opts.onUpdate) {
        opts.onUpdate(t);
      }
      if (t < 1) {
        tween.rafId = global.requestAnimationFrame(frame);
      } else {
        tween.rafId = null;
        if (opts.onDone) {
          opts.onDone();
        }
      }
    }

    tween.rafId = global.requestAnimationFrame(frame);
    return tween;
  }

  function quadBezier(p0, p1, p2, t) {
    var u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  }

  function cubicBezier(p0, p1, p2, p3, t) {
    var u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  // ======================== 辅助与状态管理 ========================

  function getPageByNumber(num) {
    var idx = Math.max(0, Math.min(DATA.pages.length - 1, Number(num) - 1));
    return DATA.pages[idx];
  }

  function findVoiceById(page, voiceId) {
    if (!page || !Array.isArray(page.voices)) {
      return null;
    }
    for (var i = 0; i < page.voices.length; i += 1) {
      if (page.voices[i].id === voiceId) {
        return page.voices[i];
      }
    }
    return null;
  }

  function getTreasureById(id) {
    for (var i = 0; i < DATA.treasures.length; i += 1) {
      if (DATA.treasures[i].id === id) {
        return DATA.treasures[i];
      }
    }
    return null;
  }

  function unlockTreasure(treasureId, originX, originY) {
    if (!treasureId) {
      return;
    }
    var treasure = getTreasureById(treasureId);
    if (!treasure) {
      return;
    }
    var isFirst = !state.unlockedTreasures[treasureId];
    state.unlockedTreasures[treasureId] = true;
    saveUnlockedTreasures();
    if (isFirst) {
      state.justUnlockedTreasureId = treasureId;
      showToast("获得生日宝物：" + treasure.emoji + " " + treasure.name + "！");
      FxEngine.burstConfetti(originX || 50, originY || 45, 36);
    }
    renderTreasureBar();
    renderDrawerPageList();
    if (global.KikiPopup3D && typeof global.KikiPopup3D.setUnlockedTreasures === "function") {
      global.KikiPopup3D.setUnlockedTreasures(state.unlockedTreasures);
    }
  }

  function showToast(message) {
    if (!message) {
      return;
    }
    if (dom.drawerVoiceStatus) {
      dom.drawerVoiceStatus.textContent = message;
    }
  }

  function inferEmojiIcon(text, emojiHint) {
    if (emojiHint) {
      return emojiHint;
    }
    var s = String(text || "");
    if (s.indexOf("皇冠") >= 0) return "👑";
    if (s.indexOf("气球") >= 0) return "🎈";
    if (s.indexOf("飞") >= 0 || s.indexOf("乐迪") >= 0 || s.indexOf("天天") >= 0) return "✈️";
    if (s.indexOf("积木") >= 0 || s.indexOf("城堡") >= 0) return "🧱";
    if (s.indexOf("灯") >= 0 || s.indexOf("星") >= 0) return "💡";
    if (s.indexOf("蜡烛") >= 0 || s.indexOf("蛋糕") >= 0) return "🎂";
    if (s.indexOf("汪汪") >= 0 || s.indexOf("阿奇") >= 0 || s.indexOf("毛毛") >= 0) return "🐾";
    if (s.indexOf("爱") >= 0 || s.indexOf("小爱") >= 0) return "💖";
    return "✨";
  }

  /**
   * 舞台零文字气泡：只弹无框漂浮可爱表情图标，字幕文字仅在家长打开 📖 字幕时更新到字幕卡
   */
  function showSpeechBubble(xPct, yPct, text, preferredSide, emojiHint) {
    if (text && state.captionVisible && dom.captionStory) {
      dom.captionStory.textContent = text;
    }
    var icon = inferEmojiIcon(text, emojiHint);
    if (!icon || !dom.stageBubblesLayer) {
      return;
    }
    dom.stageBubblesLayer.innerHTML = "";
    if (state.bubbleTimer) {
      global.clearTimeout(state.bubbleTimer);
    }

    var posX = Math.max(12, Math.min(88, Number(xPct) || 50));
    var posY = Math.max(16, Math.min(76, (Number(yPct) || 45) - (preferredSide === "bottom" ? -8 : 4)));

    var pop = doc.createElement("div");
    pop.className = "emoji-pop";
    pop.style.left = posX.toFixed(1) + "%";
    pop.style.top = posY.toFixed(1) + "%";
    pop.textContent = icon;
    dom.stageBubblesLayer.appendChild(pop);

    state.bubbleTimer = global.setTimeout(function () {
      if (pop.parentNode) {
        pop.remove();
      }
      state.bubbleTimer = null;
    }, 1350);
  }

  function setHudPills(items) {
    dom.stageHud.innerHTML = "";
    if (!items || items.length === 0) {
      return;
    }
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var dot = doc.createElement("span");
      if (item.colorDot) {
        dot.className = "hud-dot is-color-dot" + (item.done || item.complete ? " is-done" : "");
        dot.style.setProperty("--dot-color", item.colorDot);
      } else {
        dot.className = "hud-dot" + (item.done || item.complete ? " is-done" : "");
        dot.textContent = item.icon || "✨";
      }
      dom.stageHud.appendChild(dot);
    }
  }

  function createHotspotButton(hotspot, extraClass) {
    var btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "hotspot-btn shape-" + (hotspot.shape || "rect") + (extraClass ? " " + extraClass : "");
    btn.style.left = hotspot.x + "%";
    btn.style.top = hotspot.y + "%";
    btn.style.width = hotspot.width + "%";
    btn.style.height = hotspot.height + "%";
    btn.setAttribute("aria-label", hotspot.label);
    return btn;
  }

  function triggerActionClass(actorNode, actionClass, durationMs) {
    if (!actorNode || !actorNode.actionWrap) {
      return;
    }
    var wrap = actorNode.actionWrap;
    wrap.classList.remove(
      "action-jump",
      "action-cheer-double",
      "action-shake-1",
      "action-shake-2",
      "action-box-pop",
      "action-chase-dash",
      "action-marshall-flip",
      "action-castle-snap",
      "action-flag-rise",
      "action-kiki-blow"
    );
    void wrap.offsetWidth;
    wrap.classList.add(actionClass);

    var airborne =
      actionClass === "action-jump" ||
      actionClass === "action-cheer-double" ||
      actionClass === "action-marshall-flip" ||
      actionClass === "action-chase-dash";
    if (airborne && actorNode.root) {
      actorNode.root.classList.add("is-airborne");
    }

    if (durationMs) {
      global.setTimeout(function () {
        wrap.classList.remove(actionClass);
        if (airborne && actorNode.root) {
          actorNode.root.classList.remove("is-airborne");
        }
      }, durationMs);
    }
  }

  function shouldKikiWearCrown(page, actor) {
    if (actor.dynamicCrown === "p2-opened") {
      return Boolean(state.pageState.p2.opened);
    }
    return Boolean(actor.hasCrown);
  }

  function getActorBubbleOrigin(actor) {
    if (actor.anchor === "bottom") {
      return { x: actor.x, y: actor.y - (actor.heightPct || 30) * 0.72 };
    }
    return { x: actor.x, y: actor.y };
  }

  function setKikiMood(node, mood, durationMs) {
    if (!node || !node.img || !node.config) {
      return;
    }
    var isCheer = mood === "cheer";
    var spriteFile = isCheer ? "kiki-cheer.webp" : node.config.sprite || "kiki-idle.webp";
    var ratio = getSpriteAspectRatio(spriteFile);
    var widthPct = ((node.config.heightPct || 40) * ratio) / STAGE_RATIO;

    node.mood = mood;
    node.img.src = getSpriteSrc(spriteFile);
    node.widthPct = widthPct;
    node.root.style.width = widthPct.toFixed(3) + "%";

    if (node.crownWrap) {
      var anchor = getKikiCrownAnchor(isCheer);
      node.crownWrap.style.left = anchor.xPct + "%";
      node.crownWrap.style.top = anchor.yPct + "%";
      node.crownWrap.style.width = anchor.widthPct + "%";
      node.crownWrap.style.setProperty("--crown-rotate", (anchor.rotateDeg || -2) + "deg");
    }

    if (node.moodTimer) {
      global.clearTimeout(node.moodTimer);
      node.moodTimer = null;
    }
    if (isCheer && durationMs && durationMs > 0) {
      var sessionToken = state.pageSessionToken;
      node.moodTimer = global.setTimeout(function () {
        node.moodTimer = null;
        if (state.pageSessionToken === sessionToken && node.img && node.img.isConnected) {
          setKikiMood(node, "idle");
        }
      }, durationMs);
    }
  }

  // ======================== Layer 2 分层精灵演员渲染 ========================

  function renderActorsLayer(page, onActorClick) {
    dom.stageActorsLayer.innerHTML = "";
    state.actorNodes = {};

    var actors = Array.isArray(page.actors) ? page.actors : [];
    var crownAnchor = getKikiCrownAnchor(false);

    actors.forEach(function (actor, idx) {
      var spriteRatio = getSpriteAspectRatio(actor.sprite);
      var heightPct = actor.heightPct || 32;
      var widthPct = (heightPct * spriteRatio) / STAGE_RATIO;

      var root = doc.createElement("div");
      root.className =
        "sprite-actor " +
        (actor.anchor === "center" ? "anchor-center" : "anchor-bottom") +
        (actor.clickable ? " is-clickable" : "");
      root.setAttribute("data-actor-id", actor.id);
      root.style.left = actor.x + "%";
      root.style.top = actor.y + "%";
      root.style.width = widthPct.toFixed(3) + "%";
      root.style.height = heightPct + "%";
      root.style.zIndex = String(actor.zIndex || 12);

      if (actor.hiddenUntil === "p5-won" && !state.pageState.p5.won) {
        root.classList.add("is-hidden-actor");
      }

      if (actor.clickable) {
        root.setAttribute("role", "button");
        root.setAttribute("tabindex", "0");
        root.setAttribute("aria-label", actor.label || actor.role);
      }

      if (actor.anchor !== "center" && actor.role !== "flag" && actor.role !== "castle" && actor.role !== "cake") {
        var shadowEl = doc.createElement("div");
        shadowEl.className = "actor-ground-shadow";
        shadowEl.setAttribute("aria-hidden", "true");
        root.appendChild(shadowEl);

        var castShadowEl = doc.createElement("div");
        castShadowEl.className = "actor-cast-shadow";
        castShadowEl.setAttribute("aria-hidden", "true");
        root.appendChild(castShadowEl);
      }

      var actionWrap = doc.createElement("div");
      actionWrap.className = "sprite-action-wrap";
      actionWrap.style.animationDelay = (idx * 0.025) + "s";

      var idleWrap = doc.createElement("div");
      var idleClass = actor.idle && actor.idle !== "none" ? "idle-" + actor.idle : "";
      idleWrap.className = "sprite-idle-wrap" + (idleClass ? " " + idleClass : "");
      if (idleClass) {
        idleWrap.style.animationDelay = (-idx * 0.37) + "s";
      }

      var img = doc.createElement("img");
      img.className = "sprite-img";
      var activeSpriteFile =
        actor.role === "parcel" && state.pageState.p2.opened && actor.openedSprite
          ? actor.openedSprite
          : actor.sprite;
      img.src = getSpriteSrc(activeSpriteFile);
      img.alt = actor.label || actor.role;
      img.draggable = false;
      idleWrap.appendChild(img);

      if (actor.role === "jett") {
        var thruster = doc.createElement("span");
        thruster.className = "jett-thruster";
        thruster.setAttribute("aria-hidden", "true");
        idleWrap.appendChild(thruster);
      } else if (actor.role === "dizzy") {
        var rotor = doc.createElement("span");
        rotor.className = "dizzy-rotor-blur";
        rotor.setAttribute("aria-hidden", "true");
        idleWrap.appendChild(rotor);
      }

      // KIKI 头顶皇冠精密附着锚点
      var crownWrap = null;
      if (actor.role === "kiki") {
        crownWrap = doc.createElement("div");
        crownWrap.className =
          "kiki-crown-overlay " + (shouldKikiWearCrown(page, actor) ? "is-wearing" : "is-hidden");
        crownWrap.style.left = crownAnchor.xPct + "%";
        crownWrap.style.top = crownAnchor.yPct + "%";
        crownWrap.style.width = crownAnchor.widthPct + "%";
        crownWrap.style.setProperty("--crown-rotate", (crownAnchor.rotateDeg || -2) + "deg");
        var crownImg = doc.createElement("img");
        crownImg.src = getSpriteSrc("crown-5.webp");
        crownImg.alt = "金色5岁小皇冠";
        crownImg.draggable = false;
        crownWrap.appendChild(crownImg);
        idleWrap.appendChild(crownWrap);
      }

      actionWrap.appendChild(idleWrap);
      root.appendChild(actionWrap);
      dom.stageActorsLayer.appendChild(root);

      var nodeRecord = {
        config: actor,
        root: root,
        actionWrap: actionWrap,
        idleWrap: idleWrap,
        img: img,
        crownWrap: crownWrap,
        widthPct: widthPct,
        heightPct: heightPct,
        liveX: actor.x,
        liveY: actor.y,
        mood: "idle",
        moodTimer: null
      };
      state.actorNodes[actor.id] = nodeRecord;

      if (actor.clickable) {
        root.addEventListener("click", function () {
          if (onActorClick) {
            onActorClick(actor, nodeRecord);
          }
        });
        root.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            if (onActorClick) {
              onActorClick(actor, nodeRecord);
            }
          }
        });
      }
    });
  }

  /**
   * 乐迪特技：真正沿着大弧线俯冲加速飞过天空一圈并拖出彩虹星光尾焰
   */
  function playJettFlyLoop(actorNode, onComplete) {
    if (!actorNode || actorNode.isFlying) {
      return;
    }
    actorNode.isFlying = true;
    var actor = actorNode.config;
    var x0 = actor.x;
    var y0 = actor.y;
    var el = actorNode.root;
    var savedAnim = actorNode.idleWrap.style.animation;
    actorNode.idleWrap.style.animation = "none";

    Sfx.playFlyWhoosh();
    var token = state.pageSessionToken;

    runTween({
      duration: 1850,
      onUpdate: function (t) {
        var x;
        var y;
        var tilt;
        var scale;
        if (t < 0.42) {
          var s1 = t / 0.42;
          var e1 = s1 * s1 * (3 - 2 * s1);
          x = cubicBezier(x0, x0 + 18, 62, 76, e1);
          y = cubicBezier(y0, y0 + 22, 46, 28, e1);
          tilt = 14 * Math.sin(s1 * Math.PI);
          scale = 1 + 0.18 * Math.sin(s1 * Math.PI);
        } else if (t < 0.74) {
          var s2 = (t - 0.42) / 0.32;
          x = quadBezier(76, 46, 15, s2);
          y = quadBezier(28, 10, 22, s2);
          tilt = -18 * Math.sin(s2 * Math.PI);
          scale = 0.94 + 0.1 * (1 - s2);
        } else {
          var s3 = (t - 0.74) / 0.26;
          var e3 = 1 - Math.pow(1 - s3, 2);
          x = quadBezier(15, 22, x0, e3);
          y = quadBezier(22, 18, y0, e3);
          tilt = -8 * (1 - e3);
          scale = 1;
        }
        el.style.left = x.toFixed(2) + "%";
        el.style.top = y.toFixed(2) + "%";
        el.style.transform = "translate(-50%, -50%) rotate(" + tilt.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
        actorNode.liveX = x;
        actorNode.liveY = y;
        FxEngine.spawnTrailParticle(x, y + 2, Math.random() > 0.35 ? "star" : "dot");
      },
      onDone: function () {
        if (state.pageSessionToken !== token) {
          return;
        }
        el.style.left = x0 + "%";
        el.style.top = y0 + "%";
        el.style.transform = "";
        actorNode.idleWrap.style.animation = savedAnim;
        actorNode.liveX = x0;
        actorNode.liveY = y0;
        actorNode.isFlying = false;
        FxEngine.burstSparkles(x0, y0, 14);
        if (onComplete) {
          onComplete();
        }
      }
    });
  }

  /**
   * 小爱特技：螺旋桨腾空转圈撒下粉红爱心
   */
  function playDizzySpinHearts(actorNode, onComplete) {
    if (!actorNode || actorNode.isFlying) {
      return;
    }
    actorNode.isFlying = true;
    var actor = actorNode.config;
    var x0 = actor.x;
    var y0 = actor.y;
    var el = actorNode.root;
    var savedAnim = actorNode.idleWrap.style.animation;
    actorNode.idleWrap.style.animation = "none";

    Sfx.playSparkle();
    var lastHeartStep = -1;
    var token = state.pageSessionToken;

    runTween({
      duration: 1500,
      onUpdate: function (t) {
        var angle = t * Math.PI * 2;
        var radiusX = 7 * Math.sin(t * Math.PI);
        var radiusY = 6 * Math.sin(t * Math.PI);
        var x = x0 + Math.sin(angle) * radiusX;
        var y = y0 - 8 * Math.sin(t * Math.PI) + Math.cos(angle) * radiusY;
        var rot = t * 720;
        var scale = 1 + 0.15 * Math.sin(t * Math.PI);
        el.style.left = x.toFixed(2) + "%";
        el.style.top = y.toFixed(2) + "%";
        el.style.transform = "translate(-50%, -50%) rotate(" + rot.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
        var step = Math.floor(t * 14);
        if (step !== lastHeartStep) {
          lastHeartStep = step;
          FxEngine.spawnTrailParticle(x, y, "heart", "#FF70A6");
        }
      },
      onDone: function () {
        if (state.pageSessionToken !== token) {
          return;
        }
        el.style.left = x0 + "%";
        el.style.top = y0 + "%";
        el.style.transform = "";
        actorNode.idleWrap.style.animation = savedAnim;
        actorNode.isFlying = false;
        FxEngine.burstHearts(x0, y0, 18);
        if (onComplete) {
          onComplete();
        }
      }
    });
  }

  /**
   * 空中精灵广域 8 字/弧线自由巡航器（自动朝向翻转 + 倾斜坡度 + 景深微缩放 + 彩迹粒子）
   */
  function startSkyPatrol(node, opts) {
    if (!node || !node.root) {
      return;
    }
    var cfg = opts || {};
    var token = state.pageSessionToken;
    var pageNum = state.currentPage;
    var cx = typeof cfg.cx === "number" ? cfg.cx : node.config.x;
    var cy = typeof cfg.cy === "number" ? cfg.cy : node.config.y;
    var ampX = cfg.ampX || 12;
    var ampY = cfg.ampY || 6;
    var freq = cfg.freq || 0.72;
    var phase = cfg.phase || 0;
    var facingSign = cfg.baseFacing || 1;
    var startTs = global.performance ? global.performance.now() : Date.now();
    var lastTrailTs = 0;

    function tick(nowTs) {
      if (state.pageSessionToken !== token || state.currentPage !== pageNum || !node.root.isConnected) {
        return;
      }
      if (!node.isFlying) {
        var t = ((nowTs || Date.now()) - startTs) / 1000;
        var ang = t * freq + phase;
        var prevX = cx + ampX * Math.sin(ang - 0.05);
        var x = cx + ampX * Math.sin(ang);
        var y = cy + ampY * Math.sin(ang * 2);
        var vx = x - prevX;
        var flip = (vx >= 0 ? 1 : -1) * facingSign;
        var bank = Math.max(-14, Math.min(14, vx * 16));
        var scale = 0.96 + 0.06 * Math.cos(ang * 2);

        node.root.style.left = x.toFixed(2) + "%";
        node.root.style.top = y.toFixed(2) + "%";
        node.root.style.transform =
          "translate(-50%, -50%) scaleX(" + flip + ") rotate(" + (bank * flip).toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
        node.liveX = x;
        node.liveY = y;

        if ((nowTs || Date.now()) - lastTrailTs > 220) {
          lastTrailTs = nowTs || Date.now();
          FxEngine.spawnTrailParticle(
            x - (vx >= 0 ? 2.5 : -2.5),
            y + 1.5,
            cfg.trailKind || "star",
            cfg.trailColor || "#FFE066"
          );
        }
      }
      global.requestAnimationFrame(tick);
    }

    global.requestAnimationFrame(tick);
  }

  // ======================== WebGL 3D 交互统一调度 ========================

  function toggleLookCloserMode(explicitBool) {
    if (!global.KikiPopup3D || typeof global.KikiPopup3D.toggleLookCloser !== "function") {
      return;
    }
    var active = global.KikiPopup3D.toggleLookCloser(explicitBool);
    if (dom.btnLookCloser) {
      dom.btnLookCloser.setAttribute("aria-pressed", active ? "true" : "false");
      dom.btnLookCloser.classList.toggle("is-active", active);
    }
  }

  function handle3dSelectActor(pageNum, actorId) {
    unlockAudio();
    var page = getPageByNumber(pageNum);
    if (!page || !Array.isArray(page.actors)) {
      return;
    }
    var actor = null;
    for (var i = 0; i < page.actors.length; i += 1) {
      if (page.actors[i].id === actorId) {
        actor = page.actors[i];
        break;
      }
    }
    if (!actor) {
      return;
    }

    if (pageNum === 4 && actor.badgeId) {
      var p4 = state.pageState.p4;
      var firstForPup = !p4.collected[actor.badgeId];
      p4.collected[actor.badgeId] = true;
      Sfx.playBadgeChime(Object.keys(p4.collected).length);
      if (actor.audio || (Array.isArray(actor.audioPool) && actor.audioPool.length > 0)) {
        playActorVoiceSmart(actor, pageNum);
      }
      var allThree = (page.items || []).every(function (it) { return Boolean(p4.collected[it.id]); });
      if (firstForPup && allThree && !p4.cheered) {
        p4.cheered = true;
        unlockTreasure(page.rewardTreasureId, 50, 42);
        var teamCheer = findVoiceById(page, "p4-team-cheer");
        if (teamCheer) {
          global.setTimeout(function () {
            if (state.currentPage === 4) {
              playVoice(teamCheer.audio);
            }
          }, 950);
        }
      }
      return;
    }

    if (pageNum === 5 && actor.action === "castle-build-next") {
      var bricks = page.items || [];
      for (var bi = 0; bi < bricks.length; bi += 1) {
        if (!state.pageState.p5.placed[bricks[bi].id]) {
          handle3dInteractItem(5, "brick", bricks[bi].id);
          break;
        }
      }
      return;
    }

    if (actor.role === "jett" || actor.role === "dizzy") {
      Sfx.playFlyWhoosh();
    } else if (actor.role === "minifig") {
      Sfx.playLegoSnap();
    } else {
      Sfx.playPop(1);
    }
    playActorVoiceSmart(actor, pageNum);
  }

  function handle3dInteractItem(pageNum, kind, itemId) {
    unlockAudio();
    var page = getPageByNumber(pageNum);
    if (!page) {
      return;
    }

    if (pageNum === 1 && kind === "p1-flower") {
      Sfx.playSparkle();
      queueOrPlaySceneVoice(1, { actorId: "p1-kiki", priority: "low" });
      return;
    }

    if (pageNum === 1 && kind === "start-adventure") {
      Sfx.playSparkle();
      goToPage(2, "next");
      return;
    }

    if (pageNum === 7 && kind === "p7-treat") {
      Sfx.playPop(2);
      var treatActor = itemId && String(itemId).indexOf("macarons") !== -1 ? "p7-marshall" : "p7-kiki";
      queueOrPlaySceneVoice(7, { actorId: treatActor, priority: "low" });
      return;
    }

    if (pageNum === 2 && kind === "p2-delivery-landed") {
      state.pageAutoSpoken["p2-landed"] = true;
      if (!state.pageState.p2.opened) {
        if (queueOrPlaySceneVoice(2, { actorId: "p2-jett", rawPath: "./assets/audio/p2-jett.mp3", priority: "high" })) {
          state.pageAutoSpoken[2] = true;
        }
      }
      return;
    }

    if (pageNum === 2 && kind === "parcel") {
      var p2 = state.pageState.p2;
      state.pendingSceneVoice = null;
      state.pageAutoSpoken[2] = true;
      p2.parcelTaps = 2;
      p2.opened = true;
      Sfx.playBoxOpen();
      Sfx.playCrownRise();
      unlockTreasure(page.rewardTreasureId, 24, 24);
      var unboxVoice = findVoiceById(page, "p2-unbox");
      if (unboxVoice) {
        playVoice(unboxVoice.audio);
      }
      global.setTimeout(function () {
        if (state.currentPage === 2) {
          Sfx.playCrownLand();
        }
      }, 1450);
      return;
    }

    if (pageNum === 3 && kind === "p3-auto-bounce") {
      if (!state.pageState.p3.won) {
        queueOrPlaySceneVoice(3, { actorId: itemId || "p3-bluey", priority: "low" });
      }
      return;
    }

    if (pageNum === 3 && kind === "balloon") {
      var p3 = state.pageState.p3;
      p3.bounces += 1;
      Sfx.playPop(Math.min(6, p3.bounces));
      if (!p3.won && p3.bounces >= 5) {
        p3.won = true;
        Sfx.playWinChime();
        unlockTreasure(page.rewardTreasureId, 50, 32);
        var bWinVoice = findVoiceById(page, "p3-balloon-win");
        if (bWinVoice) {
          playVoice(bWinVoice.audio);
        }
      } else {
        var bActor = findActorById(page, p3.bounces % 2 === 1 ? "p3-bluey" : "p3-bingo");
        if (bActor) {
          playActorVoiceSmart(bActor, 3);
        }
      }
      return;
    }

    if (pageNum === 5 && kind === "brick") {
      var p5 = state.pageState.p5;
      if (p5.placed[itemId]) {
        return;
      }
      p5.placed[itemId] = true;
      Sfx.playLegoSnap();
      var allPlaced = (page.items || []).every(function (it) { return Boolean(p5.placed[it.id]); });
      if (allPlaced && !p5.won) {
        p5.won = true;
        global.setTimeout(function () {
          if (state.currentPage === 5 && global.KikiPopup3D) {
            global.KikiPopup3D.syncPageState(5, state.pageState.p5);
          }
          Sfx.playWinChime();
          unlockTreasure(page.rewardTreasureId, 66, 36);
          var win5 = findVoiceById(page, "p5-lego-win");
          if (win5) {
            playVoice(win5.audio);
          }
        }, 560);
      } else {
        var fig5 = findActorById(page, "p5-minifig-1");
        if (fig5) {
          playActorVoiceSmart(fig5, 5);
        }
      }
      return;
    }

    if (pageNum === 5 && kind === "lego-car") {
      if (typeof Sfx.playCarHorn === "function") {
        Sfx.playCarHorn();
      } else {
        Sfx.playLegoSnap();
      }
      showToast("🚗 嘀嘀！乐高积木小车开来送积木啦！");
      var carFig = findActorById(page, "p5-minifig-3");
      var isNarratingMain = state.currentVoiceRawPath === page.narrationAudio && !voiceAudio.paused;
      if (carFig && !isNarratingMain) {
        playActorVoiceSmart(carFig, 5);
      }
      return;
    }

    if (pageNum === 6 && kind === "lights") {
      var p6 = state.pageState.p6;
      var wasOff = !p6.lightsOn;
      p6.lightsOn = true;
      Sfx.playLightsOn();
      if (wasOff) {
        var lVoice = findVoiceById(page, "p6-party-light");
        if (lVoice) {
          playVoice(lVoice.audio);
        }
      }
      return;
    }

    if (pageNum === 7 && (kind === "candle" || kind === "blow-all")) {
      var p7 = state.pageState.p7;
      var tips = (DATA.spriteConfig && DATA.spriteConfig.defaultCakeCandleTips) || [];
      if (kind === "candle") {
        p7.blown[itemId] = true;
      } else {
        tips.forEach(function (c) { p7.blown[c.id] = true; });
      }
      Sfx.playBlow();
      var allBlown = tips.length > 0 && tips.every(function (c) { return Boolean(p7.blown[c.id]); });
      if (allBlown && !p7.allBlown) {
        p7.allBlown = true;
        Sfx.playWinChime();
        var cheer7 = findVoiceById(page, "p7-blow-cheer");
        if (cheer7) {
          playVoice(cheer7.audio);
        }
        ensureBgmForState();
      }
      return;
    }

    if (pageNum === 8 && kind === "fireworks") {
      Sfx.playFirework();
    }
  }

  // ======================== 逐页交互渲染 ========================

  function renderPageInteractive(page) {
    stopAllTweens();
    FxEngine.clear();
    dom.stageActorsLayer.innerHTML = "";
    dom.stageInteractiveLayer.innerHTML = "";
    dom.stageBubblesLayer.innerHTML = "";
    dom.captionActions.innerHTML = "";
    dom.stageMoodLayer.className = "stage-mood-layer";
    dom.karaokeBar.classList.toggle("hidden", page.pageNumber !== 8);
    if (dom.finaleFloatActions) {
      dom.finaleFloatActions.classList.toggle("hidden", page.pageNumber !== 8);
    }
    dom.btnNextPage.classList.remove("is-attention");
    setHudPills([]);

    // 当真 3D 立体弹出书引擎活跃时，跳过旧 2D DOM 舞台绘制以避免重复 rAF 耗损
    if (global.KikiPopup3D && typeof global.KikiPopup3D.isReady === "function" && global.KikiPopup3D.isReady()) {
      if (page.pageNumber === 8) {
        updateKaraokeDisplay();
      }
      return;
    }

    if (page.ambientFx) {
      FxEngine.setAmbientMode(page.ambientFx);
    }

    switch (page.interactionType) {
      case "cover-start":
        renderPage1Cover(page);
        break;
      case "unbox-parcel":
        renderPage2Unbox(page);
        break;
      case "keepy-uppy":
        renderPage3KeepyUppy(page);
        break;
      case "paw-badges":
        renderPage4PawBadges(page);
        break;
      case "lego-build":
        renderPage5LegoBuild(page);
        break;
      case "party-lights":
        renderPage6PartyLights(page);
        break;
      case "blow-candles":
        renderPage7BlowCandles(page);
        break;
      case "finale-singalong":
        renderPage8Finale(page);
        break;
      default:
        break;
    }
  }

  function renderPage1Cover(page) {
    var kikiCheered = false;
    renderActorsLayer(page, function (actor, node) {
      unlockAudio();
      Sfx.playSparkle();
      var origin = getActorBubbleOrigin(actor);
      FxEngine.burstConfetti(origin.x, origin.y, 32);
      showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "👑");
      if (!kikiCheered) {
        kikiCheered = true;
        setKikiMood(node, "cheer");
        triggerActionClass(node, "action-cheer-double", 1100);
        playActorVoiceSmart(actor, 1);
      } else {
        triggerActionClass(node, "action-jump", 620);
        global.setTimeout(function () {
          goToPage(2, "next");
        }, 260);
      }
    });

    var kikiNode = state.actorNodes["p1-kiki"];
    if (kikiNode && kikiNode.root) {
      kikiNode.root.classList.add("tap-beacon");
    }

    var archSpot = page.hotspots && page.hotspots[0];
    var portal = doc.createElement("button");
    portal.type = "button";
    portal.className = "arch-portal-trigger tap-beacon";
    portal.style.left = (archSpot ? archSpot.x : 64) + "%";
    portal.style.top = (archSpot ? archSpot.y : 42) + "%";
    portal.setAttribute("aria-label", "走进魔法花园开启5岁生日冒险");
    portal.textContent = "✨";
    portal.addEventListener("click", function () {
      unlockAudio();
      Sfx.playSparkle();
      FxEngine.burstConfetti(archSpot ? archSpot.x : 64, archSpot ? archSpot.y : 42, 34);
      if (kikiNode) {
        setKikiMood(kikiNode, "cheer");
        triggerActionClass(kikiNode, "action-jump", 550);
      }
      goToPage(2, "next");
    });
    dom.stageInteractiveLayer.appendChild(portal);
  }

  function renderPage2Unbox(page) {
    var p2 = state.pageState.p2;
    p2.crownInFlight = false;

    function updateHud() {
      if (p2.opened) {
        setHudPills([{ icon: "👑", done: true }]);
      } else {
        setHudPills([
          { icon: "🎁", done: p2.parcelTaps >= 1 },
          { icon: "✨", done: p2.parcelTaps >= 2 }
        ]);
      }
    }
    updateHud();

    function syncParcelBeacon(node) {
      if (!node || !node.root) {
        return;
      }
      node.root.classList.toggle("tap-beacon", !p2.opened);
    }

    /**
     * P2 皇冠飞出戴上三段式演出：
     * 1. 箱子变成 parcel-open.webp + 金光礼花爆裂；
     * 2. crown-5.webp 从箱口旋转升起，在舞台中央放大到 2.05x 闪烁展示 0.85s；
     * 3. 沿高高彩虹抛物线飞落旁边 KIKI 头顶稳稳戴上 + KIKI 惊喜连续蹦跳欢呼！
     */
    function playCrownFlightSequence(parcelActor, parcelNode, isReplay) {
      var kikiNode = state.actorNodes["p2-kiki"];
      if (!kikiNode || p2.crownInFlight) {
        return;
      }
      p2.crownInFlight = true;
      var kiki = kikiNode.config;
      var crownAnchor = getKikiCrownAnchor();

      if (isReplay && kikiNode.crownWrap) {
        kikiNode.crownWrap.classList.remove("is-wearing");
        kikiNode.crownWrap.classList.add("is-hidden");
      }

      // 精确计算 KIKI 头顶皇冠落点（舞台百分比）
      var kikiTopY = kiki.y - kikiNode.heightPct;
      var targetX = kiki.x + ((crownAnchor.xPct - 50) / 100) * kikiNode.widthPct;
      var targetY = kikiTopY + (crownAnchor.yPct / 100) * kikiNode.heightPct;
      var targetWidthPct = kikiNode.widthPct * (crownAnchor.widthPct / 100);

      var startX = parcelActor.x;
      var startY = parcelActor.y - parcelNode.heightPct * 0.65;
      var showcaseX = 50;
      var showcaseY = 33;

      var flyer = doc.createElement("div");
      flyer.className = "flying-crown-actor";
      flyer.style.left = startX + "%";
      flyer.style.top = startY + "%";
      flyer.style.width = (targetWidthPct * 1.2).toFixed(3) + "%";

      var aura = doc.createElement("div");
      aura.className = "flying-crown-aura";
      var crownImg = doc.createElement("img");
      crownImg.className = "flying-crown-img";
      crownImg.src = getSpriteSrc("crown-5.webp");
      crownImg.alt = "飞出的金色5岁小皇冠";
      flyer.appendChild(aura);
      flyer.appendChild(crownImg);
      dom.stageActorsLayer.appendChild(flyer);

      Sfx.playCrownRise();
      FxEngine.burstSparkles(startX, startY, 26);
      var token = state.pageSessionToken;

      // 阶段一：0.6s 旋转升起至中央展示位 + 0.85s 放大闪烁展示
      runTween({
        duration: 1450,
        onUpdate: function (t) {
          var riseRatio = Math.min(1, t / 0.42);
          var easeRise = 1 - Math.pow(1 - riseRatio, 3);
          var x = startX + (showcaseX - startX) * easeRise;
          var y = startY + (showcaseY - startY) * easeRise;
          var rot = riseRatio < 1 ? (1 - riseRatio) * -360 : Math.sin((t - 0.42) * 18) * 9;
          var scale = riseRatio < 1 ? 0.55 + 1.5 * easeRise : 2.05 + 0.16 * Math.sin((t - 0.42) * 16);
          flyer.style.left = x.toFixed(2) + "%";
          flyer.style.top = y.toFixed(2) + "%";
          flyer.style.transform = "translate(-50%, -50%) rotate(" + rot.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
          if (Math.random() > 0.22) {
            FxEngine.spawnTrailParticle(x, y, Math.random() > 0.4 ? "star" : "heart", "#FFBE0B");
          }
        },
        onDone: function () {
          if (state.pageSessionToken !== token) {
            p2.crownInFlight = false;
            return;
          }
          FxEngine.burstSparkles(showcaseX, showcaseY, 22);
          // 阶段二：0.88s 高抛物线飞落 KIKI 头顶
          var ctrlX = (showcaseX + targetX) / 2 - 4;
          var ctrlY = Math.min(showcaseY, targetY) - 20;
          runTween({
            duration: 880,
            onUpdate: function (t2) {
              var e = t2 < 0.5 ? 2 * t2 * t2 : 1 - Math.pow(-2 * t2 + 2, 2) / 2;
              var x = quadBezier(showcaseX, ctrlX, targetX, e);
              var y = quadBezier(showcaseY, ctrlY, targetY, e);
              var scale = 2.05 + (0.83 - 2.05) * e;
              var rot = -14 * Math.sin(e * Math.PI) + (crownAnchor.rotateDeg || -2) * e;
              flyer.style.left = x.toFixed(2) + "%";
              flyer.style.top = y.toFixed(2) + "%";
              flyer.style.transform = "translate(-50%, -50%) rotate(" + rot.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
              FxEngine.spawnTrailParticle(x, y, "star", "#FFE066");
            },
            onDone: function () {
              p2.crownInFlight = false;
              if (flyer.parentNode) {
                flyer.remove();
              }
              if (state.pageSessionToken !== token) {
                return;
              }
              if (kikiNode.crownWrap) {
                kikiNode.crownWrap.classList.remove("is-hidden");
                kikiNode.crownWrap.classList.add("is-wearing");
              }
              Sfx.playCrownLand();
              FxEngine.burstSparkles(targetX, targetY, 32);
              FxEngine.burstConfetti(kiki.x, kiki.y - 28, 36);
              setKikiMood(kikiNode, "cheer", 2600);
              triggerActionClass(kikiNode, "action-cheer-double", 1100);
              unlockTreasure(page.rewardTreasureId, targetX, targetY);
              showSpeechBubble(kiki.x, kiki.y - 30, "耶！金色5岁小皇冠飞到我头上戴好啦！谢谢超级飞侠！", "right", "👑");
              dom.btnNextPage.classList.add("is-attention");
              if (dom.btnCornerNext) {
                dom.btnCornerNext.classList.add("is-attention");
              }
            }
          });
        }
      });
    }

    function handleParcelTap(actor, node) {
      unlockAudio();
      if (p2.crownInFlight) {
        return;
      }
      if (p2.opened) {
        triggerActionClass(node, "action-box-pop", 520);
        Sfx.playBoxOpen();
        FxEngine.burstConfetti(actor.x, actor.y - 20, 28);
        showSpeechBubble(actor.x, actor.y - 26, "✨ 再看一遍皇冠飞落 KIKI 头顶的魔法时刻！", "top", "👑");
        if (actor.audio) {
          playVoice(actor.audio);
        }
        playCrownFlightSequence(actor, node, true);
        return;
      }
      p2.parcelTaps = 2;
      p2.opened = true;
      if (actor.openedSprite) {
        node.img.src = getSpriteSrc(actor.openedSprite);
      }
      triggerActionClass(node, "action-box-pop", 520);
      Sfx.playBoxOpen();
      FxEngine.burstConfetti(actor.x, actor.y - 20, 44);
      showSpeechBubble(actor.x, actor.y - 26, "哇塞！金色5岁小皇冠飞出来啦！", "top", "👑");
      playVoice(actor.audio);
      playCrownFlightSequence(actor, node, false);
      syncParcelBeacon(node);
      updateHud();
    }

    function handleActorInteraction(actor, node) {
      unlockAudio();
      if (actor.action === "unbox-parcel" || actor.action === "unbox-reward") {
        handleParcelTap(actor, node);
      } else if (actor.role === "kiki" && p2.opened && !p2.crownInFlight) {
        var parcelNode = state.actorNodes["p2-parcel-box"];
        if (parcelNode) {
          handleParcelTap(parcelNode.config, parcelNode);
        } else {
          setKikiMood(node, "cheer", 1400);
          triggerActionClass(node, "action-cheer-double", 1050);
        }
      } else if (actor.action === "jett-fly-loop") {
        showSpeechBubble(actor.x, actor.y + 8, actor.feedbackText, "bottom", "✈️");
        playActorVoiceSmart(actor, 2);
        playJettFlyLoop(node);
      } else if (actor.action === "dizzy-spin-hearts") {
        showSpeechBubble(actor.x, actor.y + 8, actor.feedbackText, "bottom", "💖");
        playActorVoiceSmart(actor, 2);
        playDizzySpinHearts(node);
      } else {
        if (actor.role === "kiki") {
          setKikiMood(node, "cheer", 1400);
        }
        triggerActionClass(node, "action-jump", 650);
        Sfx.playPop(1);
        var origin = getActorBubbleOrigin(actor);
        FxEngine.burstSparkles(origin.x, origin.y, 14);
        showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "👑");
        playActorVoiceSmart(actor, 2);
      }
    }

    renderActorsLayer(page, handleActorInteraction);
    if (state.actorNodes["p2-parcel-box"]) {
      syncParcelBeacon(state.actorNodes["p2-parcel-box"]);
    }

    // 超级飞侠开场自动从天外弧线滑翔进场 + 持续广域巡航
    var jettNode = state.actorNodes["p2-jett"];
    var dizzyNode = state.actorNodes["p2-dizzy"];
    var p2Token = state.pageSessionToken;

    if (jettNode) {
      var jTargetX = jettNode.config.x;
      var jTargetY = jettNode.config.y;
      var jSavedAnim = jettNode.idleWrap.style.animation;
      jettNode.idleWrap.style.animation = "none";
      jettNode.isFlying = true;
      runTween({
        duration: 1150,
        onUpdate: function (t) {
          var e = 1 - Math.pow(1 - t, 3);
          var x = quadBezier(-8, 12, jTargetX, e);
          var y = quadBezier(10, 42, jTargetY, e);
          var tilt = -18 * (1 - e);
          jettNode.root.style.left = x.toFixed(2) + "%";
          jettNode.root.style.top = y.toFixed(2) + "%";
          jettNode.root.style.transform = "translate(-50%, -50%) rotate(" + tilt.toFixed(1) + "deg)";
          jettNode.liveX = x;
          jettNode.liveY = y;
          if (Math.random() > 0.35) {
            FxEngine.spawnTrailParticle(x - 3, y + 2, "star", "#FFBE0B");
          }
        },
        onDone: function () {
          if (state.pageSessionToken !== p2Token) {
            return;
          }
          jettNode.root.style.left = jTargetX + "%";
          jettNode.root.style.top = jTargetY + "%";
          jettNode.root.style.transform = "";
          jettNode.idleWrap.style.animation = jSavedAnim;
          jettNode.liveX = jTargetX;
          jettNode.liveY = jTargetY;
          jettNode.isFlying = false;
          startSkyPatrol(jettNode, {
            cx: Math.max(40, jTargetX + 9),
            cy: 13.5,
            ampX: 9,
            ampY: 2.5,
            freq: 0.78,
            phase: 0,
            baseFacing: 1,
            trailKind: "star",
            trailColor: "#FFE066"
          });
        }
      });
    }

    if (dizzyNode) {
      var dTargetX = dizzyNode.config.x;
      var dTargetY = dizzyNode.config.y;
      var dSavedAnim = dizzyNode.idleWrap.style.animation;
      dizzyNode.idleWrap.style.animation = "none";
      dizzyNode.isFlying = true;
      runTween({
        duration: 1200,
        onUpdate: function (t) {
          var e = 1 - Math.pow(1 - t, 3);
          var x = quadBezier(108, 92, dTargetX, e);
          var y = quadBezier(12, 40, dTargetY, e);
          var tilt = 16 * (1 - e);
          dizzyNode.root.style.left = x.toFixed(2) + "%";
          dizzyNode.root.style.top = y.toFixed(2) + "%";
          dizzyNode.root.style.transform = "translate(-50%, -50%) rotate(" + tilt.toFixed(1) + "deg)";
          dizzyNode.liveX = x;
          dizzyNode.liveY = y;
          if (Math.random() > 0.4) {
            FxEngine.spawnTrailParticle(x + 3, y + 2, "heart", "#FF8FAB");
          }
        },
        onDone: function () {
          if (state.pageSessionToken !== p2Token) {
            return;
          }
          dizzyNode.root.style.left = dTargetX + "%";
          dizzyNode.root.style.top = dTargetY + "%";
          dizzyNode.root.style.transform = "";
          dizzyNode.idleWrap.style.animation = dSavedAnim;
          dizzyNode.liveX = dTargetX;
          dizzyNode.liveY = dTargetY;
          dizzyNode.isFlying = false;
          startSkyPatrol(dizzyNode, {
            cx: dTargetX - 3,
            cy: 18,
            ampX: 10,
            ampY: 4.5,
            freq: 0.72,
            phase: 1.8,
            baseFacing: -1,
            trailKind: "heart",
            trailColor: "#FF8FAB"
          });
        }
      });
    }
  }

  function renderPage3KeepyUppy(page) {
    var p3 = state.pageState.p3;

    function updateHud() {
      var shown = Math.min(5, p3.bounces);
      setHudPills(
        page.items.map(function (b, idx) {
          return {
            colorDot: b.hex || "#FF70A6",
            done: shown > idx
          };
        })
      );
    }
    updateHud();

    renderActorsLayer(page, function (actor, node) {
      unlockAudio();
      if (actor.role === "kiki") {
        setKikiMood(node, "cheer", 1300);
      }
      triggerActionClass(node, "action-jump", 650);
      Sfx.playPop(0);
      var origin = getActorBubbleOrigin(actor);
      FxEngine.burstSparkles(origin.x, origin.y, 16);
      showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "🎈");
      playActorVoiceSmart(actor, 3);
    });

    function runNearestCatcherBounce(balloon) {
      var candidates = ["p3-bluey", "p3-kiki", "p3-bingo"];
      var bestNode = null;
      var bestDist = Infinity;
      for (var i = 0; i < candidates.length; i += 1) {
        var n = state.actorNodes[candidates[i]];
        if (n && !n.isCatching) {
          var d = Math.abs((n.liveX || n.config.x) - balloon.x);
          if (d < bestDist) {
            bestDist = d;
            bestNode = n;
          }
        }
      }
      if (!bestNode) {
        return;
      }
      bestNode.isCatching = true;
      var startX = bestNode.config.x;
      var targetX = Math.max(14, Math.min(86, balloon.x));
      if (bestNode.config.role === "kiki") {
        setKikiMood(bestNode, "cheer", 1050);
      }
      triggerActionClass(bestNode, "action-jump", 650);
      var token = state.pageSessionToken;
      runTween({
        duration: 620,
        onUpdate: function (t) {
          if (state.pageSessionToken !== token) {
            return;
          }
          var arc = Math.sin(t * Math.PI);
          var x = startX + (targetX - startX) * arc;
          bestNode.root.style.left = x.toFixed(2) + "%";
          bestNode.liveX = x;
        },
        onDone: function () {
          if (state.pageSessionToken === token) {
            bestNode.root.style.left = startX + "%";
            bestNode.liveX = startX;
          }
          bestNode.isCatching = false;
        }
      });
    }

    function createBalloonStringSvg() {
      var svgNS = "http://www.w3.org/2000/svg";
      var svg = doc.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", "0 0 28 46");
      svg.setAttribute("class", "balloon-string-svg");
      var path = doc.createElementNS(svgNS, "path");
      path.setAttribute("d", "M 14 0 Q 21 12 12 24 T 16 45");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(255, 255, 255, 0.88)");
      path.setAttribute("stroke-width", "2.2");
      path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);
      return svg;
    }

    page.items.forEach(function (balloon, idx) {
      var wrap = doc.createElement("div");
      wrap.className = "balloon-wrap tap-beacon";
      wrap.style.left = balloon.x + "%";
      wrap.style.top = balloon.y + "%";
      wrap.style.setProperty("--drift-dur", (3.2 + (idx % 3) * 0.65) + "s");
      wrap.style.animationDelay = (-idx * 0.72) + "s";

      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "balloon-btn";
      btn.style.setProperty("--balloon-color", balloon.hex || "#FF70A6");
      btn.setAttribute("aria-label", "点击颠高高：" + balloon.label);

      btn.addEventListener("click", function () {
        unlockAudio();
        btn.classList.remove("is-bounced");
        void btn.offsetWidth;
        btn.classList.add("is-bounced");

        p3.bounces += 1;
        Sfx.playPop(Math.min(6, p3.bounces));
        FxEngine.burstSparkles(balloon.x, balloon.y, 16);
        runNearestCatcherBounce(balloon);
        updateHud();

        if (!p3.won && p3.bounces >= 5) {
          p3.won = true;
          updateHud();
          Sfx.playWinChime();
          var allWraps = dom.stageInteractiveLayer.querySelectorAll(".balloon-wrap");
          for (var w = 0; w < allWraps.length; w += 1) {
            allWraps[w].classList.remove("tap-beacon");
          }
          // 布鲁伊、宾果、KIKI 三人同步兴奋高跳！
          ["p3-bluey", "p3-kiki", "p3-bingo"].forEach(function (aid, delayIdx) {
            var an = state.actorNodes[aid];
            if (an) {
              global.setTimeout(function () {
                if (an.config.role === "kiki") {
                  setKikiMood(an, "cheer", 2400);
                }
                triggerActionClass(an, "action-cheer-double", 1100);
              }, delayIdx * 80);
            }
          });
          var winVoice = findVoiceById(page, "p3-balloon-win");
          if (winVoice) {
            playVoice(winVoice.audio);
          }
          unlockTreasure(page.rewardTreasureId, 50, 32);
          dom.btnNextPage.classList.add("is-attention");
          if (dom.btnCornerNext) {
            dom.btnCornerNext.classList.add("is-attention");
          }
        }
      });

      wrap.appendChild(btn);
      wrap.appendChild(createBalloonStringSvg());
      dom.stageInteractiveLayer.appendChild(wrap);
    });
  }

  function renderPage4PawBadges(page) {
    var p4 = state.pageState.p4;

    function countCollected() {
      return page.items.filter(function (item) {
        return Boolean(p4.collected[item.id]);
      }).length;
    }

    function updateHud() {
      setHudPills(
        page.items.map(function (item) {
          return {
            icon: "🐾",
            done: Boolean(p4.collected[item.id])
          };
        })
      );
    }

    function syncVisuals() {
      page.items.forEach(function (item) {
        var isGot = Boolean(p4.collected[item.id]);
        var targetNode = state.actorNodes[item.targetActorId];
        if (targetNode && targetNode.root) {
          targetNode.root.classList.toggle("tap-beacon", !isGot);
        }
      });
      updateHud();
    }

    function playChaseGoldRing(node) {
      if (!node || !node.actionWrap) {
        return;
      }
      var ring = doc.createElement("div");
      ring.className = "actor-gold-ring";
      node.actionWrap.appendChild(ring);
      global.setTimeout(function () {
        if (ring.parentNode) {
          ring.remove();
        }
      }, 900);
      triggerActionClass(node, "action-chase-dash", 750);
    }

    /**
     * 天天扑扇粉翅膀斜向飞上高空在冒险湾瞭望塔前盘旋飞一圈再优雅降落
     */
    function playSkyeSoar(node) {
      if (!node || node.isFlying) {
        return;
      }
      node.isFlying = true;
      var actor = node.config;
      var x0 = actor.x;
      var y0 = actor.y;
      var el = node.root;
      var savedAnim = node.idleWrap.style.animation;
      node.idleWrap.style.animation = "none";

      Sfx.playFlyWhoosh();
      var token = state.pageSessionToken;

      runTween({
        duration: 2100,
        onUpdate: function (t) {
          var x;
          var y;
          var tilt;
          var scale;
          if (t < 0.32) {
            var s1 = t / 0.32;
            var e1 = 1 - Math.pow(1 - s1, 2);
            x = quadBezier(x0, 56, 70, e1);
            y = quadBezier(y0, 44, 24, e1);
            tilt = 15 * Math.sin(s1 * Math.PI);
            scale = 1 - 0.16 * e1;
          } else if (t < 0.68) {
            var s2 = (t - 0.32) / 0.36;
            var ang = s2 * Math.PI * 2;
            x = 56 + Math.cos(ang) * 15;
            y = 22 + Math.sin(ang) * 8;
            tilt = -12 * Math.sin(ang);
            scale = 0.84 + 0.06 * Math.sin(ang);
          } else {
            var s3 = (t - 0.68) / 0.32;
            var e3 = s3 * s3 * (3 - 2 * s3);
            x = quadBezier(70, 52, x0, e3);
            y = quadBezier(22, 42, y0, e3);
            tilt = -10 * (1 - e3);
            scale = 0.84 + 0.16 * e3;
          }
          el.style.left = x.toFixed(2) + "%";
          el.style.top = y.toFixed(2) + "%";
          el.style.transform =
            "translate(-50%, -100%) rotate(" + tilt.toFixed(1) + "deg) scale(" + scale.toFixed(3) + ")";
          FxEngine.spawnTrailParticle(
            x,
            y - node.heightPct * 0.4,
            Math.random() > 0.45 ? "heart" : "star",
            "#FF70A6"
          );
        },
        onDone: function () {
          if (state.pageSessionToken !== token) {
            return;
          }
          el.style.left = x0 + "%";
          el.style.top = y0 + "%";
          el.style.transform = "";
          node.idleWrap.style.animation = savedAnim;
          node.isFlying = false;
          FxEngine.burstHearts(x0, y0 - 16, 14);
        }
      });
    }

    function activatePup(item, actorConfig, actorNode) {
      unlockAudio();
      var wasFirstForPup = !p4.collected[item.id];
      p4.collected[item.id] = true;
      syncVisuals();

      if (actorNode) {
        if (item.id === "chase") {
          playChaseGoldRing(actorNode);
        } else if (item.id === "skye") {
          playSkyeSoar(actorNode);
        } else if (item.id === "marshall") {
          triggerActionClass(actorNode, "action-marshall-flip", 880);
        }
      }

      Sfx.playBadgeChime();
      var origin = actorConfig ? getActorBubbleOrigin(actorConfig) : { x: item.x, y: item.y };
      FxEngine.burstSparkles(origin.x, origin.y, 18);
      showSpeechBubble(origin.x, origin.y, (actorConfig && actorConfig.feedbackText) || item.line, "top");

      var allCollectedNow = countCollected() >= page.items.length;
      var justCompletedAll = wasFirstForPup && allCollectedNow && !p4.cheered;

      if (justCompletedAll) {
        p4.cheered = true;
        unlockTreasure(page.rewardTreasureId, 50, 48);
        dom.btnNextPage.classList.add("is-attention");
        if (dom.btnCornerNext) {
          dom.btnCornerNext.classList.add("is-attention");
        }

        var cheerVoice = findVoiceById(page, "p4-team-cheer");
        playVoice(item.audio, {
          onEnded: function () {
            if (state.currentPage !== 4 || !cheerVoice) {
              return;
            }
            Sfx.playWinChime();
            FxEngine.burstConfetti(50, 42, 34);
            var k4 = state.actorNodes["p4-kiki"];
            if (k4) {
              setKikiMood(k4, "cheer", 2600);
            }
            ["p4-chase", "p4-skye", "p4-marshall", "p4-kiki"].forEach(function (aid, i) {
              var n = state.actorNodes[aid];
              if (n) {
                global.setTimeout(function () {
                  triggerActionClass(n, "action-cheer-double", 1100);
                }, i * 70);
              }
            });
            playVoice(cheerVoice.audio, { silentOnMissing: true });
          }
        });
      } else {
        playVoice(item.audio);
      }
    }

    function findPupItemByBadgeId(badgeId) {
      for (var i = 0; i < page.items.length; i += 1) {
        if (page.items[i].id === badgeId) {
          return page.items[i];
        }
      }
      return null;
    }

    renderActorsLayer(page, function (actor, node) {
      if (actor.badgeId) {
        var pupItem = findPupItemByBadgeId(actor.badgeId);
        if (pupItem) {
          activatePup(pupItem, actor, node);
          return;
        }
      }
      unlockAudio();
      if (actor.role === "kiki") {
        setKikiMood(node, "cheer", 1400);
      }
      triggerActionClass(node, "action-jump", 650);
      Sfx.playPop(1);
      var origin = getActorBubbleOrigin(actor);
      FxEngine.burstSparkles(origin.x, origin.y, 14);
      showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "🐾");
      playActorVoiceSmart(actor, 4);
    });

    syncVisuals();
  }

  function renderPage5LegoBuild(page) {
    var p5 = state.pageState.p5;
    var brickEls = {};

    function placedCount() {
      return page.items.filter(function (item) {
        return Boolean(p5.placed[item.id]);
      }).length;
    }

    function applyCastleScale(cnt) {
      var castleNode = state.actorNodes["p5-castle"];
      if (!castleNode || !castleNode.idleWrap) {
        return;
      }
      var sc = 0.82 + Math.min(5, cnt) * 0.044;
      castleNode.idleWrap.style.transition = "transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)";
      castleNode.idleWrap.style.transform = "scale(" + sc.toFixed(3) + ")";
    }

    function updateHud() {
      setHudPills(
        page.items.map(function (b) {
          return {
            colorDot: b.hex || "#EF233C",
            done: Boolean(p5.placed[b.id])
          };
        })
      );
    }
    updateHud();

    function spawnFlyingBrick(item, targetX, targetY, onLanded) {
      var flyer = doc.createElement("div");
      flyer.className = "lego-flying-brick";
      flyer.style.left = item.x + "%";
      flyer.style.top = item.y + "%";
      flyer.style.setProperty("--brick-color", item.hex || "#EF233C");

      var s1 = doc.createElement("span");
      s1.className = "lego-stud";
      var s2 = doc.createElement("span");
      s2.className = "lego-stud";
      flyer.appendChild(s1);
      flyer.appendChild(s2);
      dom.stageInteractiveLayer.appendChild(flyer);

      var startX = item.x;
      var startY = item.y;
      var ctrlX = (startX + targetX) / 2 - 4;
      var ctrlY = Math.min(startY, targetY) - 20;
      var token = state.pageSessionToken;

      runTween({
        duration: 580,
        onUpdate: function (t) {
          var e = 1 - Math.pow(1 - t, 2);
          var x = quadBezier(startX, ctrlX, targetX, e);
          var y = quadBezier(startY, ctrlY, targetY, e);
          var rot = e * 360;
          var sc = 1 + 0.25 * Math.sin(e * Math.PI);
          flyer.style.left = x.toFixed(2) + "%";
          flyer.style.top = y.toFixed(2) + "%";
          flyer.style.transform = "translate(-50%, -50%) rotate(" + rot.toFixed(0) + "deg) scale(" + sc.toFixed(2) + ")";
          FxEngine.spawnTrailParticle(x, y, "star", item.hex);
        },
        onDone: function () {
          if (flyer.parentNode) {
            flyer.remove();
          }
          if (state.pageSessionToken === token && onLanded) {
            onLanded();
          }
        }
      });
    }

    function triggerNearestMinifigToss(brick) {
      var figs = ["p5-minifig-1", "p5-minifig-2", "p5-minifig-3"];
      var best = null;
      var minDist = Infinity;
      for (var i = 0; i < figs.length; i += 1) {
        var n = state.actorNodes[figs[i]];
        if (n) {
          var d = Math.abs(n.config.x - brick.x);
          if (d < minDist) {
            minDist = d;
            best = n;
          }
        }
      }
      if (best) {
        triggerActionClass(best, "action-jump", 620);
      }
    }

    function placeBrick(item) {
      unlockAudio();
      var castleNode = state.actorNodes["p5-castle"];
      var targetX = castleNode ? castleNode.config.x : 66;
      var targetY = castleNode ? castleNode.config.y - castleNode.heightPct * 0.62 : 38;

      if (p5.placed[item.id]) {
        Sfx.playLegoSnap();
        FxEngine.burstSparkles(targetX, targetY, 12);
        return;
      }

      p5.placed[item.id] = true;
      if (brickEls[item.id]) {
        brickEls[item.id].classList.add("is-placed");
        brickEls[item.id].disabled = true;
      }

      Sfx.playLegoSnap();
      triggerNearestMinifigToss(item);
      updateHud();

      var cnt = placedCount();
      var isFinal = cnt >= page.items.length && !p5.won;
      if (isFinal) {
        p5.won = true;
        updateHud();
      }

      spawnFlyingBrick(item, targetX, targetY, function () {
        FxEngine.burstSparkles(targetX, targetY, 20);
        applyCastleScale(cnt);
        if (castleNode) {
          triggerActionClass(castleNode, "action-castle-snap", 400);
        }

        if (isFinal) {
          var flagNode = state.actorNodes["p5-flag-5"];
          if (flagNode) {
            flagNode.root.classList.remove("is-hidden-actor");
            triggerActionClass(flagNode, "action-flag-rise", 980);
          }
          var k5 = state.actorNodes["p5-kiki"];
          if (k5) {
            setKikiMood(k5, "cheer", 2800);
          }
          ["p5-kiki", "p5-minifig-1", "p5-minifig-2", "p5-minifig-3"].forEach(function (aid, i) {
            var n = state.actorNodes[aid];
            if (n) {
              global.setTimeout(function () {
                triggerActionClass(n, "action-cheer-double", 1100);
              }, i * 70);
            }
          });
          Sfx.playWinChime();
          FxEngine.burstFirework(targetX, targetY - 12, false);
          showSpeechBubble(targetX, targetY, "哇哦！5岁梦幻乐高城堡拼完，生日旗帜升起来啦！", "left", "🧱");
          var winVoice = findVoiceById(page, "p5-lego-win");
          if (winVoice) {
            playVoice(winVoice.audio);
          }
          unlockTreasure(page.rewardTreasureId, targetX, targetY);
          dom.btnNextPage.classList.add("is-attention");
          if (dom.btnCornerNext) {
            dom.btnCornerNext.classList.add("is-attention");
          }
        } else {
          showSpeechBubble(targetX, targetY + 4, "咔哒！又一块漂亮的彩色凸点积木搭上去啦（" + cnt + "/5）", "left", "🧱");
          var clickVoice = findVoiceById(page, "p5-lego-click");
          if (clickVoice) {
            playVoice(clickVoice.audio);
          }
        }
      });
    }

    renderActorsLayer(page, function (actor, node) {
      if (actor.action === "castle-build-next") {
        var nextUnplaced = null;
        for (var i = 0; i < page.items.length; i += 1) {
          if (!p5.placed[page.items[i].id]) {
            nextUnplaced = page.items[i];
            break;
          }
        }
        if (nextUnplaced) {
          placeBrick(nextUnplaced);
        } else {
          unlockAudio();
          Sfx.playSparkle();
          FxEngine.burstFirework(actor.x, actor.y - 34, false);
          var winVoice = findVoiceById(page, "p5-lego-win");
          if (winVoice) {
            playVoice(winVoice.audio);
          }
        }
        return;
      }
      unlockAudio();
      if (actor.role === "kiki") {
        setKikiMood(node, "cheer", 1400);
      }
      triggerActionClass(node, "action-jump", 650);
      Sfx.playLegoSnap();
      var origin = getActorBubbleOrigin(actor);
      FxEngine.burstSparkles(origin.x, origin.y, 12);
      showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "🧱");
      playActorVoiceSmart(actor, 5);
    });

    applyCastleScale(placedCount());

    page.items.forEach(function (brick) {
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "lego-brick-btn" + (p5.placed[brick.id] ? " is-placed" : "");
      btn.style.left = brick.x + "%";
      btn.style.top = brick.y + "%";
      btn.style.setProperty("--brick-color", brick.hex || "#EF233C");
      btn.setAttribute("aria-label", "拼上" + brick.label);

      var stud1 = doc.createElement("span");
      stud1.className = "lego-stud";
      var stud2 = doc.createElement("span");
      stud2.className = "lego-stud";
      btn.appendChild(stud1);
      btn.appendChild(stud2);

      if (p5.placed[brick.id]) {
        btn.disabled = true;
      }

      btn.addEventListener("click", function () {
        placeBrick(brick);
      });
      brickEls[brick.id] = btn;
      dom.stageInteractiveLayer.appendChild(btn);
    });
  }

  function createSvgStringLights(isLit) {
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = doc.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 300");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", "party-lights-garland");

    var wire = doc.createElementNS(svgNS, "path");
    wire.setAttribute("d", "M 20 34 Q 260 148 500 84 Q 740 148 980 34");
    wire.setAttribute("fill", "none");
    wire.setAttribute("stroke", "rgba(255, 240, 195, 0.78)");
    wire.setAttribute("stroke-width", "4");
    svg.appendChild(wire);

    var bulbColors = ["#FFD166", "#FF8FAB", "#70D6FF", "#A7F3D0", "#FDE047"];
    var total = 15;
    for (var i = 0; i < total; i += 1) {
      var t = i / (total - 1);
      var x = 40 + t * 920;
      var y =
        t <= 0.5
          ? (1 - t * 2) * (1 - t * 2) * 38 + 2 * (1 - t * 2) * (t * 2) * 138 + (t * 2) * (t * 2) * 84
          : (1 - (t - 0.5) * 2) * (1 - (t - 0.5) * 2) * 84 +
            2 * (1 - (t - 0.5) * 2) * ((t - 0.5) * 2) * 138 +
            ((t - 0.5) * 2) * ((t - 0.5) * 2) * 38;

      var cap = doc.createElementNS(svgNS, "rect");
      cap.setAttribute("x", String(x - 4));
      cap.setAttribute("y", String(y - 2));
      cap.setAttribute("width", "8");
      cap.setAttribute("height", "8");
      cap.setAttribute("rx", "2");
      cap.setAttribute("fill", "#6b4f5b");
      svg.appendChild(cap);

      var bulb = doc.createElementNS(svgNS, "circle");
      var color = bulbColors[i % bulbColors.length];
      bulb.setAttribute("cx", String(x));
      bulb.setAttribute("cy", String(y + 13));
      bulb.setAttribute("r", "10.5");
      bulb.setAttribute("fill", isLit ? color : "#fff3d6");
      bulb.setAttribute("color", color);
      bulb.setAttribute("data-color", color);
      bulb.setAttribute("class", "light-bulb-circle" + (isLit ? " is-bulb-on" : ""));
      svg.appendChild(bulb);
    }
    return svg;
  }

  function renderPage6PartyLights(page) {
    var p6 = state.pageState.p6;

    function updateHud() {
      setHudPills([{ icon: "💡", done: p6.lightsOn }]);
    }

    renderActorsLayer(page, function (actor, node) {
      unlockAudio();
      if (actor.role === "kiki") {
        setKikiMood(node, "cheer", 1400);
      }
      triggerActionClass(node, "action-jump", 650);
      Sfx.playPop(1);
      var origin = getActorBubbleOrigin(actor);
      FxEngine.burstSparkles(origin.x, origin.y, 14);
      showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "🎉");
      playActorVoiceSmart(actor, 6);
    });

    function ensureP6PlanesPatrol() {
      var jett6 = state.actorNodes["p6-jett"];
      var dizzy6 = state.actorNodes["p6-dizzy"];
      if (jett6 && !jett6.patrolStarted) {
        jett6.patrolStarted = true;
        startSkyPatrol(jett6, {
          cx: 22,
          cy: 26,
          ampX: 11,
          ampY: 4.5,
          freq: 0.72,
          phase: 0,
          baseFacing: 1,
          trailKind: "star",
          trailColor: "#FFE066"
        });
      }
      if (dizzy6 && !dizzy6.patrolStarted) {
        dizzy6.patrolStarted = true;
        startSkyPatrol(dizzy6, {
          cx: 78,
          cy: 26,
          ampX: 11,
          ampY: 4.5,
          freq: 0.68,
          phase: 1.9,
          baseFacing: -1,
          trailKind: "heart",
          trailColor: "#FF8FAB"
        });
      }
    }

    var garlandSvg = createSvgStringLights(p6.lightsOn);
    garlandSvg.setAttribute("role", "button");
    garlandSvg.setAttribute("aria-label", "点亮派对星光灯串");
    dom.stageInteractiveLayer.appendChild(garlandSvg);

    var lightHotspot = page.hotspots[0];
    var lBtn = null;

    var treasureSlotsX = [32, 44, 56, 68];
    var treasureDisplayNodes = [];

    function spawnTableTreasures(animateFlight) {
      for (var k = 0; k < treasureDisplayNodes.length; k += 1) {
        if (treasureDisplayNodes[k].parentNode) {
          treasureDisplayNodes[k].remove();
        }
      }
      treasureDisplayNodes = [];

      DATA.treasures.forEach(function (tr, i) {
        var orb = doc.createElement("div");
        orb.className = "table-treasure-orb";
        var targetX = treasureSlotsX[i] || 50;
        var targetY = 85;
        orb.style.animationDelay = (-i * 0.35) + "s";

        if (tr.sprite) {
          var tImg = doc.createElement("img");
          tImg.src = getSpriteSrc(tr.sprite);
          tImg.alt = tr.name;
          orb.appendChild(tImg);
        } else {
          orb.textContent = tr.emoji;
        }
        dom.stageInteractiveLayer.appendChild(orb);
        treasureDisplayNodes.push(orb);

        if (animateFlight) {
          orb.style.opacity = "0";
          var token = state.pageSessionToken;
          global.setTimeout(function () {
            if (state.pageSessionToken !== token) {
              return;
            }
            orb.style.opacity = "1";
            var startX = 32 + i * 12;
            var startY = 8;
            runTween({
              duration: 620,
              onUpdate: function (t) {
                var e = 1 - Math.pow(1 - t, 3);
                var x = quadBezier(startX, (startX + targetX) / 2, targetX, e);
                var y = quadBezier(startY, 34, targetY, e);
                orb.style.left = x.toFixed(2) + "%";
                orb.style.top = y.toFixed(2) + "%";
                FxEngine.spawnTrailParticle(x, y, "star", tr.color);
              },
              onDone: function () {
                orb.style.left = targetX + "%";
                orb.style.top = targetY + "%";
                FxEngine.burstSparkles(targetX, targetY, 14);
              }
            });
          }, 300 + i * 220);
        } else {
          orb.style.left = targetX + "%";
          orb.style.top = targetY + "%";
        }
      });
    }

    function syncStaticMood() {
      dom.stageMoodLayer.classList.toggle("is-twilight", !p6.lightsOn);
      dom.stageMoodLayer.classList.toggle("is-lights-on", p6.lightsOn);
      if (lBtn) {
        lBtn.classList.toggle("tap-beacon", !p6.lightsOn);
      }
      updateHud();
      if (p6.lightsOn) {
        spawnTableTreasures(false);
        ensureP6PlanesPatrol();
      }
    }

    function turnOnLights() {
      unlockAudio();
      var firstLight = !p6.lightsOn;
      p6.lightsOn = true;
      dom.stageMoodLayer.classList.remove("is-twilight");
      dom.stageMoodLayer.classList.add("is-lights-on");
      if (lBtn) {
        lBtn.classList.remove("tap-beacon");
      }
      updateHud();

      var bulbs = garlandSvg.querySelectorAll(".light-bulb-circle");
      var token = state.pageSessionToken;
      for (var i = 0; i < bulbs.length; i += 1) {
        (function (bulbEl, idx) {
          global.setTimeout(function () {
            if (state.pageSessionToken !== token) {
              return;
            }
            bulbEl.setAttribute("fill", bulbEl.getAttribute("data-color") || "#FFD166");
            bulbEl.classList.add("is-bulb-on");
            if (idx % 2 === 0) {
              Sfx.playBulbTick(idx);
            }
          }, idx * 45);
        })(bulbs[i], i);
      }

      Sfx.playLightsOn();
      FxEngine.burstSparkles(25, 18, 20);
      FxEngine.burstSparkles(50, 16, 24);
      FxEngine.burstSparkles(75, 18, 20);

      spawnTableTreasures(true);
      ensureP6PlanesPatrol();

      var k6 = state.actorNodes["p6-kiki"];
      if (k6) {
        setKikiMood(k6, "cheer", 2600);
      }

      // 全员起跳欢呼
      var actorKeys = Object.keys(state.actorNodes);
      actorKeys.forEach(function (ak, idx) {
        global.setTimeout(function () {
          triggerActionClass(state.actorNodes[ak], "action-cheer-double", 1100);
        }, 250 + idx * 55);
      });

      if (firstLight) {
        FxEngine.burstConfetti(50, 26, 34);
        dom.btnNextPage.classList.add("is-attention");
        if (dom.btnCornerNext) {
          dom.btnCornerNext.classList.add("is-attention");
        }
      }
      if (lightHotspot) {
        showSpeechBubble(lightHotspot.x, 24, lightHotspot.feedbackText, "bottom", "💡");
        if (lightHotspot.audio) {
          playVoice(lightHotspot.audio);
        }
      }
    }

    garlandSvg.addEventListener("click", turnOnLights);
    if (lightHotspot) {
      lBtn = createHotspotButton(lightHotspot, p6.lightsOn ? "" : "tap-beacon");
      lBtn.addEventListener("click", turnOnLights);
      dom.stageInteractiveLayer.appendChild(lBtn);
    }

    syncStaticMood();
  }

  function renderPage7BlowCandles(page) {
    var p7 = state.pageState.p7;
    var candles = getCakeCandleTips();
    var anchors = {};

    renderActorsLayer(page, function (actor, node) {
      unlockAudio();
      if (actor.role === "kiki") {
        setKikiMood(node, "cheer", 1300);
      }
      triggerActionClass(node, "action-jump", 650);
      Sfx.playPop(1);
      var origin = getActorBubbleOrigin(actor);
      FxEngine.burstSparkles(origin.x, origin.y, 14);
      showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "🎂");
      playActorVoiceSmart(actor, 7);
    });

    var cakeNode = state.actorNodes["p7-cake"];
    var flamesContainer = cakeNode ? cakeNode.idleWrap : dom.stageInteractiveLayer;
    var flamesLayer = doc.createElement("div");
    flamesLayer.className = "cake-flames-layer";
    flamesContainer.appendChild(flamesLayer);

    var blowCloudBtn = doc.createElement("button");
    blowCloudBtn.type = "button";
    blowCloudBtn.className = "floating-blow-icon";
    blowCloudBtn.style.left = "72%";
    blowCloudBtn.style.top = "44%";
    blowCloudBtn.setAttribute("aria-label", "呼一口气吹灭剩余蜡烛");
    blowCloudBtn.textContent = "💨";

    function remainingCandles() {
      return candles.filter(function (c) {
        return !p7.blown[c.id];
      });
    }

    function getCandleStageCoords(candle) {
      if (!cakeNode) {
        return { x: candle.x || 50, y: candle.y || 40 };
      }
      var cx = typeof candle.xPct === "number" ? candle.xPct : 50;
      var cy = typeof candle.yPct === "number" ? candle.yPct : 12;
      var cakeCfg = cakeNode.config;
      var leftEdge = cakeCfg.x - cakeNode.widthPct / 2;
      var topEdge = cakeCfg.y - cakeNode.heightPct;
      return {
        x: leftEdge + (cx / 100) * cakeNode.widthPct,
        y: topEdge + (cy / 100) * cakeNode.heightPct
      };
    }

    function syncCandlesUi() {
      var rem = remainingCandles().length;
      setHudPills(
        candles.map(function (c) {
          var isOut = Boolean(p7.blown[c.id]);
          return {
            icon: isOut ? "✨" : "🕯️",
            done: isOut
          };
        })
      );
      for (var i = 0; i < candles.length; i += 1) {
        var c = candles[i];
        if (anchors[c.id]) {
          anchors[c.id].classList.toggle("is-blown", Boolean(p7.blown[c.id]));
        }
      }
      blowCloudBtn.classList.toggle("hidden", rem === 0);
    }

    function onAllCandlesBlown() {
      if (p7.allBlown) {
        return;
      }
      p7.allBlown = true;
      syncCandlesUi();
      Sfx.playWinChime();
      FxEngine.burstFirework(28, 24, true);
      FxEngine.burstFirework(72, 22, true);
      FxEngine.burstConfetti(50, 36, 38);

      var k7 = state.actorNodes["p7-kiki"];
      if (k7) {
        setKikiMood(k7, "cheer", 3000);
      }

      Object.keys(state.actorNodes).forEach(function (ak, idx) {
        if (ak !== "p7-cake") {
          global.setTimeout(function () {
            triggerActionClass(state.actorNodes[ak], "action-cheer-double", 1100);
          }, idx * 70);
        }
      });

      var cheerVoice = findVoiceById(page, "p7-blow-cheer");
      if (cheerVoice) {
        playVoice(cheerVoice.audio);
      }
      ensureBgmForState();
      dom.btnNextPage.classList.add("is-attention");
      if (dom.btnCornerNext) {
        dom.btnCornerNext.classList.add("is-attention");
      }
    }

    function blowSingleCandle(candle) {
      unlockAudio();
      if (p7.blown[candle.id]) {
        return;
      }
      p7.blown[candle.id] = true;
      Sfx.playBlow();
      var stagePt = getCandleStageCoords(candle);

      var kiki7 = state.actorNodes["p7-kiki"];
      if (kiki7) {
        triggerActionClass(kiki7, "action-kiki-blow", 680);
        FxEngine.spawnWindGust(
          kiki7.config.x + 6,
          kiki7.config.y - kiki7.heightPct * 0.62,
          stagePt.x,
          stagePt.y
        );
      }

      FxEngine.spawnContinuousSmoke(stagePt.x, stagePt.y - 1.5, state.pageSessionToken);
      syncCandlesUi();

      if (remainingCandles().length === 0) {
        onAllCandlesBlown();
      }
    }

    candles.forEach(function (candle, idx) {
      var xPct = typeof candle.xPct === "number" ? candle.xPct : candle.x || 50;
      var yPct = typeof candle.yPct === "number" ? candle.yPct : candle.y || 12;

      var anchor = doc.createElement("div");
      anchor.className = "candle-anchor" + (p7.blown[candle.id] ? " is-blown" : "");
      anchor.style.left = xPct + "%";
      anchor.style.top = yPct + "%";
      anchor.style.setProperty("--candle-color", candle.color || "#FFBE0B");

      var flameBtn = doc.createElement("button");
      flameBtn.type = "button";
      flameBtn.className = "candle-flame-btn";
      flameBtn.setAttribute("aria-label", "吹灭" + (candle.label || "第" + (idx + 1) + "根蜡烛"));

      var flame = doc.createElement("span");
      flame.className = "candle-flame";
      flame.style.animationDelay = (-idx * 0.17) + "s";

      flameBtn.appendChild(flame);
      flameBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        blowSingleCandle(candle);
      });
      anchor.appendChild(flameBtn);
      anchors[candle.id] = anchor;
      flamesLayer.appendChild(anchor);
    });

    blowCloudBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      unlockAudio();
      var rem = remainingCandles();
      if (rem.length === 0) {
        return;
      }
      var token = state.pageSessionToken;
      rem.forEach(function (candle, idx) {
        global.setTimeout(function () {
          if (state.pageSessionToken === token && state.currentPage === 7) {
            blowSingleCandle(candle);
          }
        }, idx * 140);
      });
    });

    dom.stageInteractiveLayer.appendChild(blowCloudBtn);
    syncCandlesUi();
  }

  function renderPage8Finale(page) {
    dom.karaokeBar.classList.remove("hidden");
    updateKaraokeDisplay();
    setHudPills([]);

    renderActorsLayer(page, function (actor, node) {
      unlockAudio();
      if (actor.action === "jett-fly-loop" || actor.action === "dizzy-spin-hearts") {
        Sfx.playSparkle();
        FxEngine.burstHearts(node.liveX || actor.x, node.liveY || actor.y, 14);
        showSpeechBubble(node.liveX || actor.x, (node.liveY || actor.y) + 8, actor.feedbackText, "bottom", "💖");
      } else {
        if (actor.role === "kiki") {
          setKikiMood(node, "cheer", 1800);
        }
        triggerActionClass(node, "action-jump", 650);
        Sfx.playPop(2);
        var origin = getActorBubbleOrigin(actor);
        FxEngine.burstConfetti(origin.x, origin.y, 18);
        showSpeechBubble(origin.x, origin.y, actor.feedbackText, actor.bubbleSide, "🎂");
      }
      playActorVoiceSmart(actor, 8);
    });

    var token = state.pageSessionToken;
    var kiki8 = state.actorNodes["p8-kiki"];
    if (kiki8) {
      var kikiBeat = 0;
      function rhythmDanceKiki() {
        if (state.pageSessionToken !== token || state.currentPage !== 8 || !kiki8.root.isConnected) {
          return;
        }
        kikiBeat += 1;
        setKikiMood(kiki8, kikiBeat % 2 === 1 ? "cheer" : "idle");
        global.setTimeout(rhythmDanceKiki, 1450);
      }
      global.setTimeout(rhythmDanceKiki, 700);
    }

    // 乐迪 & 小爱持续拉彩带在夜空来回巡游滑翔
    var jettNode = state.actorNodes["p8-jett"];
    var dizzyNode = state.actorNodes["p8-dizzy"];

    if (jettNode && dizzyNode) {
      var trailHistoryJett = [];
      var trailHistoryDizzy = [];
      var startTs = global.performance ? global.performance.now() : Date.now();

      function updatePatrol(nowTs) {
        if (state.pageSessionToken !== token || state.currentPage !== 8) {
          return;
        }
        var t = ((nowTs || Date.now()) - startTs) / 1000;
        var jx = 50 - 34 * Math.cos(t * 0.55);
        var jy = 26 + 6 * Math.sin(t * 1.1);
        var jFlip = Math.sin(t * 0.55) >= 0 ? 1 : -1;

        var dx = 50 + 34 * Math.cos(t * 0.52 + 0.4);
        var dy = 29 - 6 * Math.sin(t * 1.04 + 0.4);
        var dFlip = Math.sin(t * 0.52 + 0.4) <= 0 ? 1 : -1;

        jettNode.root.style.left = jx.toFixed(2) + "%";
        jettNode.root.style.top = jy.toFixed(2) + "%";
        jettNode.root.style.transform = "translate(-50%, -50%) scaleX(" + jFlip + ")";
        jettNode.liveX = jx;
        jettNode.liveY = jy;

        dizzyNode.root.style.left = dx.toFixed(2) + "%";
        dizzyNode.root.style.top = dy.toFixed(2) + "%";
        dizzyNode.root.style.transform = "translate(-50%, -50%) scaleX(" + dFlip + ")";
        dizzyNode.liveX = dx;
        dizzyNode.liveY = dy;

        trailHistoryJett.push({ x: jx, y: jy + 2 });
        if (trailHistoryJett.length > 26) {
          trailHistoryJett.shift();
        }
        trailHistoryDizzy.push({ x: dx, y: dy + 2 });
        if (trailHistoryDizzy.length > 26) {
          trailHistoryDizzy.shift();
        }
        global.requestAnimationFrame(updatePatrol);
      }
      global.requestAnimationFrame(updatePatrol);

      FxEngine.registerRibbonHook(function (ctx, dims) {
        function drawTrail(pts, colorHex) {
          if (pts.length < 3) {
            return;
          }
          ctx.save();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = colorHex;
          ctx.lineWidth = 4.2 * dims.dpr;
          ctx.shadowColor = colorHex;
          ctx.shadowBlur = 10 * dims.dpr;
          ctx.globalAlpha = 0.65;
          ctx.beginPath();
          for (var i = 0; i < pts.length; i += 1) {
            var px = (pts[i].x / 100) * dims.w;
            var py = (pts[i].y / 100) * dims.h + Math.sin(i * 0.5) * 3 * dims.dpr;
            if (i === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.stroke();
          ctx.restore();
        }
        drawTrail(trailHistoryJett, "#FFBE0B");
        drawTrail(trailHistoryDizzy, "#FF8FAB");
      });
    }

    // 夜空持续循环烟花（避开中心 40%-60% 人物面部）
    function scheduleAutoFirework() {
      if (state.pageSessionToken !== token || state.currentPage !== 8) {
        return;
      }
      var fx = Math.random() < 0.5 ? (14 + Math.random() * 22) : (64 + Math.random() * 22);
      var fy = 12 + Math.random() * 22;
      FxEngine.launchFireworkRocket(fx, 88, fx, fy, token);
      global.setTimeout(scheduleAutoFirework, 1650 + Math.random() * 900);
    }
    FxEngine.burstFirework(25, 22, true);
    FxEngine.burstFirework(75, 22, true);
    global.setTimeout(scheduleAutoFirework, 1200);

    var skyHotspot = page.hotspots && page.hotspots[0];
    if (skyHotspot) {
      var skyBtn = createHotspotButton(skyHotspot);
      skyBtn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        unlockAudio();
        var rect = dom.stageScene.getBoundingClientRect();
        var xPct = ((ev.clientX - rect.left) / rect.width) * 100 || skyHotspot.x;
        var yPct = ((ev.clientY - rect.top) / rect.height) * 100 || skyHotspot.y;
        FxEngine.launchFireworkRocket(xPct, 94, xPct, yPct, token);
      });
      dom.stageInteractiveLayer.appendChild(skyBtn);
    }

    var floatCtrl = doc.createElement("div");
    floatCtrl.className = "finale-float-controls";

    var singBtn = doc.createElement("button");
    singBtn.type = "button";
    singBtn.className = "finale-float-btn";
    singBtn.setAttribute("aria-label", "再唱一遍生日歌");
    singBtn.title = "再唱一遍生日歌";
    singBtn.textContent = "🎶";
    singBtn.addEventListener("click", function () {
      unlockAudio();
      stopVoice();
      state.musicMuted = false;
      updateMusicToggleUi();
      ensureBgmForState({ restartBirthday: true });
      Sfx.playSparkle();
      FxEngine.burstFirework(25, 25, true);
      FxEngine.burstFirework(75, 24, true);
    });

    var noteBtn = doc.createElement("button");
    noteBtn.type = "button";
    noteBtn.className = "finale-float-btn";
    noteBtn.setAttribute("aria-label", "爸爸妈妈的一封信");
    noteBtn.title = "爸爸妈妈的一封信";
    noteBtn.textContent = "💌";
    noteBtn.addEventListener("click", function () {
      unlockAudio();
      Sfx.playSparkle();
      openParentNoteModal();
    });

    var replayBookBtn = doc.createElement("button");
    replayBookBtn.type = "button";
    replayBookBtn.className = "finale-float-btn";
    replayBookBtn.setAttribute("aria-label", "回到第1页再看一遍");
    replayBookBtn.title = "回到第1页";
    replayBookBtn.textContent = "🔄";
    replayBookBtn.addEventListener("click", function () {
      unlockAudio();
      goToPage(1, "prev");
    });

    floatCtrl.appendChild(singBtn);
    floatCtrl.appendChild(noteBtn);
    floatCtrl.appendChild(replayBookBtn);
    dom.stageInteractiveLayer.appendChild(floatCtrl);
  }

  // ======================== 卡拉 OK 歌词同步 ========================

  function updateKaraokeDisplay() {
    if (state.currentPage !== 8) {
      return;
    }
    var manifest = getActiveManifest();
    var lyrics = Array.isArray(manifest.happyBirthdayLyrics) ? manifest.happyBirthdayLyrics : [];
    var t = birthdaySongAudio.currentTime || 0;
    var duration = birthdaySongAudio.duration || 0;

    var active = null;
    for (var i = 0; i < lyrics.length; i += 1) {
      if (t >= lyrics[i].start && t <= lyrics[i].end) {
        active = lyrics[i];
        break;
      }
    }

    var enText = "";
    var zhText = "";
    var progressPct = 0;

    if (active) {
      enText = "🎶 " + active.text;
      zhText = active.zh || "";
      var segLen = Math.max(0.2, active.end - active.start);
      progressPct = Math.max(0, Math.min(100, ((t - active.start) / segLen) * 100));
    } else if (lyrics.length > 0 && t < lyrics[0].start) {
      enText = "🎶 Happy Birthday, KIKI!";
      zhText = "✨ 生日快乐歌即将响起";
      progressPct = duration > 0 ? Math.min(100, (t / Math.max(0.5, lyrics[0].start)) * 100) : 0;
    } else if (lyrics.length > 0 && t > lyrics[lyrics.length - 1].end) {
      enText = "🌟 Happy 5th Birthday, KIKI! 🎉";
      zhText = "🎉 林缨祈五岁生日快乐！";
      progressPct = 100;
    } else {
      enText = "🎶 Happy Birthday to You · KIKI";
      zhText = "🎂 五岁生日快乐！";
    }

    dom.karaokeBar.innerHTML = "";
    var enEl = doc.createElement("p");
    enEl.className = "karaoke-en";
    enEl.textContent = enText;
    var zhEl = doc.createElement("p");
    zhEl.className = "karaoke-zh";
    zhEl.textContent = zhText;
    var track = doc.createElement("div");
    track.className = "karaoke-progress-track";
    var fill = doc.createElement("div");
    fill.className = "karaoke-progress-fill";
    fill.style.width = progressPct.toFixed(1) + "%";
    track.appendChild(fill);

    dom.karaokeBar.appendChild(enEl);
    dom.karaokeBar.appendChild(zhEl);
    dom.karaokeBar.appendChild(track);
  }

  function startKaraokeLoop() {
    if (karaokeRafId !== null) {
      return;
    }
    function loop() {
      if (state.currentPage !== 8 || birthdaySongAudio.paused) {
        updateKaraokeDisplay();
        karaokeRafId = null;
        return;
      }
      updateKaraokeDisplay();
      karaokeRafId = global.requestAnimationFrame(loop);
    }
    karaokeRafId = global.requestAnimationFrame(loop);
  }

  function stopKaraokeLoop() {
    if (karaokeRafId !== null) {
      global.cancelAnimationFrame(karaokeRafId);
      karaokeRafId = null;
    }
  }

  // ======================== 顶部栏、翻页、家长抽屉 ========================

  function renderTreasureBar() {
    dom.treasureBar.innerHTML = "";
    DATA.treasures.forEach(function (treasure) {
      var unlocked = Boolean(state.unlockedTreasures[treasure.id]);
      var slot = doc.createElement("button");
      slot.type = "button";
      slot.className =
        "treasure-slot" +
        (unlocked ? " is-unlocked" : "") +
        (state.justUnlockedTreasureId === treasure.id ? " just-unlocked" : "");
      slot.setAttribute("role", "listitem");
      slot.setAttribute(
        "aria-label",
        treasure.name + (unlocked ? "（已收集）" : "（未收集，第" + treasure.sourcePage + "页解锁）")
      );
      slot.title = unlocked
        ? treasure.name + "：" + treasure.description
        : "第 " + treasure.sourcePage + " 页宝物：" + treasure.name;

      var emojiSpan = doc.createElement("span");
      emojiSpan.className = "treasure-emoji";
      emojiSpan.textContent = treasure.emoji;
      slot.appendChild(emojiSpan);

      slot.addEventListener("click", function () {
        unlockAudio();
        if (unlocked) {
          Sfx.playSparkle();
          showToast(treasure.emoji + " " + treasure.name + "：" + treasure.description);
        } else {
          showToast("第 " + treasure.sourcePage + " 页藏着：" + treasure.emoji + " " + treasure.name);
          if (state.currentPage !== treasure.sourcePage) {
            goToPage(treasure.sourcePage);
          }
        }
      });

      dom.treasureBar.appendChild(slot);
    });
    state.justUnlockedTreasureId = null;
  }

  function renderPageDots() {
    dom.pageDots.innerHTML = "";
    DATA.pages.forEach(function (page) {
      var dot = doc.createElement("button");
      dot.type = "button";
      var cls = "page-dot-btn";
      if (page.pageNumber === state.currentPage) {
        cls += " is-active";
      } else if (page.pageNumber < state.currentPage) {
        cls += " is-visited";
      }
      dot.className = cls;
      dot.textContent = "★";
      dot.setAttribute("aria-label", "跳到第 " + page.pageNumber + " 页：" + page.title);
      dot.title = "P" + page.pageNumber + " · " + page.title;
      dot.addEventListener("click", function () {
        unlockAudio();
        goToPage(page.pageNumber);
      });
      dom.pageDots.appendChild(dot);
    });
  }

  function renderDrawerPageList() {
    var totalUnlocked = Object.keys(state.unlockedTreasures).filter(function (k) {
      return Boolean(state.unlockedTreasures[k]);
    }).length;
    dom.drawerTreasureSummary.textContent = "宝物 " + totalUnlocked + " / " + DATA.treasures.length;

    dom.drawerPageList.innerHTML = "";
    DATA.pages.forEach(function (page) {
      var card = doc.createElement("button");
      card.type = "button";
      card.className = "drawer-page-card" + (page.pageNumber === state.currentPage ? " is-current" : "");

      var thumbWrap = doc.createElement("div");
      thumbWrap.className = "drawer-thumb-wrap";
      var img = doc.createElement("img");
      img.src = withAssetVersion(page.image);
      img.alt = page.title;
      img.loading = "lazy";
      img.addEventListener("error", function () {
        if (page.fallbackImage && img.getAttribute("data-tried-fallback") !== "1") {
          img.setAttribute("data-tried-fallback", "1");
          img.src = withAssetVersion(page.fallbackImage);
        } else {
          img.classList.add("hidden");
        }
      });

      var numBadge = doc.createElement("span");
      numBadge.className = "drawer-thumb-num";
      numBadge.textContent = "P" + page.pageNumber;

      thumbWrap.appendChild(img);
      thumbWrap.appendChild(numBadge);

      if (page.rewardTreasureId) {
        var tr = getTreasureById(page.rewardTreasureId);
        if (tr) {
          var trBadge = doc.createElement("span");
          trBadge.className = "drawer-thumb-treasure";
          trBadge.textContent = state.unlockedTreasures[tr.id] ? tr.emoji : "🔒";
          thumbWrap.appendChild(trBadge);
        }
      }

      var nameEl = doc.createElement("span");
      nameEl.className = "drawer-page-name";
      nameEl.textContent = page.title;

      card.appendChild(thumbWrap);
      card.appendChild(nameEl);
      card.addEventListener("click", function () {
        unlockAudio();
        if (state.bookClosed) {
          state.bookClosed = false;
          dom.body.classList.remove("is-book-closed");
          if (page.pageNumber === state.currentPage && global.KikiPopup3D && typeof global.KikiPopup3D.openBook === "function") {
            global.KikiPopup3D.openBook();
            setDrawerOpen(false);
            return;
          }
        }
        goToPage(page.pageNumber);
        setDrawerOpen(false);
      });
      dom.drawerPageList.appendChild(card);
    });
  }

  function renderDrawerVoiceList() {
    var page = getPageByNumber(state.currentPage);
    var manifest = getActiveManifest();
    var filesMap = (manifest && manifest.files) || {};
    dom.drawerVoiceList.innerHTML = "";

    page.voices.forEach(function (v) {
      var card = doc.createElement("div");
      card.className = "voice-line-card";

      var head = doc.createElement("div");
      head.className = "voice-line-head";

      var left = doc.createElement("div");
      var charSpan = doc.createElement("span");
      charSpan.className = "voice-line-char";
      charSpan.textContent = v.character + " ";

      var metaSpan = doc.createElement("span");
      metaSpan.className = "voice-line-meta";
      var fileName = String(v.audio || "").split("/").pop();
      var fileInfo = filesMap[fileName];
      var durText = fileInfo && typeof fileInfo.durationSec === "number"
        ? " · " + fileInfo.durationSec.toFixed(1) + "s"
        : "";
      metaSpan.textContent = "(" + fileName + durText + ")";
      left.appendChild(charSpan);
      left.appendChild(metaSpan);

      var playBtn = doc.createElement("button");
      playBtn.type = "button";
      var isThisPlaying = state.currentVoiceRawPath === v.audio && !voiceAudio.paused;
      playBtn.className = "voice-line-play" + (isThisPlaying ? " is-playing" : "");
      playBtn.textContent = isThisPlaying ? "🔊 播放中" : "▶ 试听";
      playBtn.addEventListener("click", function () {
        unlockAudio();
        if (v.id === "happy-birthday-en") {
          stopVoice();
          state.musicMuted = false;
          updateMusicToggleUi();
          ensureBgmForState({ restartBirthday: true });
        } else {
          playVoice(v.audio);
        }
      });

      head.appendChild(left);
      head.appendChild(playBtn);

      var textP = doc.createElement("p");
      textP.className = "voice-line-text";
      textP.textContent = v.text;

      card.appendChild(head);
      card.appendChild(textP);
      dom.drawerVoiceList.appendChild(card);
    });
  }

  function updateVoiceUiMetadata() {
    var pack = state.voicePack;
    var btns = doc.querySelectorAll(".voice-pack-btn");
    for (var i = 0; i < btns.length; i += 1) {
      var btnPack = btns[i].getAttribute("data-voice-pack");
      var active = btnPack === pack;
      btns[i].classList.toggle("is-active", active);
      btns[i].setAttribute("aria-checked", active ? "true" : "false");
    }

    dom.drawerVoiceBadge.textContent = pack === "mimo" ? "当前：MiMo 动漫版" : "当前：Edge 卡通版";
    var manifest = getActiveManifest();
    var fileCount = manifest && manifest.files ? Object.keys(manifest.files).length : 0;
    dom.drawerVoiceStatus.textContent = manifest.loadedFromFile
      ? "当前已启用「" + (pack === "edge" ? "Edge 卡通版" : "小米 MiMo 动漫版") + "」全书配音（共 " + fileCount + " 段故事语音，随时切换）"
      : "故事配音准备中，轻点画面即可收听";

    renderDrawerVoiceList();
  }

  function updateAudioStatusIndicators() {
    var label = "待交互解锁";
    if (state.audioUnlocked) {
      if (state.currentVoiceRawPath && !voiceAudio.paused) {
        label = "正在播放语音";
      } else if (state.musicMuted) {
        label = "已解锁（音乐静音）";
      } else if (state.activeBgmMode === "birthday") {
        label = "播放生日歌 🎶";
      } else {
        label = "播放柔和 BGM 🎵";
      }
    }
    dom.drawerAudioState.textContent = label;
    renderDrawerVoiceList();
  }

  function updateMusicToggleUi() {
    dom.btnToggleBgm.classList.toggle("is-muted", state.musicMuted);
    dom.btnToggleBgm.setAttribute("aria-pressed", state.musicMuted ? "false" : "true");
    var emoji = dom.btnToggleBgm.querySelector(".btn-emoji");
    if (emoji) {
      emoji.textContent = state.musicMuted ? "🔇" : "🎵";
    }
  }

  function renderParentNoteModalContent() {
    var note = DATA.bookMeta.parentNote;
    dom.parentNoteTitle.textContent = note.title;
    dom.parentNoteGreeting.textContent = note.greeting;
    dom.parentNoteParagraphs.innerHTML = "";
    note.paragraphs.forEach(function (para) {
      var p = doc.createElement("p");
      p.textContent = para;
      dom.parentNoteParagraphs.appendChild(p);
    });
    dom.parentNoteSignature.textContent = note.signature;
    if (dom.parentNoteHint) {
      dom.parentNoteHint.textContent = note.hint || "";
      dom.parentNoteHint.classList.toggle("hidden", !note.hint);
    }
  }

  function openParentNoteModal() {
    renderParentNoteModalContent();
    state.parentNoteOpen = true;
    dom.parentNoteBackdrop.classList.remove("hidden");
    dom.parentNoteBackdrop.setAttribute("aria-hidden", "false");
  }

  function closeParentNoteModal() {
    state.parentNoteOpen = false;
    dom.parentNoteBackdrop.classList.add("hidden");
    dom.parentNoteBackdrop.setAttribute("aria-hidden", "true");
  }

  function setDrawerOpen(open) {
    state.drawerOpen = Boolean(open);
    dom.parentDrawer.classList.toggle("is-open", state.drawerOpen);
    dom.parentDrawer.setAttribute("aria-hidden", state.drawerOpen ? "false" : "true");
    dom.drawerBackdrop.classList.toggle("hidden", !state.drawerOpen);
    dom.btnOpenDrawer.setAttribute("aria-expanded", state.drawerOpen ? "true" : "false");
    if (state.drawerOpen) {
      renderDrawerPageList();
      updateVoiceUiMetadata();
    }
  }

  function updateStageAspectFromImage(img) {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      STAGE_RATIO = img.naturalWidth / img.naturalHeight;
      dom.stageFrame.style.setProperty("--stage-aspect", img.naturalWidth + " / " + img.naturalHeight);
      dom.stageFrame.style.setProperty("--stage-ratio", STAGE_RATIO.toFixed(4));
    }
  }

  function updateBookStackThickness(pageNum) {
    var total = DATA.pages.length;
    var leftPx = 4 + (pageNum - 1) * 1.8;
    var rightPx = 4 + (total - pageNum) * 1.8;
    if (dom.stageFrame) {
      dom.stageFrame.style.setProperty("--left-stack", leftPx.toFixed(1) + "px");
      dom.stageFrame.style.setProperty("--right-stack", rightPx.toFixed(1) + "px");
    }
    if (dom.btnCornerPrev) {
      dom.btnCornerPrev.classList.toggle("hidden", pageNum <= 1);
    }
    if (dom.btnCornerNext) {
      dom.btnCornerNext.classList.toggle("hidden", pageNum >= total);
      dom.btnCornerNext.classList.remove("is-attention");
    }
  }

  function renderCurrentPage() {
    state.pageSessionToken += 1;
    var page = getPageByNumber(state.currentPage);
    dom.body.setAttribute("data-page", String(page.pageNumber));
    dom.pageIndicator.textContent = page.pageNumber + " / " + DATA.pages.length;
    dom.pageSubtitlePill.textContent = page.title;
    if (dom.drawerHashDisplay) {
      dom.drawerHashDisplay.textContent = "第 " + page.pageNumber + " / " + DATA.pages.length + " 页";
    }

    dom.btnPrevPage.disabled = page.pageNumber <= 1;
    dom.btnNextPage.disabled = page.pageNumber >= DATA.pages.length;
    updateBookStackThickness(page.pageNumber);

    dom.captionSpeaker.textContent = page.speakerTag;
    dom.captionStory.textContent = page.storyText;
    dom.captionHint.textContent = "💡 " + page.interactionHint;

    dom.fallbackPageName.textContent = "第 " + page.pageNumber + " 页 · " + page.title;
    dom.stageImageFallback.classList.add("hidden");
    dom.stageImage.classList.remove("hidden");
    dom.stageImage.alt = page.title + " - " + page.subtitle;
    dom.stageImage.setAttribute("data-tried-fallback", "0");
    dom.stageImage.src = withAssetVersion(page.image);

    renderPageInteractive(page);
    renderPageDots();
    renderDrawerPageList();
    renderDrawerVoiceList();
    if (global.KikiPopup3D && typeof global.KikiPopup3D.isReady === "function" && global.KikiPopup3D.isReady() && !state.isFlippingPage) {
      global.KikiPopup3D.setPage(page.pageNumber, state.pageState);
    }
  }

  function triggerPopupEntrance() {
    if (!dom.stageActorsLayer) {
      return;
    }
    dom.stageActorsLayer.classList.remove("is-popup-entering");
    void dom.stageActorsLayer.offsetWidth;
    dom.stageActorsLayer.classList.add("is-popup-entering");
    global.setTimeout(function () {
      dom.stageActorsLayer.classList.remove("is-popup-entering");
    }, 680);
  }

  function runCssFallbackFlip(dir, onMidpoint, onComplete) {
    if (!dom.cssFlipFallback) {
      onMidpoint();
      onComplete();
      return;
    }
    dom.cssFlipFallback.className = "css-flip-fallback " + (dir === "prev" ? "flip-prev" : "flip-next");
    global.setTimeout(onMidpoint, 290);
    global.setTimeout(function () {
      dom.cssFlipFallback.className = "css-flip-fallback hidden";
      onComplete();
    }, 620);
  }

  function updateUrlHash(pageNum) {
    var targetHash = "#page=" + pageNum;
    if (global.location.hash === targetHash) {
      return;
    }
    try {
      if (global.history && typeof global.history.replaceState === "function") {
        global.history.replaceState(null, "", targetHash);
        return;
      }
    } catch (_err) {
      // 回退至直接设置 hash
    }
    global.location.hash = targetHash;
  }

  function goToPage(pageNum, explicitDirection, options) {
    var opts = options || {};
    var clamped = Math.max(1, Math.min(DATA.pages.length, Number(pageNum) || 1));
    var prevPage = state.currentPage;
    var dir = explicitDirection || (clamped >= prevPage ? "next" : "prev");
    var changed = clamped !== prevPage;

    if (!changed) {
      stopVoice();
      renderCurrentPage();
      ensureBgmForState();
      return;
    }

    if (state.isFlippingPage && !opts.instant) {
      return;
    }
    if (state.bookClosed) {
      state.bookClosed = false;
      dom.body.classList.remove("is-book-closed");
    }

    stopVoice();
    state.actorVoiceTracker = {};
    state.pageAutoSpoken = {};
    if (state.audioUnlocked) {
      Sfx.playPageTurn();
    }

    function applyMidpoint() {
      state.currentPage = clamped;
      var pg = getPageByNumber(clamped);
      state.lastPageVoiceRawPath = pg.narrationAudio;
      updateUrlHash(clamped);
      renderCurrentPage();
      ensureBgmForState();
    }

    function finalizeFlip() {
      state.isFlippingPage = false;
      dom.stageActorsLayer.classList.remove("is-popup-folding");
      dom.stageScene.classList.remove("is-3d-flipping");
      triggerPopupEntrance();
      var pg = getPageByNumber(state.currentPage);
      schedulePageNarration(pg);
    }

    if (opts.instant) {
      applyMidpoint();
      triggerPopupEntrance();
      schedulePageNarration(getPageByNumber(clamped));
      return;
    }

    state.isFlippingPage = true;
    if (global.KikiPopup3D && typeof global.KikiPopup3D.isReady === "function" && global.KikiPopup3D.isReady()) {
      global.KikiPopup3D.flipToPage(prevPage, clamped, dir, state.pageState, {
        onMidpoint: applyMidpoint,
        onComplete: finalizeFlip
      });
      return;
    }

    if (dom.stageFrame) {
      dom.stageFrame.style.setProperty("--px", "0");
      dom.stageFrame.style.setProperty("--py", "0");
    }
    dom.stageActorsLayer.classList.remove("is-popup-entering");
    dom.stageActorsLayer.classList.add("is-popup-folding");

    global.setTimeout(function () {
      dom.stageActorsLayer.classList.remove("is-popup-folding");
      dom.stageScene.classList.add("is-3d-flipping");
      runCssFallbackFlip(dir, applyMidpoint, finalizeFlip);
    }, 110);
  }

  function parsePageFromHash() {
    var h = (global.location.hash || "").trim();
    var m = h.match(/#(?:page=)?(\d+)/i);
    if (!m) {
      return 1;
    }
    return Math.max(1, Math.min(DATA.pages.length, parseInt(m[1], 10) || 1));
  }

  function resetCurrentPageInteractions() {
    var fresh = createFreshPageState();
    var key = "p" + state.currentPage;
    if (fresh[key]) {
      state.pageState[key] = fresh[key];
    }
    renderCurrentPage();
    ensureBgmForState();
    showToast("已重置第 " + state.currentPage + " 页互动状态");
  }

  function resetAllProgress() {
    state.pageState = createFreshPageState();
    state.unlockedTreasures = {};
    saveUnlockedTreasures();
    renderTreasureBar();
    renderCurrentPage();
    ensureBgmForState();
    if (global.KikiPopup3D && typeof global.KikiPopup3D.setUnlockedTreasures === "function") {
      global.KikiPopup3D.setUnlockedTreasures(state.unlockedTreasures);
    }
    showToast("已重置全书宝物收集与页面交互");
  }

  // ======================== 事件绑定与启动 ========================

  function bindGlobalEvents() {
    dom.stageImage.addEventListener("load", function () {
      dom.stageImageFallback.classList.add("hidden");
      dom.stageImage.classList.remove("hidden");
      updateStageAspectFromImage(dom.stageImage);
    });

    dom.stageImage.addEventListener("error", function () {
      var page = getPageByNumber(state.currentPage);
      if (page && page.fallbackImage && dom.stageImage.getAttribute("data-tried-fallback") !== "1") {
        dom.stageImage.setAttribute("data-tried-fallback", "1");
        dom.stageImage.src = withAssetVersion(page.fallbackImage);
        return;
      }
      dom.stageImage.classList.add("hidden");
      dom.stageImageFallback.classList.remove("hidden");
    });

    dom.btnPrevPage.addEventListener("click", function () {
      unlockAudio();
      if (state.currentPage > 1) {
        goToPage(state.currentPage - 1, "prev");
      }
    });

    dom.btnNextPage.addEventListener("click", function () {
      unlockAudio();
      if (state.currentPage < DATA.pages.length) {
        goToPage(state.currentPage + 1, "next");
      }
    });

    if (dom.btnOpenBook) {
      dom.btnOpenBook.addEventListener("click", function () {
        unlockAudio();
        if (global.KikiPopup3D && typeof global.KikiPopup3D.isReady === "function" && global.KikiPopup3D.isReady()) {
          global.KikiPopup3D.openBook();
        } else {
          state.bookClosed = false;
          dom.body.classList.remove("is-book-closed");
          schedulePageNarration(getPageByNumber(state.currentPage));
        }
      });
    }

    if (dom.btnBookCover) {
      dom.btnBookCover.addEventListener("click", function () {
        if (state.isFlippingPage) {
          return;
        }
        unlockAudio();
        if (global.KikiPopup3D && typeof global.KikiPopup3D.isReady === "function" && global.KikiPopup3D.isReady()) {
          if (typeof global.KikiPopup3D.isBookOpen === "function" && global.KikiPopup3D.isBookOpen()) {
            stopVoice();
            if (state.drawerOpen) {
              setDrawerOpen(false);
            }
            if (state.captionVisible) {
              state.captionVisible = false;
              dom.body.classList.remove("show-parent-captions");
            }
            global.KikiPopup3D.closeBook();
          } else {
            global.KikiPopup3D.openBook();
          }
        }
      });
    }

    dom.btnToggleBgm.addEventListener("click", function () {
      unlockAudio();
      state.musicMuted = !state.musicMuted;
      updateMusicToggleUi();
      ensureBgmForState();
      showToast(state.musicMuted ? "🔇 已暂停背景音乐" : "🎵 已开启背景音乐");
    });

    dom.btnReplayVoice.addEventListener("click", function () {
      unlockAudio();
      var page = getPageByNumber(state.currentPage);
      if (page && page.narrationAudio) {
        playVoice(page.narrationAudio);
      }
    });

    if (dom.btnLookCloser) {
      dom.btnLookCloser.addEventListener("click", function () {
        unlockAudio();
        toggleLookCloserMode();
      });
    }

    if (dom.btnFinaleSing) {
      dom.btnFinaleSing.addEventListener("click", function () {
        unlockAudio();
        stopVoice();
        state.musicMuted = false;
        updateMusicToggleUi();
        ensureBgmForState({ restartBirthday: true });
        Sfx.playSparkle();
        if (global.KikiPopup3D && typeof global.KikiPopup3D.triggerFireworks3D === "function") {
          global.KikiPopup3D.triggerFireworks3D();
        }
      });
    }

    if (dom.btnFinaleNote) {
      dom.btnFinaleNote.addEventListener("click", function () {
        unlockAudio();
        Sfx.playSparkle();
        openParentNoteModal();
      });
    }

    if (dom.btnFinaleReplay) {
      dom.btnFinaleReplay.addEventListener("click", function () {
        unlockAudio();
        goToPage(1, "prev");
      });
    }

    if (dom.btnToggleSubtitle) {
      dom.btnToggleSubtitle.addEventListener("click", function () {
        unlockAudio();
        state.captionVisible = !state.captionVisible;
        if (state.captionVisible) {
          state.captionCollapsed = false;
          dom.captionCard.classList.remove("is-collapsed");
          dom.btnToggleCaption.textContent = "▾";
          dom.btnToggleCaption.setAttribute("aria-expanded", "true");
        }
        dom.body.classList.toggle("show-parent-captions", state.captionVisible);
        dom.btnToggleSubtitle.setAttribute("aria-pressed", state.captionVisible ? "true" : "false");
        dom.btnToggleSubtitle.classList.toggle("is-active", state.captionVisible);
      });
    }

    dom.btnToggleCaption.addEventListener("click", function () {
      state.captionVisible = false;
      dom.body.classList.remove("show-parent-captions");
      if (dom.btnToggleSubtitle) {
        dom.btnToggleSubtitle.setAttribute("aria-pressed", "false");
        dom.btnToggleSubtitle.classList.remove("is-active");
      }
    });

    dom.btnOpenDrawer.addEventListener("click", function () {
      unlockAudio();
      setDrawerOpen(!state.drawerOpen);
    });

    dom.btnCloseDrawer.addEventListener("click", function () {
      setDrawerOpen(false);
    });

    dom.drawerBackdrop.addEventListener("click", function () {
      setDrawerOpen(false);
    });

    var voiceBtns = doc.querySelectorAll(".voice-pack-btn");
    for (var i = 0; i < voiceBtns.length; i += 1) {
      voiceBtns[i].addEventListener("click", function (ev) {
        var pack = ev.currentTarget.getAttribute("data-voice-pack");
        switchVoicePack(pack);
      });
    }

    dom.btnResetCurrentPage.addEventListener("click", function () {
      unlockAudio();
      resetCurrentPageInteractions();
    });

    dom.btnResetAllProgress.addEventListener("click", function () {
      unlockAudio();
      resetAllProgress();
    });

    dom.btnCloseParentNote.addEventListener("click", closeParentNoteModal);
    dom.parentNoteBackdrop.addEventListener("click", function (ev) {
      if (ev.target === dom.parentNoteBackdrop) {
        closeParentNoteModal();
      }
    });

    // P8 点击舞台任意处发射升空烟花
    dom.stageScene.addEventListener("click", function (ev) {
      if (state.currentPage !== 8 || state.swipeJustHappened) {
        return;
      }
      if (ev.target.closest("button") || ev.target.closest(".sprite-actor.is-clickable")) {
        return;
      }
      unlockAudio();
      var rect = dom.stageScene.getBoundingClientRect();
      var xPct = Math.max(8, Math.min(92, ((ev.clientX - rect.left) / rect.width) * 100));
      var yPct = Math.max(10, Math.min(76, ((ev.clientY - rect.top) / rect.height) * 100));
      FxEngine.launchFireworkRocket(xPct, 94, xPct, yPct, state.pageSessionToken);
    });

    // 实体书翘起纸角点击 & 实时拖拽翻页
    function bindCornerDrag(btnEl, dir) {
      if (!btnEl) {
        return;
      }
      var dragActive = false;
      var dragStarted3D = false;
      var dragMoved = false;
      var downX = 0;
      var lastProg = 0;
      var fromPage = 1;
      var toPage = 2;

      btnEl.addEventListener("pointerdown", function (ev) {
        if (state.isFlippingPage) {
          return;
        }
        var target = dir === "next" ? state.currentPage + 1 : state.currentPage - 1;
        if (target < 1 || target > DATA.pages.length) {
          return;
        }
        unlockAudio();
        dragActive = true;
        dragStarted3D = false;
        dragMoved = false;
        downX = ev.clientX;
        lastProg = 0;
        fromPage = state.currentPage;
        toPage = target;
        if (btnEl.setPointerCapture) {
          try {
            btnEl.setPointerCapture(ev.pointerId);
          } catch (_e) {}
        }
      });

      btnEl.addEventListener("pointermove", function (ev) {
        if (!dragActive) {
          return;
        }
        var dx = dir === "next" ? downX - ev.clientX : ev.clientX - downX;
        if (dx > 18) {
          dragMoved = true;
        }
      });

      function onCornerRelease() {
        if (!dragActive) {
          return;
        }
        dragActive = false;
        if (dragMoved || !dragMoved) {
          goToPage(toPage, dir);
        }
      }

      btnEl.addEventListener("pointerup", onCornerRelease);
      btnEl.addEventListener("pointercancel", function () {
        dragActive = false;
      });
    }

    bindCornerDrag(dom.btnCornerNext, "next");
    bindCornerDrag(dom.btnCornerPrev, "prev");

    // 3D 立体绘本裸眼细腻景深微视差（rAF 节流）
    var parallaxPending = false;
    var parallaxNx = 0;
    var parallaxNy = 0;
    dom.stageScene.addEventListener("pointermove", function (ev) {
      if (state.isFlippingPage || !dom.stageFrame) {
        return;
      }
      var rect = dom.stageScene.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      parallaxNx = Math.max(-1, Math.min(1, ((ev.clientX - rect.left) / rect.width - 0.5) * 2));
      parallaxNy = Math.max(-1, Math.min(1, ((ev.clientY - rect.top) / rect.height - 0.5) * 2));
      if (!parallaxPending) {
        parallaxPending = true;
        global.requestAnimationFrame(function () {
          parallaxPending = false;
          if (!state.isFlippingPage && dom.stageFrame) {
            dom.stageFrame.style.setProperty("--px", parallaxNx.toFixed(3));
            dom.stageFrame.style.setProperty("--py", parallaxNy.toFixed(3));
          }
        });
      }
    });
    dom.stageScene.addEventListener("pointerleave", function () {
      if (dom.stageFrame) {
        dom.stageFrame.style.setProperty("--px", "0");
        dom.stageFrame.style.setProperty("--py", "0");
      }
    });

    // 触屏左右滑动翻页
    var touchStartX = 0;
    var touchStartY = 0;
    var pointerActive = false;

    dom.stageScene.addEventListener("pointerdown", function (ev) {
      if (ev.target && ev.target.closest(".page-corner-hotzone")) {
        return;
      }
      pointerActive = true;
      touchStartX = ev.clientX;
      touchStartY = ev.clientY;
    });

    dom.stageScene.addEventListener("pointerup", function (ev) {
      if (!pointerActive) {
        return;
      }
      pointerActive = false;
      var dx = ev.clientX - touchStartX;
      var dy = ev.clientY - touchStartY;
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        state.swipeJustHappened = true;
        global.setTimeout(function () {
          state.swipeJustHappened = false;
        }, 120);
        unlockAudio();
        if (dx < 0 && state.currentPage < DATA.pages.length) {
          goToPage(state.currentPage + 1, "next");
        } else if (dx > 0 && state.currentPage > 1) {
          goToPage(state.currentPage - 1, "prev");
        }
      }
    });

    // 键盘快捷键：← / → 翻页，G 开关验收抽屉，Esc 关闭弹层
    doc.addEventListener("keydown", function (ev) {
      var tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }
      if (ev.key === "Escape") {
        if (state.parentNoteOpen) {
          closeParentNoteModal();
        } else if (state.drawerOpen) {
          setDrawerOpen(false);
        }
        return;
      }
      if (ev.key === "g" || ev.key === "G") {
        ev.preventDefault();
        setDrawerOpen(!state.drawerOpen);
        return;
      }
      if (state.bookClosed && !state.drawerOpen && !state.parentNoteOpen) {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowRight") {
          ev.preventDefault();
          unlockAudio();
          if (global.KikiPopup3D && typeof global.KikiPopup3D.isReady === "function" && global.KikiPopup3D.isReady()) {
            global.KikiPopup3D.openBook();
          } else {
            state.bookClosed = false;
            dom.body.classList.remove("is-book-closed");
            schedulePageNarration(getPageByNumber(state.currentPage));
          }
        }
        return;
      }
      if (ev.key === "z" || ev.key === "Z") {
        ev.preventDefault();
        toggleLookCloserMode();
        return;
      }
      if (state.parentNoteOpen) {
        return;
      }
      if (ev.key === "ArrowLeft" && state.currentPage > 1) {
        unlockAudio();
        goToPage(state.currentPage - 1, "prev");
      } else if (ev.key === "ArrowRight" && state.currentPage < DATA.pages.length) {
        unlockAudio();
        goToPage(state.currentPage + 1, "next");
      }
    });

    global.addEventListener("hashchange", function () {
      var target = parsePageFromHash();
      if (target !== state.currentPage) {
        goToPage(target);
      }
    });

    birthdaySongAudio.addEventListener("timeupdate", function () {
      if (state.currentPage === 8) {
        updateKaraokeDisplay();
      }
    });

    birthdaySongAudio.addEventListener("ended", function () {
      stopKaraokeLoop();
      if (state.currentPage === 8) {
        updateKaraokeDisplay();
      }
      updateAudioStatusIndicators();
    });

    function onFirstGesture() {
      if (!state.audioUnlocked) {
        unlockAudio();
        var current = getPageByNumber(state.currentPage);
        if (!state.bookClosed && current && current.narrationAudio && !state.currentVoiceRawPath && !state.narrationTimer) {
          schedulePageNarration(current);
        }
      }
      doc.removeEventListener("pointerdown", onFirstGesture);
      doc.removeEventListener("keydown", onFirstGesture);
    }
    doc.addEventListener("pointerdown", onFirstGesture);
    doc.addEventListener("keydown", onFirstGesture);
  }

  function init() {
    state.voicePack = loadInitialVoicePack();
    state.unlockedTreasures = loadSavedTreasures();
    var rawHash = (global.location.hash || "").trim();
    var hasExplicitPageHash = /^#(?:page=)?([2-8])$/i.test(rawHash);
    state.currentPage = parsePageFromHash();
    state.lastPageVoiceRawPath = getPageByNumber(state.currentPage).narrationAudio;
    state.bookClosed = !hasExplicitPageHash;
    dom.body.classList.toggle("is-book-closed", state.bookClosed);

    dom.bookTitle.textContent = DATA.bookMeta.title;
    doc.title = DATA.bookMeta.title;

    renderTreasureBar();
    updateMusicToggleUi();
    updateVoiceUiMetadata();
    bindGlobalEvents();
    updateUrlHash(state.currentPage);

    loadManifest(state.voicePack);

    var renderedInitial = false;
    function renderOnce() {
      if (renderedInitial) {
        return;
      }
      renderedInitial = true;
      renderCurrentPage();
    }

    var metaTimeout = global.setTimeout(renderOnce, 550);
    loadSpritesMeta().then(function () {
      global.clearTimeout(metaTimeout);
      renderOnce();
    });

    function initPopup3dEngine() {
      if (global.KikiPopup3D && typeof global.KikiPopup3D.init === "function" && !global.KikiPopup3D.isReady()) {
        var ok = global.KikiPopup3D.init(
          dom.popup3dCanvas,
          DATA,
          {
            onSelectActor: handle3dSelectActor,
            onInteractItem: handle3dInteractItem,
            onRequestTurnPage: function (delta) {
              unlockAudio();
              goToPage(state.currentPage + delta, delta > 0 ? "next" : "prev");
            },
            onBookOpening: function () {
              state.bookClosed = false;
              dom.body.classList.remove("is-book-closed");
              unlockAudio();
              Sfx.playPageTurn();
              Sfx.playSparkle();
            },
            onBookOpened: function () {
              state.bookClosed = false;
              dom.body.classList.remove("is-book-closed");
              renderCurrentPage();
              schedulePageNarration(getPageByNumber(state.currentPage));
            },
            onBookClosed: function () {
              state.bookClosed = true;
              dom.body.classList.add("is-book-closed");
              stopVoice();
            },
            onFloorWalk: function () {
              unlockAudio();
              Sfx.playPop(3);
            }
          },
          { startClosed: !hasExplicitPageHash }
        );
        if (ok) {
          global.KikiPopup3D.setUnlockedTreasures(state.unlockedTreasures);
          global.KikiPopup3D.setPage(state.currentPage, state.pageState);
          stopAllTweens();
          FxEngine.clear();
          renderPageInteractive(getPageByNumber(state.currentPage));
        }
      }
    }
    initPopup3dEngine();
    global.addEventListener("kiki-popup3d-ready", initPopup3dEngine);
  }

  init();
})(window, document);
