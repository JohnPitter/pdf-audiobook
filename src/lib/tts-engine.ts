export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalChunks: number;
  progress: number;
  currentText: string;
}

type TTSCallback = (state: TTSState) => void;

/**
 * Splits text into speakable chunks at sentence/clause boundaries.
 * Adds natural pauses via chunk splitting for more natural speech.
 */
function splitIntoChunks(text: string, maxLen = 180): string[] {
  const chunks: string[] = [];
  // Split at sentence boundaries first, then at clause boundaries
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

/** Voice quality ranking — prefer online/neural voices */
function voiceQualityScore(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  let score = 0;

  // Prefer pt-BR voices
  if (voice.lang === "pt-BR") score += 100;
  else if (voice.lang.startsWith("pt")) score += 50;

  // Prefer online voices (higher quality, neural TTS)
  if (!voice.localService) score += 30;

  // Prefer Microsoft voices (better quality on Windows)
  if (name.includes("microsoft")) score += 20;

  // Prefer Google voices
  if (name.includes("google")) score += 15;

  // Prefer female voices (usually more natural for reading)
  if (name.includes("maria") || name.includes("francisca") || name.includes("female")) score += 10;

  // Avoid "compact" or "espeak" low-quality voices
  if (name.includes("compact") || name.includes("espeak")) score -= 50;

  return score;
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
  private _volume = 1;
  private _voice: SpeechSynthesisVoice | null = null;
  private _lang = "pt-BR";

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

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  setVoice(voice: SpeechSynthesisVoice): void {
    this._voice = voice;
  }

  setLang(lang: string): void {
    this._lang = lang;
  }

  /**
   * Returns available voices, sorted by quality for Portuguese reading.
   */
  getVoices(): SpeechSynthesisVoice[] {
    const allVoices = this.synth.getVoices();

    // Filter to pt voices first, fall back to all
    const ptVoices = allVoices.filter(
      (v) => v.lang.startsWith("pt"),
    );

    const voices = ptVoices.length > 0 ? ptVoices : allVoices;

    // Sort by quality score (best first)
    return voices.sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a));
  }

  /**
   * Returns the best available voice automatically.
   */
  getBestVoice(): SpeechSynthesisVoice | null {
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
    utterance.volume = this._volume;
    utterance.lang = this._lang;

    if (this._voice) {
      utterance.voice = this._voice;
    }

    utterance.onend = () => {
      if (!this._isPaused) {
        this.currentIndex = index + 1;
        if (this.currentIndex < this.chunks.length) {
          // Small pause between chunks for more natural flow
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
