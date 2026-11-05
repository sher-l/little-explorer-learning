(function(root) {
  'use strict';
  const scriptURL = typeof document !== 'undefined' && document.currentScript?.src;
  const MAX_SECONDS = 8;
  const CODES = new Set(['ok', 'close', 'quiet', 'wrong']);
  function localHost(host) {
    if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]') return true;
    const parts = host.split('.').map(Number);
    return parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (parts[0] === 127 || parts[0] === 10 || parts[0] === 192 && parts[1] === 168 || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
  }
  function resolveBase(value) {
    const here = root.location || { protocol: 'file:', origin: 'null' };
    if (root.AdventureRuntime?.deployment === 'static') return null;
    if (!value && /^https?:$/.test(here.protocol) && !localHost(new URL(here.origin).hostname)) return null;
    const supplied = value || (here.protocol === 'http:' || here.protocol === 'https:' ? here.origin : 'http://127.0.0.1:8000');
    const url = new URL(supplied);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !localHost(url.hostname)) {
      throw new Error('古诗录音只发送到本机或家庭局域网语音服务。请使用本机启动入口。');
    }
    return url.origin;
  }
  function encodePCM(samples) {
    const bytes = new Uint8Array(samples.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) view.setFloat32(i * 4, samples[i], true);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }
  function friendlyError(error) {
    if (error?.name === 'NotAllowedError') return '麦克风还没允许使用。请家长在浏览器里允许麦克风，再试一次。';
    if (error?.name === 'NotFoundError') return '没有找到麦克风。请家长接好麦克风，再试一次。';
    if (error?.name === 'NotReadableError') return '麦克风暂时打不开，可能正被别的程序使用。';
    if (error?.name === 'AbortError') return '这次先停下，我们可以再来。';
    return error?.message || '语音暂时没有准备好，请家长看看本机语音服务。';
  }
  class PoetrySession {
    constructor(options = {}) {
      this.base = resolveBase(options.base);
      this.browser = !this.base && root.AdventureBrowserASR;
      this.onState = options.onState || (() => {});
      this.onLevel = options.onLevel || (() => {});
      this.onLimit = options.onLimit || (() => {});
      this.workletURL = options.workletURL || new URL('mic-worklet.js', scriptURL || root.location?.href || 'http://127.0.0.1:8000/forest-adventure/poetry.js').href;
      this.state = 'idle';
      this.ready = false;
      this.generation = 0;
      this.chunks = [];
      this.sampleCount = 0;
      this.sampleRate = 16000;
      this.capture = null;
      this.abort = null;
      this.recorded = null;
      this.scoringPromise = null;
      this.flushResolve = null;
    }
    emit(state, detail = {}) {
      this.state = state;
      this.onState(state, detail);
    }
    async checkReady(base) {
      if (base) this.base = resolveBase(base);
      if(this.browser){this.ready=this.browser.ready;return{ready:this.ready,base:null,connected:this.ready,message:'可准备浏览器语音（首次约 241 MiB）。声音只在这台设备识别；也可以直接请家长确认。',microphoneAvailable:!!(root.isSecureContext&&root.navigator?.mediaDevices?.getUserMedia)};}
      if (!this.base) {
        this.ready = false;
        const message = '这个网页暂未启用本地语音识别，可以听示范，再请家长确认。';
        this.emit('offline', { message });
        return { ready: false, connected: false, base: null, message, microphoneAvailable: false };
      }
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(this.base + '/health', { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
        const health = await response.json();
        this.ready = !!(response.ok && health.ok && health.ready && /SenseVoice/.test(health.engine || ''));
        if (!['requesting', 'recording', 'submitting'].includes(this.state)) this.emit(this.ready ? 'ready' : 'loading', { health });
        return { ready: this.ready, connected: !!(response.ok && health.ok), health, base: this.base,
          microphoneAvailable: !!(root.isSecureContext && root.navigator?.mediaDevices?.getUserMedia) };
      } catch (error) {
        this.ready = false;
        if (!['requesting', 'recording', 'submitting'].includes(this.state)) this.emit('offline', { message: '古诗语音服务还没打开，请家长运行“启动完整学习.cmd”。' });
        return { ready: false, connected: false, base: this.base, message: friendlyError(error) };
      } finally { clearTimeout(timer); }
    }
    async startRecording() {
      if (['requesting', 'recording', 'submitting'].includes(this.state)) throw new Error('这一句还在进行中。');
      if (!this.ready) throw new Error('语音服务尚未就绪，请先检查本机语音服务。');
      if (!root.isSecureContext || !root.navigator?.mediaDevices?.getUserMedia) throw new Error('请从本机启动入口打开网页。平板录音需要可信的 HTTPS 页面。');
      const Context = root.AudioContext || root.webkitAudioContext;
      if (!Context) throw new Error('这个浏览器还不能录音，请换用近期的 Edge 或 Chrome。');
      const generation = ++this.generation;
      this.chunks = []; this.sampleCount = 0; this.recorded = null; this.scoringPromise = null;
      this.emit('requesting');
      let context;
      try { context = new Context({ sampleRate: 16000 }); } catch { context = new Context(); }
      this.capture = { context, stream: null, source: null, processor: null, mute: null, timer: null };
      const capture = this.capture;
      // Attach a rejection handler immediately while the permission prompt is open.
      const resume = context.resume().then(() => null, error => error);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Cancelled', 'AbortError'); }
        capture.stream = stream;
        const resumeError = await resume; if (resumeError) throw resumeError;
        if (!context.audioWorklet || !root.AudioWorkletNode) throw new Error('录音模块不可用，请使用本机启动入口和近期浏览器。');
        await context.audioWorklet.addModule(this.workletURL);
        if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
        this.sampleRate = context.sampleRate;
        capture.source = context.createMediaStreamSource(stream);
        capture.processor = new AudioWorkletNode(context, 'adventure-mic', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { maxSeconds: MAX_SECONDS } });
        capture.mute = context.createGain(); capture.mute.gain.value = 0;
        capture.processor.port.onmessage = event => {
          if (generation !== this.generation) return;
          const data = event.data;
          if (data?.type === 'samples') this.accept(data.samples);
          else if (data?.type === 'done') {
            this.flushResolve?.(); this.flushResolve = null;
            if (data.reason === 'limit') this.finishCapture(generation).then(() => { if (generation === this.generation) this.onLimit(); }).catch(() => {});
          }
        };
        capture.source.connect(capture.processor); capture.processor.connect(capture.mute); capture.mute.connect(context.destination);
        stream.getTracks().forEach(track => track.addEventListener('ended', () => { if (generation === this.generation && this.state === 'recording') this.cancel(); }, { once: true }));
        capture.timer = setTimeout(() => {
          if (generation === this.generation && this.state === 'recording') this.finishCapture(generation).then(() => { if (generation === this.generation) this.onLimit(); }).catch(() => {});
        }, (MAX_SECONDS + 1) * 1000);
        this.emit('recording', { maxSeconds: MAX_SECONDS, sampleRate: this.sampleRate });
        return { sampleRate: this.sampleRate, maxSeconds: MAX_SECONDS };
      } catch (error) {
        await this.release(capture);
        if (generation === this.generation) this.emit('error', { message: friendlyError(error) });
        throw error;
      }
    }
    accept(samples) {
      const available = Math.round(MAX_SECONDS * this.sampleRate) - this.sampleCount;
      if (available <= 0) return;
      const chunk = new Float32Array(samples).slice(0, available);
      this.chunks.push(chunk); this.sampleCount += chunk.length;
      let power = 0; for (const value of chunk) power += value * value;
      this.onLevel(Math.min(1, Math.sqrt(power / Math.max(1, chunk.length)) * 8), { seconds: this.sampleCount / this.sampleRate });
    }
    async finishCapture(generation = this.generation) {
      if (this.finishing) return this.finishing;
      if (this.recorded) return this.recorded;
      const capture = this.capture;
      if (!capture) throw new Error('这一句还没有开始录音。');
      this.finishing = (async () => {
        clearTimeout(capture.timer);
        if (capture.processor) await new Promise(resolve => {
          let finished = false;
          const finish = () => { if (finished) return; finished = true; clearTimeout(timer); resolve(); };
          const timer = setTimeout(finish, 300);
          this.flushResolve = finish;
          capture.processor.port.postMessage({ type: 'stop' });
        });
        await this.release(capture);
        if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
        const samples = new Float32Array(this.sampleCount);
        let at = 0; for (const chunk of this.chunks) { samples.set(chunk, at); at += chunk.length; }
        this.chunks = [];
        this.recorded = { samples, sampleRate: this.sampleRate };
        this.emit('recorded', { seconds: samples.length / this.sampleRate });
        return this.recorded;
      })();
      try { return await this.finishing; } finally { this.finishing = null; }
    }
    async release(capture = this.capture) {
      if (!capture) return;
      clearTimeout(capture.timer);
      if (capture.processor) { capture.processor.port.onmessage = null; try { capture.processor.disconnect(); } catch {} }
      try { capture.source?.disconnect(); } catch {}
      try { capture.mute?.disconnect(); } catch {}
      capture.stream?.getTracks().forEach(track => track.stop());
      if (capture.context?.state !== 'closed') await capture.context?.close().catch(() => {});
      if (this.capture === capture) this.capture = null;
    }
    async stopAndScore({ poemId, lineIndex, expectedText, mode = 'read' }) {
      if (!poemId || !Number.isInteger(lineIndex) || lineIndex < 0 || typeof expectedText !== 'string' || !expectedText.length) throw new Error('诗句信息不完整，请家长检查题库。');
      if (!['read', 'recite', 'next'].includes(mode)) throw new Error('不支持的跟读方式。');
      if (this.scoringPromise) return this.scoringPromise;
      const generation = this.generation;
      this.scoringPromise = (async () => {
        const capture = await this.finishCapture(generation);
        if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
        if (!capture.samples.length) throw new Error('这一句还没录到声音，请再试一次。');
        this.emit('submitting');
        if(this.browser){try{const result=await this.browser.score(capture.samples,capture.sampleRate,expectedText,poemId,lineIndex);if(generation!==this.generation)throw new DOMException('Cancelled','AbortError');this.emit('result',{code:result.code});return result;}finally{this.recorded=null;}}
        const controller = new AbortController(); this.abort = controller;
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(this.base + '/score', { method: 'POST', signal: controller.signal, credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ poem_id: poemId, line_index: lineIndex, expected_text: expectedText, mode,
            audio: encodePCM(capture.samples), audio_format: 'pcm_f32', sample_rate: capture.sampleRate }) });
          const result = await response.json();
          if (generation !== this.generation) throw new DOMException('Cancelled', 'AbortError');
          if (result.ok && !CODES.has(result.code)) throw new Error('语音服务返回了无法识别的结果，请家长检查服务版本。');
          if (!response.ok || !result.ok) { this.emit('error', { message: response.status === 503 ? '语音服务还在准备，请稍等。' : '语音服务暂时没有处理好这一句，请家长检查本机服务。', status: response.status }); return { ...result, ok: false, status: response.status }; }
          this.emit('result', { code: result.code });
          return result;
        } finally { clearTimeout(timeout); if (this.abort === controller) this.abort = null; this.recorded = null; }
      })();
      try { return await this.scoringPromise; }
      catch (error) { if (generation === this.generation) this.emit('error', { message: friendlyError(error) }); throw error; }
      finally { this.scoringPromise = null; }
    }
    async cancel() {
      this.generation++;
      this.abort?.abort(); this.abort = null;
      this.flushResolve?.(); this.flushResolve = null;
      this.chunks = []; this.sampleCount = 0; this.recorded = null;
      await this.release();
      this.emit('idle');
    }
  }
  PoetrySession.friendlyError = friendlyError;
  root.PoetrySession = PoetrySession;
  if (typeof module !== 'undefined') module.exports = { PoetrySession, resolveBase, encodePCM };
})(typeof window === 'undefined' ? globalThis : window);
