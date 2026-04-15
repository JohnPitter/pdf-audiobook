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
  quality: "high" | "medium" | "low";
  online: boolean;
  nativeVoice: SpeechSynthesisVoice;
}

type TTSCallback = (state: TTSState) => void;

/**
 * Splits text into speakable chunks at natural sentence boundaries.
 * Keeps chunks shorter for more responsive playback and natural pauses.
 */
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

/**
 * Score voices by quality for Portuguese reading.
 * Higher = better quality.
 */
function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  // Language match
  if (voice.lang === "pt-BR") score += 200;
  else if (voice.lang.startsWith("pt")) score += 100;
  else return -1000; // Deprioritize non-Portuguese

  // Online/cloud voices are much better quality
  if (!voice.localService) score += 80;

  // Google voices (Chrome) — best quality online TTS
  if (name.includes("google")) score += 60;

  // Microsoft Online voices — good quality
  if (name.includes("microsoft") && !voice.localService) score += 50;
  if (name.includes("microsoft") && voice.localService) score += 20;

  // Specific high-quality voices
  if (name.includes("fernanda")) score += 30;
  if (name.includes("francisca")) score += 30;
  if (name.includes("maria")) score += 25;
  if (name.includes("daniel")) score += 15;

  // Avoid low-quality engines
  if (name.includes("espeak")) score -= 100;
  if (name.includes("compact")) score -= 80;
  if (name.includes("mbrola")) score -= 60;

  return score;
}

function getQualityLevel(voice: SpeechSynthesisVoice): "high" | "medium" | "low" {
  const name = voice.name.toLowerCase();
  if (!voice.localService) return "high"; // Online = high quality
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
  }

  /** Get all available voices, ranked by quality */
  getVoices(): VoiceOption[] {
    const allVoices = this.synth.getVoices();

    return allVoices
      .filter((v) => v.lang.startsWith("pt"))
      .sort((a, b) => scoreVoice(b) - scoreVoice(a))
      .map((v) => ({
        id: `${v.name}-${v.lang}`,
        name: v.name,
        lang: v.lang,
        quality: getQualityLevel(v),
        online: !v.localService,
        nativeVoice: v,
      }));
  }

  /** Get best available voice */
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
    if (this._isPaused) {
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
    this.speakChunk(this.currentIndex);
  }

  pause(): void {
    if (!this._isPlaying) return;
    this.synth.pause();
    this._isPaused = true;
    this._isPlaying = false;
    this.emitState();
  }

  stop(): void {
    this.synth.cancel();
    this._isPlaying = false;
    this._isPaused = false;
    this.currentIndex = 0;
    this.emitState();
  }

  next(): void {
    if (this.currentIndex < this.chunks.length - 1) {
      this.synth.cancel();
      this.currentIndex++;
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
      this.synth.cancel();
      this.currentIndex--;
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
    this.synth.cancel();
    this.currentIndex = Math.max(0, Math.min(index, this.chunks.length - 1));
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

    const utterance = new SpeechSynthesisUtterance(this.chunks[index]);
    utterance.rate = this._rate;
    utterance.pitch = this._pitch;
    utterance.lang = "pt-BR";

    if (this._selectedVoice) {
      utterance.voice = this._selectedVoice.nativeVoice;
    }

    utterance.onend = () => {
      if (!this._isPaused) {
        this.currentIndex = index + 1;
        if (this.currentIndex < this.chunks.length) {
          // Natural pause between chunks
          setTimeout(() => {
            if (this._isPlaying && !this._isPaused) {
              this.speakChunk(this.currentIndex);
            }
          }, 120);
        } else {
          this._isPlaying = false;
          this.currentIndex = 0;
          this.emitState();
        }
      }
    };

    utterance.onerror = (event) => {
      if (event.error !== "interrupted" && event.error !== "canceled") {
        console.error("TTS error:", event.error);
        this._isPlaying = false;
        this.emitState();
      }
    };

    this.currentIndex = index;
    this.emitState();
    this.synth.speak(utterance);
  }

  destroy(): void {
    this.stop();
    this.callback = null;
  }
}
