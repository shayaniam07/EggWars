/**
 * EGG WARS - Procedural audio.
 * All SFX are synthesised with the WebAudio API (no sound files to download,
 * nothing to corrupt). Volumes are driven by the player's saved settings.
 */
import type { WeaponDef } from "@/shared/weapons";

export type AudioSettings = { master: number; music: number; sfx: number };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  settings: AudioSettings = { master: 0.8, music: 0.35, sfx: 0.8 };

  /** Must be called from a user gesture (browser autoplay policy). */
  resume() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      const len = this.ctx.sampleRate * 0.5;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      this.applySettings(this.settings);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  applySettings(s: AudioSettings) {
    this.settings = s;
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return;
    this.masterGain.gain.value = s.master;
    this.sfxGain.gain.value = s.sfx;
    this.musicGain.gain.value = s.music * 0.25;
  }

  private tone(freq: number, type: OscillatorType, dur: number, gain: number, slideTo?: number) {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    osc.connect(g).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filterHz = 1800) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur);
  }

  shoot(w: WeaponDef, distance = 0) {
    const atten = Math.max(0.12, 1 - distance / 90);
    this.tone(w.sfx.freq, w.sfx.type, w.sfx.dur, 0.22 * atten, w.sfx.freq * 0.4);
    this.noise(w.sfx.dur * 1.4, 0.16 * w.sfx.noise * atten, 900 + w.sfx.freq * 3);
  }

  hit(head: boolean) {
    this.tone(head ? 1400 : 900, "square", 0.05, 0.14, head ? 1800 : 600);
  }

  damage() {
    this.tone(160, "sawtooth", 0.18, 0.18, 70);
    this.noise(0.15, 0.1, 600);
  }

  reload() {
    this.tone(320, "triangle", 0.07, 0.12);
    window.setTimeout(() => this.tone(220, "triangle", 0.09, 0.12), 170);
  }

  pickup() {
    this.tone(520, "sine", 0.08, 0.16, 880);
    window.setTimeout(() => this.tone(880, "sine", 0.1, 0.13), 70);
  }

  jump() {
    this.tone(420, "sine", 0.08, 0.09, 700);
  }

  death() {
    this.tone(300, "sawtooth", 0.5, 0.2, 60);
    this.noise(0.4, 0.14, 500);
  }

  kill() {
    this.tone(660, "square", 0.07, 0.15);
    window.setTimeout(() => this.tone(990, "square", 0.12, 0.14), 80);
  }

  ui() {
    this.tone(640, "triangle", 0.04, 0.08);
  }

  countdown(final = false) {
    this.tone(final ? 900 : 520, "square", final ? 0.3 : 0.12, 0.16);
  }

  /** Simple looping arpeggio for menus/matches. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [196, 233, 262, 294, 349, 392];
    let i = 0;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = scale[i % scale.length] * (i % 8 === 7 ? 2 : 1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.35, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.45);
      osc.connect(g).connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 0.5);
      i++;
    }, 300);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  dispose() {
    this.stopMusic();
    void this.ctx?.close();
    this.ctx = null;
  }
}
