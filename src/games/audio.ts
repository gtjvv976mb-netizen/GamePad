import type { GameEvent, GameFamily } from "./types";

const melodies: Record<string, number[]> = {
  hcr: [0, 7, 12, 10, 3, 7, 5, 2], eov: [0, 12, 7, 14, 10, 7, 3, 5], ibl: [0, 4, 7, 12, 9, 7, 4, 2], sws: [0, 7, 9, 12, 7, 4, 2, 7],
  ndp: [0, 0, 7, 10, 12, 7, 3, 10], osv: [0, 7, 12, 19, 14, 7, 3, 10], slc: [0, 4, 7, 9, 12, 7, 4, 7], dpt: [0, 12, 7, 3, 10, 7, 14, 5], gla: [0, 7, 3, 10, 0, 12, 10, 7], rrn: [0, 7, 12, 15, 10, 7, 12, 14],
  ptv: [0, 4, 7, 12, 11, 7, 9, 4], kkn: [0, 7, 3, 12, 10, 7, 5, 3], sft: [0, 7, 3, 10, 12, 7, 5, 2], mmr: [0, 12, 3, 10, 7, 3, 5, 2], cbz: [0, 7, 4, 9, 12, 7, 2, 4], lmc: [0, 12, 7, 19, 14, 10, 7, 12],
};
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12);

/** Original music and feedback synthesized locally; no files or audio service. */
export class GameAudio {
  private context?: AudioContext;
  private gain?: GainNode;
  private timer?: ReturnType<typeof setInterval>;
  private beat = 0;
  private active = false;
  private enabled = true;
  private volume = .45;
  private lastCue = new Map<string, number>();
  constructor(private slug: string, private family: GameFamily) {}
  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        const Constructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) return;
        this.context = new Constructor(); this.gain = this.context.createGain();
        this.gain.gain.value = this.volume * .3; this.gain.connect(this.context.destination);
        this.timer = setInterval(() => this.music(), this.family === "action" ? 190 : 285);
      }
      if (this.context.state === "suspended") await this.context.resume();
    } catch { /* Browsers without audio still play the complete game. */ }
  }
  running(active: boolean) { this.active = active; }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.context && this.gain) this.gain.gain.setTargetAtTime(enabled ? this.volume * .3 : 0, this.context.currentTime, .03);
    if (enabled) void this.unlock();
  }
  isEnabled() { return this.enabled; }
  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.context && this.gain) this.gain.gain.setTargetAtTime(this.enabled ? this.volume * .3 : 0, this.context.currentTime, .03);
  }
  private tone(note: number, duration: number, loudness = .2, type: OscillatorType = "triangle", delay = 0, slide?: number) {
    const ctx = this.context;
    if (!ctx || !this.gain || !this.enabled || ctx.state !== "running") return;
    const osc = ctx.createOscillator(), envelope = ctx.createGain(), t = ctx.currentTime + delay;
    osc.type = type; osc.frequency.setValueAtTime(hz(note), t);
    if (slide !== undefined) osc.frequency.exponentialRampToValueAtTime(hz(slide), t + duration);
    envelope.gain.setValueAtTime(.0001, t); envelope.gain.exponentialRampToValueAtTime(Math.max(.001, loudness), t + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(envelope); envelope.connect(this.gain); osc.start(t); osc.stop(t + duration + .015);
  }
  private music() {
    if (!this.active || !this.enabled || this.context?.state !== "running") return;
    const motif = melodies[this.slug] ?? melodies.hcr, beat = this.beat++;
    const root = (this.slug === "ibl" || this.slug === "ptv" || this.slug === "slc" ? 48 : 45) + [0, 5, 3, 7][Math.floor(beat / 16) % 4];
    if (beat % 4 === 0) { this.tone(root - 12, .7, .19, "sine"); this.tone(root + 7, .8, .045, "triangle"); }
    this.tone(root + 12 + motif[beat % motif.length], this.family === "action" ? .2 : .65, .065, this.family === "action" ? "triangle" : "sine");
    if (this.family === "action" && beat % 2 === 0) this.tone(30, .085, .13, "triangle", 0, 12);
  }
  play(events: GameEvent[]) {
    if (!this.enabled) return;
    const now = performance.now();
    for (const event of events.slice(0, 16)) {
      if (now - (this.lastCue.get(event.type) ?? -Infinity) < 65) continue;
      this.lastCue.set(event.type, now);
      const volume = Math.min(1, Math.max(.2, event.strength ?? .7));
      switch (event.type) {
        case "step": this.tone(35, .035, .07 * volume, "triangle"); break;
        case "strike": this.tone(60, .13, .38 * volume, "sawtooth", 0, 28); break;
        case "hit": this.tone(34, .22, .5 * volume, "triangle", 0, 18); break;
        case "shoot": this.tone(84, .08, .23 * volume, "square", 0, 45); break;
        case "dash": this.tone(48, .17, .19 * volume, "sine", 0, 78); break;
        case "engine": this.tone(31, .12, .05 * volume, "sawtooth", 0, 38); break;
        case "splash": this.tone(64, .21, .1 * volume, "sine", 0, 37); break;
        case "collect": [72, 79, 84].forEach((n, i) => this.tone(n, .15, .22, "triangle", i * .055)); break;
        case "craft": [60, 64, 67, 72].forEach((n, i) => this.tone(n, .23, .22, "triangle", i * .09)); break;
        case "success": [60, 67, 72, 76, 79].forEach((n, i) => this.tone(n, .45, .3, "triangle", i * .12)); break;
        case "fail": [57, 52, 45].forEach((n, i) => this.tone(n, .45, .3, "sine", i * .16)); break;
        case "dialogue": this.tone(76, .055, .09, "sine"); break;
      }
    }
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    const context = this.context;
    this.timer = undefined; this.context = undefined; this.gain = undefined;
    this.lastCue.clear();
    void context?.close();
  }
}
