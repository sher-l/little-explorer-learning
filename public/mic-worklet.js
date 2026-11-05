/* Captures mono PCM only. Output remains silent; no microphone monitoring. */
class AdventureMicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.limit = Math.round(sampleRate * (options.processorOptions?.maxSeconds || 8));
    this.count = 0;
    this.buffer = new Float32Array(2048);
    this.used = 0;
    this.stopped = false;
    this.port.onmessage = event => {
      if (event.data?.type === 'stop') this.finish('manual');
    };
  }
  flush() {
    if (!this.used) return;
    const chunk = this.buffer.slice(0, this.used);
    this.port.postMessage({ type: 'samples', samples: chunk }, [chunk.buffer]);
    this.used = 0;
  }
  finish(reason) {
    if (this.stopped) return;
    this.stopped = true;
    this.flush();
    this.port.postMessage({ type: 'done', reason });
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length || !channels[0]?.length) return true;
    const frames = Math.min(channels[0].length, this.limit - this.count);
    for (let i = 0; i < frames; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      this.buffer[this.used++] = value / channels.length;
      if (this.used === this.buffer.length) this.flush();
    }
    this.count += frames;
    if (this.count >= this.limit) this.finish('limit');
    return !this.stopped;
  }
}
registerProcessor('adventure-mic', AdventureMicProcessor);
