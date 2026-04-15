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
  engine: "puter" | "browser";
  quality: "generative" | "neural" | "standard" | "local";
  /** Only for browser engine */
  nativeVoice?: SpeechSynthesisVoice;
  /** Only for puter engine */
  puterVoice?: string;
  puterEngine?: string;
}

type TTSCallback = (state: TTSState) => void;

/** Puter.js global type */
interface PuterAI {
  txt2speech(
    text: string,
    options?: { voice?: string; engine?: string; language?: string },
  ): Promise<HTMLAudioElement>;
}
interface PuterGlobal {
  ai: PuterAI;
}
declare const puter: PuterGlobal;

/**
 * Splits text into speakable chunks at sentence boundaries.
 * Puter TTS handles longer text better, so we use larger chunks for it.
 */
function splitIntoChunks(text: string, maxLen = 500): string[] {
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
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

/** Check if Puter.js is loaded and available */
function isPuterAvailable(): boolean {
  return typeof puter !== "undefined" && !!puter?.ai?.txt2speech;
}

/** Load Puter.js script dynamically */
export function loadPuterScript(): Promise<void> {
  return new Promise((resolve) => {
    if (isPuterAvailable()) {
      resolve();
      return;
    }

    const existing = document.querySelector(
      'script[src*="js.puter.com"]',
    );
    if (existing) {
      // Already loading, wait for it
      existing.addEventListener("load", () => resolve());
      // If it already loaded but puter isn't available yet, resolve anyway
      setTimeout(resolve, 2000);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    script.onload = () => {
      // Give puter a moment to initialize
      setTimeout(resolve, 500);
    };
    script.onerror = () => {
      console.warn("Failed to load Puter.js, falling back to browser TTS");
      resolve();
    };
    document.head.appendChild(script);
  });
}

/** AWS Polly pt-BR voices available via Puter.js */
const PUTER_VOICES: VoiceOption[] = [
  {
    id: "puter-camila-generative",
    name: "Camila (AI Generativa)",
    engine: "puter",
    quality: "generative",
    puterVoice: "Camila",
    puterEngine: "generative",
  },
  {
    id: "puter-camila-neural",
    name: "Camila (Neural)",
    engine: "puter",
    quality: "neural",
    puterVoice: "Camila",
    puterEngine: "neural",
  },
  {
    id: "puter-vitoria-neural",
    name: "Vitoria (Neural)",
    engine: "puter",
    quality: "neural",
    puterVoice: "Vitoria",
    puterEngine: "neural",
  },
  {
    id: "puter-thiago-neural",
    name: "Thiago (Neural)",
    engine: "puter",
    quality: "neural",
    puterVoice: "Thiago",
    puterEngine: "neural",
  },
  {
    id: "puter-camila-standard",
    name: "Camila",
    engine: "puter",
    quality: "standard",
    puterVoice: "Camila",
    puterEngine: "standard",
  },
  {
    id: "puter-vitoria-standard",
    name: "Vitoria",
    engine: "puter",
    quality: "standard",
    puterVoice: "Vitoria",
    puterEngine: "standard",
  },
  {
    id: "puter-ricardo-standard",
    name: "Ricardo",
    engine: "puter",
    quality: "standard",
    puterVoice: "Ricardo",
    puterEngine: "standard",
  },
];

/** Build browser voice options from SpeechSynthesis */
function getBrowserVoices(): VoiceOption[] {
  const synth = window.speechSynthesis;
  const allVoices = synth.getVoices();

  const ptVoices = allVoices.filter((v) => v.lang.startsWith("pt"));
  const voices = ptVoices.length > 0 ? ptVoices : allVoices.slice(0, 10);

  return voices.map((v) => ({
    id: `browser-${v.name}`,
    name: v.name,
    engine: "browser" as const,
    quality: v.localService ? ("local" as const) : ("standard" as const),
    nativeVoice: v,
  }));
}

export class TTSEngine {
  private synth: SpeechSynthesis;
  private chunks: string[] = [];
  private currentIndex = 0;
  private _isPlaying = false;
  private _isPaused = false;
  private callback: TTSCallback | null = null;
  private _rate = 1;
  private _selectedVoice: VoiceOption | null = null;
  private _puterAvailable = false;
  private _currentAudio: HTMLAudioElement | null = null;
  private _aborted = false;

  constructor() {
    this.synth = window.speechSynthesis;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  get progress(): number {
    if (this.chunks.length === 0) return 0;
    return ((this.currentIndex + 1) / this.chunks.length) * 100;
  }

  get puterAvailable(): boolean {
    return this._puterAvailable;
  }

  onStateChange(cb: TTSCallback): void {
    this.callback = cb;
  }

  private emitState(): void {
    this.callback?.({
      isPlaying: this._isPlaying,
      isPaused: this._isPaused,
      currentIndex: this.currentIndex,
      totalChunks: this.chunks.length,
      progress: this.progress,
      currentText: this.chunks[this.currentIndex] ?? "",
    });
  }

  setRate(rate: number): void {
    this._rate = Math.max(0.5, Math.min(2, rate));
  }

  setVoice(voice: VoiceOption): void {
    this._selectedVoice = voice;
  }

  /** Initialize Puter.js and return available voices */
  async initPuter(): Promise<void> {
    await loadPuterScript();
    this._puterAvailable = isPuterAvailable();
  }

  /** Get all available voices (Puter AI + browser) */
  getVoices(): VoiceOption[] {
    const voices: VoiceOption[] = [];

    if (this._puterAvailable) {
      voices.push(...PUTER_VOICES);
    }

    voices.push(...getBrowserVoices());

    return voices;
  }

  /** Get best voice (prefers Puter generative > neural > browser) */
  getBestVoice(): VoiceOption | null {
    const voices = this.getVoices();
    return voices.length > 0 ? voices[0] : null;
  }

  loadText(text: string): void {
    this.stop();
    // Puter handles longer chunks well, browser needs shorter
    const maxLen =
      this._selectedVoice?.engine === "puter" ? 800 : 180;
    this.chunks = splitIntoChunks(text, maxLen);
    this.currentIndex = 0;
    this.emitState();
  }

  play(): void {
    if (this._isPaused && this._selectedVoice?.engine === "browser") {
      this.synth.resume();
      this._isPaused = false;
      this._isPlaying = true;
      this.emitState();
      return;
    }

    if (this._isPaused && this._currentAudio) {
      this._currentAudio.play();
      this._isPaused = false;
      this._isPlaying = true;
      this.emitState();
      return;
    }

    if (this._isPlaying) return;
    if (this.chunks.length === 0) return;

    this._isPlaying = true;
    this._isPaused = false;
    this._aborted = false;
    this.speakChunk(this.currentIndex);
  }

  pause(): void {
    if (!this._isPlaying) return;

    if (this._selectedVoice?.engine === "puter" && this._currentAudio) {
      this._currentAudio.pause();
    } else {
      this.synth.pause();
    }

    this._isPaused = true;
    this._isPlaying = false;
    this.emitState();
  }

  stop(): void {
    this._aborted = true;

    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio.currentTime = 0;
      this._currentAudio = null;
    }

    this.synth.cancel();
    this._isPlaying = false;
    this._isPaused = false;
    this.currentIndex = 0;
    this.emitState();
  }

  next(): void {
    if (this.currentIndex < this.chunks.length - 1) {
      this._aborted = true;
      if (this._currentAudio) {
        this._currentAudio.pause();
        this._currentAudio = null;
      }
      this.synth.cancel();
      this.currentIndex++;
      this._aborted = false;
      if (this._isPlaying || this._isPaused) {
        this._isPaused = false;
        this._isPlaying = true;
        this.speakChunk(this.currentIndex);
      } else {
        this.emitState();
      }
    }
  }

  previous(): void {
    if (this.currentIndex > 0) {
      this._aborted = true;
      if (this._currentAudio) {
        this._currentAudio.pause();
        this._currentAudio = null;
      }
      this.synth.cancel();
      this.currentIndex--;
      this._aborted = false;
      if (this._isPlaying || this._isPaused) {
        this._isPaused = false;
        this._isPlaying = true;
        this.speakChunk(this.currentIndex);
      } else {
        this.emitState();
      }
    }
  }

  seekTo(percent: number): void {
    const index = Math.floor((percent / 100) * (this.chunks.length - 1));
    this._aborted = true;
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio = null;
    }
    this.synth.cancel();
    this.currentIndex = Math.max(0, Math.min(index, this.chunks.length - 1));
    this._aborted = false;
    if (this._isPlaying || this._isPaused) {
      this._isPaused = false;
      this._isPlaying = true;
      this.speakChunk(this.currentIndex);
    } else {
      this.emitState();
    }
  }

  private speakChunk(index: number): void {
    if (index >= this.chunks.length) {
      this._isPlaying = false;
      this._isPaused = false;
      this.currentIndex = 0;
      this.emitState();
      return;
    }

    this.currentIndex = index;
    this.emitState();

    if (this._selectedVoice?.engine === "puter" && this._puterAvailable) {
      this.speakWithPuter(index);
    } else {
      this.speakWithBrowser(index);
    }
  }

  /** Speak using Puter.js (AWS Polly neural/generative voices) */
  private async speakWithPuter(index: number): Promise<void> {
    const text = this.chunks[index];
    const voice = this._selectedVoice!;

    try {
      const audio = await puter.ai.txt2speech(text, {
        voice: voice.puterVoice,
        engine: voice.puterEngine,
        language: "pt-BR",
      });

      if (this._aborted) return;

      // Apply playback rate
      audio.playbackRate = this._rate;
      this._currentAudio = audio;

      audio.onended = () => {
        if (this._aborted) return;
        this._currentAudio = null;
        this.currentIndex = index + 1;
        if (this.currentIndex < this.chunks.length && !this._aborted) {
          this.speakChunk(this.currentIndex);
        } else if (!this._aborted) {
          this._isPlaying = false;
          this.currentIndex = 0;
          this.emitState();
        }
      };

      audio.onerror = () => {
        if (this._aborted) return;
        console.warn("Puter TTS error, falling back to browser TTS");
        this.speakWithBrowser(index);
      };

      audio.play();
    } catch (err) {
      if (this._aborted) return;
      console.warn("Puter TTS failed:", err);
      // Fallback to browser TTS
      this.speakWithBrowser(index);
    }
  }

  /** Speak using native Web Speech API (fallback) */
  private speakWithBrowser(index: number): void {
    const text = this.chunks[index];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this._rate;
    utterance.lang = "pt-BR";

    if (this._selectedVoice?.nativeVoice) {
      utterance.voice = this._selectedVoice.nativeVoice;
    }

    utterance.onend = () => {
      if (this._aborted) return;
      this.currentIndex = index + 1;
      if (this.currentIndex < this.chunks.length) {
        setTimeout(() => {
          if (this._isPlaying && !this._isPaused && !this._aborted) {
            this.speakChunk(this.currentIndex);
          }
        }, 100);
      } else {
        this._isPlaying = false;
        this.currentIndex = 0;
        this.emitState();
      }
    };

    utterance.onerror = (event) => {
      if (event.error !== "interrupted" && event.error !== "canceled") {
        console.error("Browser TTS error:", event.error);
        this._isPlaying = false;
        this.emitState();
      }
    };

    this.synth.speak(utterance);
  }

  destroy(): void {
    this.stop();
    this.callback = null;
  }
}
