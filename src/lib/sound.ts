export class MatchAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private enabled = false;
  private muted = false;

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    this.ctx = ctx;
    return ctx;
  }

  async setEnabled(enabled: boolean) {
    this.enabled = enabled;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (enabled) {
      await ctx.resume();
      if (!this.source) this.createCrowd(ctx);
      const target = this.muted ? 0 : 0.055;
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.8);
    } else {
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
    }
  }

  private createCrowd(ctx: AudioContext) {
    const seconds = 3;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.42;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 1200;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(band);
    band.connect(low);
    low.connect(gain);
    gain.connect(this.master!);
    source.start();
    this.source = source;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.065;
    lfoGain.gain.value = 0.16;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    const target = this.enabled && !muted ? 0.055 : 0;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.3);
  }

  goal() {
    if (!this.enabled || this.muted || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const duration = 1.7;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.06));
      const fadeOut = Math.min(1, (data.length - i) / (ctx.sampleRate * 0.9));
      data[i] = (Math.random() * 2 - 1) * fadeIn * fadeOut * 0.55;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 760;
    filter.Q.value = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.16, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.start(now);
    source.stop(now + duration);
  }
}
