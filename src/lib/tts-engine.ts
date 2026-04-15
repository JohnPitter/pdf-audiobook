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
  engine: "kokoro" | "browser";
  /** Kokoro voice ID (e.g. pf_dora) */
  kokoroVoiceId?: string;
  /** Browser native voice */
  nativeVoice?: SpeechSynthesisVoice;
  online?: boolean;
}

type TTSCallback = (state: TTSState) => void;

// Lazy-loaded Kokoro instance
let kokoroInstance: KokoroTTSInstance | null = null;
let kokoroLoading = false;
let kokoroError = false;

interface KokoroTTSInstance {
  generate: (
    text: string,
    options: { voice: string },
  ) => Promise<{ toBlob: () => Blob }>;
}

async function getKokoro(): Promise<KokoroTTSInstance | null> {
  if (kokoroInstance) return kokoroInstance;
  if (kokoroError) return null;
  if (kokoroLoading) {
    // Wait for existing load
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (kokoroInstance || kokoroError) {
          clearInterval(check);
          resolve(kokoroInstance);
        }
      }, 200);
    });
  }

  kokoroLoading = true;
  try {
    const { KokoroTTS } = await import("kokoro-js");
    kokoroInstance = (await KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-ONNX",
      { dtype: "q8" },
    )) as unknown as KokoroTTSInstance;
    return kokoroInstance;
  } catch (err) {
    console.error("Failed to load Kokoro TTS:", err);
    kokoroError = true;
    return null;
  } finally {
    kokoroLoading = false;
  }
}

/** Kokoro pt-BR voices */
const KOKORO_VOICES: VoiceOption[] = [
  {
    id: "kokoro-pf_dora",
    name: "Dora (IA Neural)",
    lang: "pt-BR",
    quality: "ai",
    engine: "kokoro",
    kokoroVoiceId: "pf_dora",
  },
  {
    id: "kokoro-pm_alex",
    name: "Alex (IA Neural)",
    lang: "pt-BR",
    quality: "ai",
    engine: "kokoro",
    kokoroVoiceId: "pm_alex",
  },
  {
    id: "kokoro-pm_santa",
    name: "Santa (IA Neural)",
    lang: "pt-BR",
    quality: "ai",
    engine: "kokoro",
    kokoroVoiceId: "pm_santa",
  },
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
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}

function scoreBrowserVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  if (voice.lang === "pt-BR") score += 200;
  else if (voice.lang.startsWith("pt")) score += 100;
  else return -1000;

  if (!voice.localService) score += 80;
  if (name.includes("google")) score += 60;
  if (name.includes("microsoft") && !voice.localService) score += 50;
  if (name.includes("microsoft") && voice.localService) score += 20;
  if (name.includes("fernanda") || name.includes("francisca")) score += 30;
  if (name.includes("maria")) score += 25;
  if (name.includes("espeak")) score -= 100;
  if (name.includes("compact")) score -= 80;

  return score;
}

function getBrowserQuality(
  voice: SpeechSynthesisVoice,
): "high" | "medium" | "low" {
  const name = voice.name.toLowerCase();
  if (!voice.localService) return "high";
  if (name.includes("espeak") || name.includes("compact")) return "low";
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
  private _kokoroReady = false;
  private _kokoroLoadProgress: ((loading: boolean) => void) | null = null;

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

  onStateChange(cb: TTSCallback): void {
    this.callback = cb;
  }

  onKokoroLoadProgress(cb: (loading: boolean) => void): void {
    this._kokoroLoadProgress = cb;
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

  setPitch(pitch: number): void {
    this._pitch = Math.max(0.5, Math.min(1.5, pitch));
  }

  setVoice(voice: VoiceOption): void {
    this._selectedVoice = voice;

    // Pre-load Kokoro when an AI voice is selected
    if (voice.engine === "kokoro" && !this._kokoroReady) {
      this._kokoroLoadProgress?.(true);
      getKokoro().then((k) => {
        this._kokoroReady = !!k;
        this._kokoroLoadProgress?.(false);
      });
    }
  }

  getVoices(): VoiceOption[] {
    const voices: VoiceOption[] = [...KOKORO_VOICES];

    const allBrowserVoices = this.synth.getVoices();
    const ptBrowserVoices = allBrowserVoices
      .filter((v) => v.lang.startsWith("pt"))
      .sort((a, b) => scoreBrowserVoice(b) - scoreBrowserVoice(a))
      .map(
        (v): VoiceOption => ({
          id: `browser-${v.name}`,
          name: v.name,
          lang: v.lang,
          quality: getBrowserQuality(v),
          engine: "browser",
          nativeVoice: v,
          online: !v.localService,
        }),
      );

    voices.push(...ptBrowserVoices);
    return voices;
  }

  getBestVoice(): VoiceOption | null {
    const voices = this.getVoices();
    return voices.length > 0 ? voices[0] : null;
  }

  loadText(text: string): void {
    this.stop();
    this.chunks = splitIntoChunks(text);
    this.currentIndex = 0;
    this.emitState();
  }

  play(): void {
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

    if (this._isPlaying) return;
    if (this.chunks.length === 0) return;

    this._isPlaying = true;
    this._isPaused = false;
    this._aborted = false;
    this.speakChunk(this.currentIndex);
  }

  pause(): void {
    if (!this._isPlaying) return;

    if (this._currentAudio) {
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
      this._currentAudio = null;
    }
    this.synth.cancel();
    this._isPlaying = false;
    this._isPaused = false;
    this.currentIndex = 0;
    this.emitState();
  }

  next(): void {
    if (this.currentIndex >= this.chunks.length - 1) return;
    this._abortCurrent();
    this.currentIndex++;
    this._resumeIfPlaying();
  }

  previous(): void {
    if (this.currentIndex <= 0) return;
    this._abortCurrent();
    this.currentIndex--;
    this._resumeIfPlaying();
  }

  seekTo(percent: number): void {
    const index = Math.floor((percent / 100) * (this.chunks.length - 1));
    this._abortCurrent();
    this.currentIndex = Math.max(0, Math.min(index, this.chunks.length - 1));
    this._resumeIfPlaying();
  }

  private _abortCurrent(): void {
    this._aborted = true;
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio = null;
    }
    this.synth.cancel();
    this._aborted = false;
  }

  private _resumeIfPlaying(): void {
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

    if (this._selectedVoice?.engine === "kokoro") {
      this.speakWithKokoro(index);
    } else {
      this.speakWithBrowser(index);
    }
  }

  private async speakWithKokoro(index: number): Promise<void> {
    const text = this.chunks[index];
    const voiceId = this._selectedVoice?.kokoroVoiceId ?? "pf_dora";

    try {
      const kokoro = await getKokoro();
      if (!kokoro || this._aborted) return;

      const result = await kokoro.generate(text, { voice: voiceId });
      if (this._aborted) return;

      const blob = result.toBlob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = this._rate;
      this._currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
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
        URL.revokeObjectURL(url);
        if (this._aborted) return;
        console.warn("Kokoro audio error, trying browser TTS");
        this.speakWithBrowser(index);
      };

      await audio.play();
    } catch (err) {
      if (this._aborted) return;
      console.warn("Kokoro TTS failed:", err);
      this.speakWithBrowser(index);
    }
  }

  private speakWithBrowser(index: number): void {
    const text = this.chunks[index];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this._rate;
    utterance.pitch = this._pitch;
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
    this._kokoroLoadProgress = null;
  }
}
