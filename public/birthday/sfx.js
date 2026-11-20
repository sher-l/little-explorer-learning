/**
 * 《林缨祈 KIKI 的5岁生日大冒险》Web Audio 交互音效引擎 (V2)
 *
 * 严格遵循 CSP 与儿童听觉保护原则：
 * - 全部声音采用柔和正弦波/三角波与温和低通滤波包络，避免刺耳高频或方波
 * - 在首次用户交互时安全解锁 AudioContext，绝不抛出未捕获异常
 */
(function (global) {
  "use strict";

  var ctx = null;
  var masterGain = null;
  var noiseBuffer = null;
  var muted = false;

  function getAudioContextCtor() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    var Ctor = getAudioContextCtor();
    if (!Ctor) {
      return null;
    }
    try {
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.42;
      masterGain.connect(ctx.destination);
    } catch (_err) {
      ctx = null;
      masterGain = null;
    }
    return ctx;
  }

  function unlock() {
    var audioCtx = ensureContext();
    if (!audioCtx) {
      return false;
    }
    if (audioCtx.state === "suspended" && typeof audioCtx.resume === "function") {
      try {
        var res = audioCtx.resume();
        if (res && typeof res.catch === "function") {
          res.catch(function () {});
        }
      } catch (_err) {
        // 忽略受限环境下的恢复异常
      }
    }
    return true;
  }

  function getNoiseBuffer(audioCtx) {
    if (noiseBuffer && noiseBuffer.sampleRate === audioCtx.sampleRate) {
      return noiseBuffer;
    }
    var length = Math.floor(audioCtx.sampleRate * 0.6);
    var buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < length; i += 1) {
      var white = Math.random() * 2 - 1;
      // 轻柔粉红化滤波，降低高频沙哑感
      last = (last + 0.08 * white) / 1.08;
      data[i] = last * 2.2;
    }
    noiseBuffer = buffer;
    return buffer;
  }

  function playTone(opts) {
    if (muted) {
      return;
    }
    var audioCtx = ensureContext();
    if (!audioCtx || !masterGain || audioCtx.state === "suspended") {
      return;
    }

    var now = audioCtx.currentTime + (opts.delay || 0);
    var duration = opts.duration || 0.2;
    var osc = audioCtx.createOscillator();
    var filter = audioCtx.createBiquadFilter();
    var gain = audioCtx.createGain();

    osc.type = opts.type || "sine";
    osc.frequency.setValueAtTime(opts.freq || 440, now);
    if (opts.endFreq) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, opts.endFreq),
        now + duration
      );
    }

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(opts.cutoff || 2800, now);

    var peak = Math.max(0.001, opts.gain || 0.25);
    var attack = Math.min(opts.attack || 0.015, duration * 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function playFilteredNoise(opts) {
    if (muted) {
      return;
    }
    var audioCtx = ensureContext();
    if (!audioCtx || !masterGain || audioCtx.state === "suspended") {
      return;
    }

    var now = audioCtx.currentTime + (opts.delay || 0);
    var duration = opts.duration || 0.2;
    var source = audioCtx.createBufferSource();
    source.buffer = getNoiseBuffer(audioCtx);

    var filter = audioCtx.createBiquadFilter();
    filter.type = opts.filterType || "bandpass";
    filter.frequency.setValueAtTime(opts.startFreq || 800, now);
    if (opts.endFreq) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(80, opts.endFreq),
        now + duration
      );
    }
    filter.Q.value = opts.q || 1.2;

    var gain = audioCtx.createGain();
    var peak = Math.max(0.001, opts.gain || 0.16);
    var attack = Math.min(opts.attack || 0.025, duration * 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function playPageTurn() {
    unlock();
    playFilteredNoise({
      filterType: "bandpass",
      startFreq: 760,
      endFreq: 1350,
      q: 0.9,
      duration: 0.15,
      gain: 0.14
    });
    playTone({
      type: "sine",
      freq: 523.25,
      endFreq: 659.25,
      duration: 0.14,
      delay: 0.03,
      gain: 0.09,
      cutoff: 1800
    });
  }

  function playSparkle() {
    unlock();
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i += 1) {
      playTone({
        type: "sine",
        freq: notes[i],
        duration: 0.24,
        delay: i * 0.055,
        gain: 0.15,
        cutoff: 3200
      });
    }
  }

  function playPop(pitchBoost) {
    unlock();
    var base = 340 + (pitchBoost || 0) * 35;
    playTone({
      type: "sine",
      freq: base,
      endFreq: base * 1.95,
      duration: 0.11,
      attack: 0.008,
      gain: 0.24,
      cutoff: 2400
    });
    playTone({
      type: "triangle",
      freq: base * 1.5,
      endFreq: base * 2.2,
      duration: 0.08,
      delay: 0.015,
      attack: 0.006,
      gain: 0.1,
      cutoff: 2600
    });
  }

  function playFlyWhoosh() {
    unlock();
    playFilteredNoise({
      filterType: "bandpass",
      startFreq: 420,
      endFreq: 1120,
      q: 1.1,
      duration: 0.36,
      attack: 0.05,
      gain: 0.13
    });
    playTone({
      type: "sine",
      freq: 392.0,
      endFreq: 783.99,
      duration: 0.34,
      attack: 0.04,
      gain: 0.1,
      cutoff: 2200
    });
  }

  function playBoxShake(step) {
    unlock();
    var base = 260 + (step || 1) * 70;
    playTone({
      type: "triangle",
      freq: base,
      endFreq: base * 1.18,
      duration: 0.11,
      attack: 0.008,
      gain: 0.22,
      cutoff: 1500
    });
    playTone({
      type: "sine",
      freq: base * 1.5,
      duration: 0.09,
      delay: 0.04,
      gain: 0.12,
      cutoff: 2000
    });
  }

  function playBoxOpen() {
    unlock();
    var notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 1318.5];
    for (var i = 0; i < notes.length; i += 1) {
      playTone({
        type: i % 2 === 0 ? "triangle" : "sine",
        freq: notes[i],
        duration: 0.34,
        delay: i * 0.05,
        gain: 0.16,
        cutoff: 3000
      });
    }
  }

  function playCrownRise() {
    unlock();
    var arp = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
    for (var i = 0; i < arp.length; i += 1) {
      playTone({
        type: "sine",
        freq: arp[i],
        duration: 0.36,
        delay: i * 0.08,
        attack: 0.015,
        gain: 0.14,
        cutoff: 3200
      });
    }
  }

  function playCrownLand() {
    unlock();
    playTone({
      type: "triangle",
      freq: 1046.5,
      duration: 0.25,
      gain: 0.18,
      cutoff: 2800
    });
    playTone({
      type: "sine",
      freq: 1567.98,
      duration: 0.45,
      delay: 0.06,
      gain: 0.2,
      cutoff: 3200
    });
    playTone({
      type: "sine",
      freq: 2093.0,
      duration: 0.4,
      delay: 0.12,
      gain: 0.1,
      cutoff: 3200
    });
  }

  function playBadgeChime() {
    unlock();
    playTone({
      type: "triangle",
      freq: 783.99,
      duration: 0.18,
      gain: 0.2,
      cutoff: 2600
    });
    playTone({
      type: "sine",
      freq: 1046.5,
      duration: 0.28,
      delay: 0.08,
      gain: 0.22,
      cutoff: 3000
    });
  }

  function playLegoSnap() {
    unlock();
    // 塑料积木清脆温和的“咔-嗒”双脉冲
    playTone({
      type: "triangle",
      freq: 1180,
      endFreq: 540,
      duration: 0.045,
      attack: 0.004,
      gain: 0.22,
      cutoff: 2400
    });
    playTone({
      type: "sine",
      freq: 1560,
      endFreq: 780,
      duration: 0.04,
      delay: 0.032,
      attack: 0.004,
      gain: 0.16,
      cutoff: 2600
    });
  }

  function playCarHorn() {
    unlock();
    playTone({
      type: "triangle",
      freq: 523.25,
      endFreq: 540,
      duration: 0.1,
      attack: 0.01,
      gain: 0.15,
      cutoff: 1900
    });
    playTone({
      type: "sine",
      freq: 659.25,
      endFreq: 680,
      duration: 0.13,
      delay: 0.12,
      attack: 0.01,
      gain: 0.16,
      cutoff: 2100
    });
  }

  function playBulbTick(index) {
    unlock();
    var scale = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5];
    var freq = scale[(index || 0) % scale.length];
    playTone({
      type: "sine",
      freq: freq,
      duration: 0.18,
      attack: 0.008,
      gain: 0.1,
      cutoff: 2800
    });
  }

  function playLightsOn() {
    unlock();
    var chord = [349.23, 440.0, 523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < chord.length; i += 1) {
      playTone({
        type: i < 2 ? "triangle" : "sine",
        freq: chord[i],
        duration: 0.55,
        delay: i * 0.045,
        attack: 0.03,
        gain: 0.13,
        cutoff: 2600
      });
    }
  }

  function playBlow() {
    unlock();
    playFilteredNoise({
      filterType: "lowpass",
      startFreq: 720,
      endFreq: 240,
      q: 0.8,
      duration: 0.28,
      attack: 0.035,
      gain: 0.22
    });
    playTone({
      type: "sine",
      freq: 440,
      endFreq: 290,
      duration: 0.16,
      delay: 0.04,
      gain: 0.06,
      cutoff: 1000
    });
  }

  function playWinChime() {
    unlock();
    var fanfare = [
      { f: 523.25, d: 0.18, t: 0 },
      { f: 659.25, d: 0.18, t: 0.09 },
      { f: 783.99, d: 0.18, t: 0.18 },
      { f: 1046.5, d: 0.45, t: 0.27 },
      { f: 783.99, d: 0.35, t: 0.27 }
    ];
    for (var i = 0; i < fanfare.length; i += 1) {
      playTone({
        type: "triangle",
        freq: fanfare[i].f,
        duration: fanfare[i].d,
        delay: fanfare[i].t,
        gain: 0.18,
        cutoff: 3000
      });
    }
  }

  function playFirework() {
    unlock();
    playTone({
      type: "sine",
      freq: 420,
      endFreq: 960,
      duration: 0.14,
      attack: 0.015,
      gain: 0.09,
      cutoff: 1800
    });
    playFilteredNoise({
      filterType: "lowpass",
      startFreq: 950,
      endFreq: 260,
      q: 0.9,
      duration: 0.22,
      delay: 0.12,
      attack: 0.015,
      gain: 0.15
    });
    var twinkles = [987.77, 1174.66, 1318.51, 1567.98];
    for (var i = 0; i < twinkles.length; i += 1) {
      playTone({
        type: "sine",
        freq: twinkles[i],
        duration: 0.2,
        delay: 0.14 + i * 0.045,
        gain: 0.09,
        cutoff: 3200
      });
    }
  }

  function setMuted(isMuted) {
    muted = Boolean(isMuted);
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, ctx.currentTime, 0.04);
    }
  }

  function isMuted() {
    return muted;
  }

  global.KikiSfx = {
    unlock: unlock,
    setMuted: setMuted,
    isMuted: isMuted,
    playPageTurn: playPageTurn,
    playSparkle: playSparkle,
    playPop: playPop,
    playFlyWhoosh: playFlyWhoosh,
    playBoxShake: playBoxShake,
    playBoxOpen: playBoxOpen,
    playCrownRise: playCrownRise,
    playCrownLand: playCrownLand,
    playBadgeChime: playBadgeChime,
    playLegoSnap: playLegoSnap,
    playCarHorn: playCarHorn,
    playBulbTick: playBulbTick,
    playLightsOn: playLightsOn,
    playBlow: playBlow,
    playWinChime: playWinChime,
    playFirework: playFirework
  };
})(window);
