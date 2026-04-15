export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalChunks: number;
  progress: number;
  currentText: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  lang: string;
  quality: "ai" | "high" | "medium" | "low";
  engine: "puter" | "browser";
  online: boolean;
  /** Puter voice config */
  puterVoice?: string;
  puterEngine?: string;
  /** Browser native voice */
  nativeVoice?: SpeechSynthesisVoice;
}

type TTSCallback = (state: TTSState) => void;

interface PuterGlobal {
  ai: {
    txt2speech(
      text: string,
      options?: { voice?: string; engine?: string; language?: string },
    ): Promise<HTMLAudioElement>;
  };
}
declare const puter: PuterGlobal;

function isPuterAvailable(): boolean {
  return typeof puter !== "undefined" && !!puter?.ai?.txt2speech;
}

let puterLoaded = false;

export function loadPuterScript(): Promise<void> {
  return new Promise((resolve) => {
    if (isPuterAvailable()) {
      puterLoaded = true;
      resolve();
      return;
    }
    if (document.querySelector('script[src*="js.puter.com"]')) {
      setTimeout(() => {
        puterLoaded = isPuterAvailable();
        resolve();
      }, 1500);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    script.onload = () => setTimeout(() => {
      puterLoaded = isPuterAvailable();
      resolve();
    }, 500);
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

const PUTER_VOICES: VoiceOption[] = [
  { id: "puter-camila-gen", name: "Camila (IA Generativa)", lang: "pt-BR", quality: "ai", engine: "puter", online: true, puterVoice: "Camila", puterEngine: "generative" },
  { id: "puter-camila-neural", name: "Camila (Neural)", lang: "pt-BR", quality: "ai", engine: "puter", online: true, puterVoice: "Camila", puterEngine: "neural" },
  { id: "puter-vitoria-neural", name: "Vitoria (Neural)", lang: "pt-BR", quality: "ai", engine: "puter", online: true, puterVoice: "Vitoria", puterEngine: "neural" },
  { id: "puter-thiago-neural", name: "Thiago (Neural)", lang: "pt-BR", quality: "ai", engine: "puter", online: true, puterVoice: "Thiago", puterEngine: "neural" },
  { id: "puter-ricardo", name: "Ricardo", lang: "pt-BR", quality: "high", engine: "puter", online: true, puterVoice: "Ricardo", puterEngine: "standard" },
];

function splitIntoChunks(text: string, maxLen = 200): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?;:\n])\s+/);
  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

function scoreBrowserVoice(v: SpeechSynthesisVoice): number {
  const n = v.name.toLowerCase();
  let s = 0;
  if (v.lang === "pt-BR") s += 200;
  else if (v.lang.startsWith("pt")) s += 100;
  else return -1000;
  if (!v.localService) s += 80;
  if (n.includes("google")) s += 60;
  if (n.includes("microsoft") && !v.localService) s += 50;
  if (n.includes("microsoft") && v.localService) s += 20;
  if (n.includes("maria") || n.includes("fernanda") || n.includes("francisca")) s += 25;
  if (n.includes("espeak") || n.includes("compact")) s -= 100;
  return s;
}

function getQuality(v: SpeechSynthesisVoice): "high" | "medium" | "low" {
  const n = v.name.toLowerCase();
  if (!v.localService) return "high";
  if (n.includes("espeak") || n.includes("compact")) return "low";
  return "medium";
}

export class TTSEngine {
  private synth: SpeechSynthesis;
  private chunks: string[] = [];
  private currentIndex = 0;
  private _isPlaying = false;
  private _isPaused = false;
  private callback: TTSCallback | null = null;
  private _rate = 1;
  private _pitch = 1;
  private _selectedVoice: VoiceOption | null = null;
  private _currentAudio: HTMLAudioElement | null = null;
  private _aborted = false;
  private _puterReady = false;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  get isPlaying() { return this._isPlaying; }
  get isPaused() { return this._isPaused; }
  get puterReady() { return this._puterReady; }
  get progress() {
    if (this.chunks.length === 0) return 0;
    return ((this.currentIndex + 1) / this.chunks.length) * 100;
  }

  onStateChange(cb: TTSCallback) { this.callback = cb; }

  private emitState() {
    this.callback?.({
      isPlaying: this._isPlaying,
      isPaused: this._isPaused,
      currentIndex: this.currentIndex,
      totalChunks: this.chunks.length,
      progress: this.progress,
      currentText: this.chunks[this.currentIndex] ?? "",
    });
  }

  setRate(rate: number) { this._rate = Math.max(0.5, Math.min(2, rate)); }
  setPitch(pitch: number) { this._pitch = Math.max(0.5, Math.min(1.5, pitch)); }
  setVoice(voice: VoiceOption) { this._selectedVoice = voice; }

  async initPuter(): Promise<boolean> {
    await loadPuterScript();
    this._puterReady = puterLoaded;
    return this._puterReady;
  }

  getVoices(): VoiceOption[] {
    const voices: VoiceOption[] = [];

    if (this._puterReady) {
      voices.push(...PUTER_VOICES);
    }

    const browserVoices = this.synth.getVoices()
      .filter((v) => v.lang.startsWith("pt"))
      .sort((a, b) => scoreBrowserVoice(b) - scoreBrowserVoice(a))
      .map((v): VoiceOption => ({
        id: `browser-${v.name}`,
        name: v.name,
        lang: v.lang,
        quality: getQuality(v),
        engine: "browser",
        online: !v.localService,
        nativeVoice: v,
      }));

    voices.push(...browserVoices);
    return voices;
  }

  getBestVoice(): VoiceOption | null {
    const v = this.getVoices();
    return v.length > 0 ? v[0] : null;
  }

  loadText(text: string) {
    this.stop();
    const maxLen = this._selectedVoice?.engine === "puter" ? 600 : 200;
    this.chunks = splitIntoChunks(text, maxLen);
    this.currentIndex = 0;
    this.emitState();
  }

  play() {
    if (this._isPaused && this._currentAudio) {
      this._currentAudio.play();
      this._isPaused = false;
      this._isPlaying = true;
      this.emitState();
      return;
    }
    if (this._isPaused && this._selectedVoice?.engine === "browser") {
      this.synth.resume();
      this._isPaused = false;
      this._isPlaying = true;
      this.emitState();
      return;
    }
    if (this._isPlaying || this.chunks.length === 0) return;
    this._isPlaying = true;
    this._isPaused = false;
    this._aborted = false;
    this.speakChunk(this.currentIndex);
  }

  pause() {
    if (!this._isPlaying) return;
    if (this._currentAudio) this._currentAudio.pause();
    else this.synth.pause();
    this._isPaused = true;
    this._isPlaying = false;
    this.emitState();
  }

  stop() {
    this._aborted = true;
    if (this._currentAudio) { this._currentAudio.pause(); this._currentAudio = null; }
    this.synth.cancel();
    this._isPlaying = false;
    this._isPaused = false;
    this.currentIndex = 0;
    this.emitState();
  }

  next() {
    if (this.currentIndex >= this.chunks.length - 1) return;
    this._abort();
    this.currentIndex++;
    this._resume();
  }

  previous() {
    if (this.currentIndex <= 0) return;
    this._abort();
    this.currentIndex--;
    this._resume();
  }

  seekTo(percent: number) {
    this._abort();
    this.currentIndex = Math.max(0, Math.min(
      Math.floor((percent / 100) * (this.chunks.length - 1)),
      this.chunks.length - 1,
    ));
    this._resume();
  }

  private _abort() {
    this._aborted = true;
    if (this._currentAudio) { this._currentAudio.pause(); this._currentAudio = null; }
    this.synth.cancel();
    this._aborted = false;
  }

  private _resume() {
    if (this._isPlaying || this._isPaused) {
      this._isPaused = false;
      this._isPlaying = true;
      this.speakChunk(this.currentIndex);
    } else {
      this.emitState();
    }
  }

  private speakChunk(index: number) {
    if (index >= this.chunks.length) {
      this._isPlaying = false;
      this._isPaused = false;
      this.currentIndex = 0;
      this.emitState();
      return;
    }
    this.currentIndex = index;
    this.emitState();

    if (this._selectedVoice?.engine === "puter" && this._puterReady) {
      this.speakWithPuter(index);
    } else {
      this.speakWithBrowser(index);
    }
  }

  private async speakWithPuter(index: number) {
    const text = this.chunks[index];
    const voice = this._selectedVoice!;
    try {
      const audio = await puter.ai.txt2speech(text, {
        voice: voice.puterVoice,
        engine: voice.puterEngine,
        language: "pt-BR",
      });
      if (this._aborted) return;
      audio.playbackRate = this._rate;
      this._currentAudio = audio;

      audio.onended = () => {
        this._currentAudio = null;
        if (this._aborted) return;
        this.currentIndex = index + 1;
        if (this.currentIndex < this.chunks.length) {
          this.speakChunk(this.currentIndex);
        } else {
          this._isPlaying = false;
          this.currentIndex = 0;
          this.emitState();
        }
      };
      audio.onerror = () => {
        if (!this._aborted) this.speakWithBrowser(index);
      };
      audio.play();
    } catch {
      if (!this._aborted) this.speakWithBrowser(index);
    }
  }

  private speakWithBrowser(index: number) {
    const text = this.chunks[index];
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = this._rate;
    utt.pitch = this._pitch;
    utt.lang = "pt-BR";
    if (this._selectedVoice?.nativeVoice) utt.voice = this._selectedVoice.nativeVoice;

    utt.onend = () => {
      if (this._aborted) return;
      this.currentIndex = index + 1;
      if (this.currentIndex < this.chunks.length) {
        setTimeout(() => {
          if (this._isPlaying && !this._isPaused && !this._aborted) this.speakChunk(this.currentIndex);
        }, 100);
      } else {
        this._isPlaying = false;
        this.currentIndex = 0;
        this.emitState();
      }
    };
    utt.onerror = (e) => {
      if (e.error !== "interrupted" && e.error !== "canceled") {
        this._isPlaying = false;
        this.emitState();
      }
    };
    this.synth.speak(utt);
  }

  destroy() {
    this.stop();
    this.callback = null;
  }
}
