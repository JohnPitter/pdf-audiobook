import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TTSEngine, type TTSState, type VoiceOption } from "../lib/tts-engine";

interface AudioPlayerProps {
  text: string;
  segments: { pageNumber: number; text: string }[];
  fileName: string;
  totalPages: number;
  onReset: () => void;
  mode: "highlights" | "full";
}

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  ai: { label: "IA Neural", cls: "bg-purple-100 text-purple-600" },
  high: { label: "Online", cls: "bg-emerald-100 text-emerald-600" },
  medium: { label: "Local", cls: "bg-blue-100 text-blue-600" },
  low: { label: "Basica", cls: "bg-stone-100 text-stone-500" },
};

export function AudioPlayer({
  text,
  segments,
  fileName,
  totalPages,
  onReset,
  mode,
}: AudioPlayerProps) {
  const engineRef = useRef<TTSEngine | null>(null);
  const [ttsState, setTtsState] = useState<TTSState>({
    isPlaying: false,
    isPaused: false,
    currentIndex: 0,
    totalChunks: 0,
    progress: 0,
    currentText: "",
  });
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceIdx, setSelectedVoiceIdx] = useState(-1);
  const [showSettings, setShowSettings] = useState(false);
  const [kokoroLoading, setKokoroLoading] = useState(false);

  useEffect(() => {
    const engine = new TTSEngine();
    engineRef.current = engine;
    engine.onStateChange(setTtsState);
    engine.onKokoroLoadProgress(setKokoroLoading);
    engine.loadText(text);

    const loadVoices = () => {
      const available = engine.getVoices();
      setVoices(available);

      if (available.length > 0 && selectedVoiceIdx === -1) {
        const best = engine.getBestVoice();
        const idx = best ? available.indexOf(best) : 0;
        const finalIdx = idx >= 0 ? idx : 0;
        setSelectedVoiceIdx(finalIdx);
        engine.setVoice(available[finalIdx]);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      engine.destroy();
      speechSynthesis.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const handlePlayPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPlaying) engine.pause();
    else engine.play();
  }, []);

  const handleStop = useCallback(() => engineRef.current?.stop(), []);
  const handleNext = useCallback(() => engineRef.current?.next(), []);
  const handlePrev = useCallback(() => engineRef.current?.previous(), []);

  const handleRateChange = useCallback((newRate: number) => {
    setRate(newRate);
    engineRef.current?.setRate(newRate);
  }, []);

  const handlePitchChange = useCallback((newPitch: number) => {
    setPitch(newPitch);
    engineRef.current?.setPitch(newPitch);
  }, []);

  const handleVoiceChange = useCallback(
    (idx: number) => {
      setSelectedVoiceIdx(idx);
      if (voices[idx]) {
        engineRef.current?.setVoice(voices[idx]);
      }
    },
    [voices],
  );

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = ((e.clientX - rect.left) / rect.width) * 100;
    engineRef.current?.seekTo(percent);
  }, []);

  const wordCount = useMemo(() => text.split(/\s+/).length, [text]);
  const estimatedMinutes = useMemo(
    () => Math.ceil(wordCount / (150 * rate)),
    [wordCount, rate],
  );

  const selectedVoice = voices[selectedVoiceIdx];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5 min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-stone-900 flex items-center gap-2">
            {mode === "highlights" ? (
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
            )}
            {mode === "highlights" ? "Destaques" : "PDF Completo"}
          </h2>
          <p className="text-xs text-stone-400 truncate">{fileName}</p>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-stone-400 hover:text-orange-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-orange-50 shrink-0"
        >
          Trocar PDF
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-2">
        {[
          { label: "Pag.", value: totalPages },
          ...(mode === "highlights"
            ? [{ label: "Destaques", value: segments.length }]
            : []),
          { label: "Palavras", value: wordCount.toLocaleString("pt-BR") },
          { label: "Tempo", value: `${estimatedMinutes}min` },
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex-1 rounded-xl bg-white border border-stone-100 py-2.5 px-3 text-center"
          >
            <p className="text-base font-bold text-stone-800 tabular-nums">
              {stat.value}
            </p>
            <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-0.5">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Voice badge */}
      {selectedVoice && (
        <div className="flex items-center gap-2 px-1">
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${QUALITY_BADGE[selectedVoice.quality].cls}`}
          >
            {QUALITY_BADGE[selectedVoice.quality].label}
          </span>
          <span className="text-[11px] text-stone-400">
            {selectedVoice.name}
          </span>
          {kokoroLoading && (
            <span className="flex items-center gap-1.5 text-[10px] text-purple-400">
              <span className="w-2.5 h-2.5 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
              Carregando modelo IA (~86MB)...
            </span>
          )}
        </div>
      )}

      {/* Main player card */}
      <div className="rounded-2xl bg-white border border-stone-100 shadow-sm overflow-hidden">
        {/* Now playing text */}
        <div className="relative px-6 pt-6 pb-5 min-h-[110px] flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-b from-orange-50/60 via-amber-50/30 to-transparent" />

          {ttsState.isPlaying && (
            <div className="absolute bottom-3 left-6 flex items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-[3px] bg-orange-300 rounded-full animate-waveform"
                  style={{ animationDelay: `${i * 0.15}s`, height: "4px" }}
                />
              ))}
            </div>
          )}

          <p className="relative text-stone-600 text-center text-[14px] leading-relaxed max-w-md">
            {ttsState.currentText || (
              <span className="text-stone-300 italic text-[13px]">
                Pressione play para iniciar a leitura...
              </span>
            )}
          </p>
        </div>

        {/* Progress bar */}
        <div
          className="h-1 bg-stone-100 cursor-pointer group relative"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-gradient-to-r from-orange-400 to-orange-500 transition-[width] duration-300 relative"
            style={{ width: `${ttsState.progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white border-2 border-orange-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm" />
          </div>
        </div>

        {/* Progress labels */}
        <div className="flex justify-between px-6 pt-1.5 text-[10px] text-stone-400 tabular-nums">
          <span>
            {ttsState.currentIndex + 1}/{ttsState.totalChunks}
          </span>
          <span>{Math.round(ttsState.progress)}%</span>
        </div>

        {/* Transport controls */}
        <div className="px-6 py-4 flex items-center justify-center gap-3">
          <ControlButton onClick={handlePrev} title="Anterior">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </ControlButton>

          <button
            onClick={handlePlayPause}
            className="relative w-14 h-14 rounded-full bg-gradient-to-b from-orange-500 to-orange-600 text-white flex items-center justify-center transition-all shadow-lg shadow-orange-200/60 hover:shadow-xl hover:shadow-orange-200/80 active:scale-95 active:shadow-md"
          >
            {ttsState.isPlaying && (
              <div className="absolute inset-0 rounded-full bg-orange-400 animate-pulse-ring" />
            )}
            {ttsState.isPlaying ? (
              <svg className="w-5 h-5 relative" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 ml-0.5 relative" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <ControlButton onClick={handleNext} title="Proximo">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </ControlButton>

          <ControlButton onClick={handleStop} title="Parar">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </ControlButton>

          <ControlButton
            onClick={() => setShowSettings((s) => !s)}
            title="Configuracoes"
            active={showSettings}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </ControlButton>
        </div>

        {/* Speed pills */}
        <div className="px-6 pb-4">
          <div className="flex gap-1.5">
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
              <button
                key={r}
                onClick={() => handleRateChange(r)}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                  rate === r
                    ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                    : "bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="px-6 pb-5 space-y-4 border-t border-stone-50 pt-4 animate-slide-up">
            {/* Pitch */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
                  Tom da voz
                </label>
                <span className="text-[11px] font-bold text-orange-500 tabular-nums">
                  {pitch.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={pitch}
                onChange={(e) => handlePitchChange(Number(e.target.value))}
                className="w-full h-1.5 bg-stone-100 rounded-full appearance-none cursor-pointer accent-orange-500"
              />
              <div className="flex justify-between text-[9px] text-stone-300">
                <span>Grave</span>
                <span>Normal</span>
                <span>Agudo</span>
              </div>
            </div>

            {/* Voice selector */}
            {voices.length > 0 && (
              <div className="space-y-3">
                <label className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
                  Voz
                </label>

                {/* AI voices (Kokoro) */}
                {voices.some((v) => v.engine === "kokoro") && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wider flex items-center gap-1.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      Vozes IA (voz natural)
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {voices.filter((v) => v.engine === "kokoro").map((voice, _i) => {
                        const globalIdx = voices.indexOf(voice);
                        const isSelected = globalIdx === selectedVoiceIdx;
                        return (
                          <button
                            key={voice.id}
                            onClick={() => handleVoiceChange(globalIdx)}
                            className={`px-3 py-2.5 rounded-lg text-center transition-all duration-150 ${
                              isSelected
                                ? "bg-purple-50 border-2 border-purple-300 shadow-sm"
                                : "bg-stone-50 border-2 border-transparent hover:bg-purple-50/50"
                            }`}
                          >
                            <p className={`text-[12px] font-semibold ${isSelected ? "text-purple-700" : "text-stone-600"}`}>
                              {voice.kokoroVoiceId === "pf_dora" ? "Dora" : voice.kokoroVoiceId === "pm_alex" ? "Alex" : "Santa"}
                            </p>
                            <p className="text-[9px] text-stone-400 mt-0.5">
                              {voice.kokoroVoiceId?.startsWith("pf") ? "Feminina" : "Masculino"}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-purple-300">
                      Modelo Kokoro 82M — download unico de ~86MB, roda local no navegador
                    </p>
                  </div>
                )}

                {/* Browser voices */}
                {voices.some((v) => v.engine === "browser") && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
                      Vozes do navegador
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {voices.filter((v) => v.engine === "browser").map((voice) => {
                        const globalIdx = voices.indexOf(voice);
                        const isSelected = globalIdx === selectedVoiceIdx;
                        const badge = QUALITY_BADGE[voice.quality];
                        return (
                          <button
                            key={voice.id}
                            onClick={() => handleVoiceChange(globalIdx)}
                            className={`w-full px-3 py-1.5 rounded-lg text-left transition-all duration-150 flex items-center justify-between ${
                              isSelected
                                ? "bg-orange-50 border-2 border-orange-300"
                                : "bg-stone-50/50 border-2 border-transparent hover:bg-stone-50"
                            }`}
                          >
                            <p className={`text-[11px] truncate ${isSelected ? "text-orange-700 font-medium" : "text-stone-500"}`}>
                              {voice.name}
                            </p>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Highlighted segments list */}
      {mode === "highlights" && segments.length > 0 && (
        <div className="space-y-3 animate-slide-up stagger-2">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Trechos destacados
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {segments.map((seg, i) => (
              <div
                key={i}
                className="group rounded-xl bg-gradient-to-r from-amber-50/80 to-amber-50/40 border border-amber-200/60 p-3.5 transition-all hover:border-amber-300 hover:shadow-sm"
              >
                <div className="flex items-start gap-2.5">
                  <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-200/50 text-[9px] font-bold text-amber-600 uppercase tracking-wider mt-0.5">
                    P.{seg.pageNumber}
                  </span>
                  <p className="text-[13px] text-stone-600 leading-relaxed">
                    {seg.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ControlButton({
  onClick,
  title,
  children,
  active = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90 ${
        active
          ? "text-orange-500 bg-orange-50"
          : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"
      }`}
    >
      {children}
    </button>
  );
}
