'use client';

import type { Species } from '@ludo3d/shared';
import { useSettingsStore, type SettingsValues } from '@/stores/settingsStore';

/**
 * Original procedural sound system built on the Web Audio API. Every sound
 * is synthesised at runtime (no sample files), which keeps the download small
 * and avoids third-party audio licensing. Recorded/licensed sounds can later
 * replace any id without touching gameplay code.
 *
 * Audio never blocks gameplay: all calls are fire-and-forget and every
 * failure (no AudioContext, autoplay restrictions) is swallowed.
 */
export type SoundName =
  | 'dice-roll'
  | 'step'
  | 'enter'
  | 'home'
  | 'victory'
  | 'select'
  | 'ui'
  | 'impact-soft'
  | 'impact-heavy'
  | 'whoosh'
  | 'lion-roar'
  | 'lion-growl'
  | 'peacock-call'
  | 'peacock-rustle'
  | 'horse-whinny'
  | 'horse-snort'
  | 'fox-yip'
  | 'fox-bark';

type Bus = 'sfx' | 'animal' | 'music';

const ANIMAL_SOUNDS: ReadonlySet<SoundName> = new Set([
  'lion-roar',
  'lion-growl',
  'peacock-call',
  'peacock-rustle',
  'horse-whinny',
  'horse-snort',
  'fox-yip',
  'fox-bark',
]);

const VOCALS: Record<Species, SoundName[]> = {
  lion: ['lion-roar', 'lion-growl'],
  peacock: ['peacock-call'],
  horse: ['horse-whinny', 'horse-snort'],
  fox: ['fox-yip', 'fox-bark'],
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noise!: AudioBuffer;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicStep = 0;
  private settings: SettingsValues;
  private lastStep = 0;

  constructor() {
    this.settings = useSettingsStore.getState();
    useSettingsStore.subscribe((s) => {
      this.settings = s;
      this.applyVolumes();
    });
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 4;
      this.master.connect(compressor).connect(ctx.destination);
      this.buses = {
        sfx: ctx.createGain(),
        animal: ctx.createGain(),
        music: ctx.createGain(),
      };
      for (const bus of Object.values(this.buses)) bus.connect(this.master);
      const length = ctx.sampleRate * 1.5;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      return ctx;
    } catch {
      return null;
    }
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const s = this.settings;
    this.master.gain.setTargetAtTime(s.muted ? 0 : 0.9, now, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.sfxVolume, now, 0.05);
    this.buses.animal.gain.setTargetAtTime(s.animalVolume, now, 0.05);
    this.buses.music.gain.setTargetAtTime(s.musicVolume * 0.5, now, 0.2);
    if (s.muted || s.musicVolume <= 0) this.stopMusic();
    else if (this.ctx.state === 'running') this.startMusic();
  }

  /** Must be called from a user gesture at least once (browser autoplay rules). */
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().then(() => this.applyVolumes());
    else this.applyVolumes();
  }

  vocal(species: Species) {
    const options = VOCALS[species];
    this.play(options[Math.floor(Math.random() * options.length)]!);
  }

  play(name: string, at?: { x: number } | null) {
    try {
      const ctx = this.ensure();
      if (!ctx || ctx.state !== 'running' || this.settings.muted) return;
      const sound = name as SoundName;
      const bus = this.buses[ANIMAL_SOUNDS.has(sound) ? 'animal' : 'sfx'];
      const out = ctx.createStereoPanner();
      out.pan.value = at ? Math.max(-0.8, Math.min(0.8, at.x / 9)) : 0;
      out.connect(bus);
      const t = ctx.currentTime + 0.005;
      switch (sound) {
        case 'dice-roll':
          return this.diceRoll(out, t);
        case 'step':
          if (t - this.lastStep < 0.08) return;
          this.lastStep = t;
          return this.thud(out, t, 0.06, 220, 0.12);
        case 'enter':
          this.whoosh(out, t, 0.35, 0.25);
          return this.thud(out, t + 0.45, 0.1, 160, 0.35);
        case 'home':
          return this.chime(out, t, [659.25, 830.61, 987.77], 0.22);
        case 'victory':
          return this.chime(out, t, [523.25, 659.25, 783.99, 1046.5, 1318.5], 0.3, 0.16);
        case 'select':
        case 'ui':
          return this.click(out, t);
        case 'impact-soft':
          return this.thud(out, t, 0.14, 180, 0.4);
        case 'impact-heavy':
          this.thud(out, t, 0.25, 90, 0.7);
          return this.whoosh(out, t, 0.18, 0.15);
        case 'whoosh':
          return this.whoosh(out, t, 0.3, 0.3);
        case 'lion-roar':
          return this.growl(out, t, 1.2, 110, 0.55);
        case 'lion-growl':
          return this.growl(out, t, 0.6, 85, 0.4);
        case 'peacock-call':
          this.call(out, t, 820, 1250, 0.32, 0.28);
          return this.call(out, t + 0.4, 900, 1350, 0.38, 0.3);
        case 'peacock-rustle':
          return this.rustle(out, t, 0.5);
        case 'horse-whinny':
          return this.whinny(out, t);
        case 'horse-snort':
          return this.snort(out, t);
        case 'fox-yip':
          this.yip(out, t, 1400);
          return this.yip(out, t + 0.16, 1250);
        case 'fox-bark':
          return this.yip(out, t, 900, 0.18, 'square');
        default:
          return;
      }
    } catch {
      /* audio must never break the game */
    }
  }

  // --- building blocks -----------------------------------------------------

  private env(gain: GainNode, t: number, attack: number, peak: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSource(t: number, duration: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.start(t, Math.random() * 0.5, duration + 0.05);
    return src;
  }

  private thud(out: AudioNode, t: number, duration: number, freq: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + duration);
    const g = ctx.createGain();
    this.env(g, t, 0.004, level, duration);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    const n = this.noiseSource(t, duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    this.env(ng, t, 0.002, level * 0.35, duration * 0.6);
    n.connect(lp).connect(ng).connect(out);
  }

  private click(out: AudioNode, t: number) {
    const ctx = this.ctx!;
    const n = this.noiseSource(t, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 2;
    const g = ctx.createGain();
    this.env(g, t, 0.001, 0.25, 0.03);
    n.connect(bp).connect(g).connect(out);
  }

  private diceRoll(out: AudioNode, t: number) {
    // Hard resin die skittering on lacquered wood: knocks with shrinking gaps.
    let time = t;
    let gap = 0.11;
    for (let i = 0; i < 9; i++) {
      const ctx = this.ctx!;
      const n = this.noiseSource(time, 0.04);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1800 + Math.random() * 1400;
      bp.Q.value = 6;
      const g = ctx.createGain();
      this.env(g, time, 0.001, 0.5 * Math.pow(0.82, i), 0.05);
      n.connect(bp).connect(g).connect(out);
      time += gap * (0.7 + Math.random() * 0.6);
      gap *= 0.8;
    }
  }

  private whoosh(out: AudioNode, t: number, duration: number, level: number) {
    const ctx = this.ctx!;
    const n = this.noiseSource(t, duration);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + duration);
    const g = ctx.createGain();
    this.env(g, t, duration * 0.4, level, duration * 0.6);
    n.connect(bp).connect(g).connect(out);
  }

  private chime(out: AudioNode, t: number, notes: number[], level: number, spacing = 0.09) {
    const ctx = this.ctx!;
    notes.forEach((f, i) => {
      const start = t + i * spacing;
      for (const [mult, amp] of [
        [1, 1],
        [2.01, 0.25],
        [3.98, 0.08],
      ] as const) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f * mult;
        const g = ctx.createGain();
        this.env(g, start, 0.005, level * amp, 1.1);
        osc.connect(g).connect(out);
        osc.start(start);
        osc.stop(start + 1.3);
      }
    });
  }

  private growl(out: AudioNode, t: number, duration: number, base: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.4, t);
    osc.frequency.linearRampToValueAtTime(base * 1.1, t + duration * 0.3);
    osc.frequency.exponentialRampToValueAtTime(base * 0.75, t + duration);
    const trem = ctx.createOscillator();
    trem.frequency.value = 23;
    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.35;
    const vca = ctx.createGain();
    vca.gain.value = 0.65;
    trem.connect(tremGain).connect(vca.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(1300, t + duration * 0.35);
    lp.frequency.exponentialRampToValueAtTime(400, t + duration);
    lp.Q.value = 3;
    const g = ctx.createGain();
    this.env(g, t, duration * 0.2, level, duration * 0.8);
    osc.connect(vca).connect(lp).connect(g).connect(out);
    const n = this.noiseSource(t, duration);
    const nlp = ctx.createBiquadFilter();
    nlp.type = 'lowpass';
    nlp.frequency.value = 500;
    const ng = ctx.createGain();
    this.env(ng, t, duration * 0.2, level * 0.5, duration * 0.8);
    n.connect(nlp).connect(ng).connect(out);
    osc.start(t);
    trem.start(t);
    osc.stop(t + duration + 0.1);
    trem.stop(t + duration + 0.1);
  }

  private call(out: AudioNode, t: number, f0: number, f1: number, duration: number, level: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f1, t + duration * 0.4);
    osc.frequency.linearRampToValueAtTime(f0 * 0.9, t + duration);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    this.env(g, t, 0.03, level, duration);
    osc.connect(bp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.1);
  }

  private rustle(out: AudioNode, t: number, duration: number) {
    const ctx = this.ctx!;
    for (let i = 0; i < 6; i++) {
      const start = t + (i / 6) * duration;
      const n = this.noiseSource(start, 0.08);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 3500;
      const g = ctx.createGain();
      this.env(g, start, 0.01, 0.18, 0.08);
      n.connect(hp).connect(g).connect(out);
    }
  }

  private whinny(out: AudioNode, t: number) {
    const ctx = this.ctx!;
    const duration = 0.9;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.linearRampToValueAtTime(950, t + 0.15);
    osc.frequency.exponentialRampToValueAtTime(420, t + duration);
    const vib = ctx.createOscillator();
    vib.frequency.value = 11;
    const vibGain = ctx.createGain();
    vibGain.gain.value = 45;
    vib.connect(vibGain).connect(osc.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 1.3;
    const g = ctx.createGain();
    this.env(g, t, 0.05, 0.3, duration);
    osc.connect(bp).connect(g).connect(out);
    osc.start(t);
    vib.start(t);
    osc.stop(t + duration + 0.1);
    vib.stop(t + duration + 0.1);
  }

  private snort(out: AudioNode, t: number) {
    const ctx = this.ctx!;
    const n = this.noiseSource(t, 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(250, t + 0.3);
    bp.Q.value = 2;
    const g = ctx.createGain();
    this.env(g, t, 0.02, 0.5, 0.28);
    n.connect(bp).connect(g).connect(out);
  }

  private yip(
    out: AudioNode,
    t: number,
    freq: number,
    duration = 0.12,
    type: OscillatorType = 'triangle',
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, t + duration);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1;
    const g = ctx.createGain();
    this.env(g, t, 0.008, 0.3, duration);
    osc.connect(bp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // --- generative ambient music -------------------------------------------

  private startMusic() {
    if (this.musicTimer || !this.ctx) return;
    // D major pentatonic pads with a slow, sparse melody.
    const chords = [
      [146.83, 220.0, 293.66],
      [130.81, 196.0, 261.63],
      [164.81, 246.94, 329.63],
      [146.83, 196.0, 293.66],
    ];
    const melody = [587.33, 659.25, 739.99, 880.0, 987.77];
    const tick = () => {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.05;
      const chord = chords[this.musicStep % chords.length]!;
      for (const f of chord) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.05, t + 1.6);
        g.gain.linearRampToValueAtTime(0.0001, t + 6.2);
        osc.connect(lp).connect(g).connect(this.buses.music);
        osc.start(t);
        osc.stop(t + 6.4);
      }
      if (this.musicStep % 2 === 1) {
        const note = melody[Math.floor(Math.random() * melody.length)]!;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + 1);
        g.gain.exponentialRampToValueAtTime(0.035, t + 1.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
        osc.connect(g).connect(this.buses.music);
        osc.start(t + 1);
        osc.stop(t + 3.6);
      }
      this.musicStep++;
    };
    tick();
    this.musicTimer = setInterval(tick, 5200);
  }

  private stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

let instance: AudioEngine | null = null;

/** Lazily created singleton; null during server rendering. */
export function getAudio(): AudioEngine | null {
  if (typeof window === 'undefined') return null;
  instance ??= new AudioEngine();
  return instance;
}
