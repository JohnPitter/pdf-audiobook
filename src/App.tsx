import { useCallback, useState } from "react";
import { FileUpload } from "./components/FileUpload";
import { AudioPlayer } from "./components/AudioPlayer";
import {
  extractHighlightsFromPdf,
  type ExtractionResult,
} from "./lib/pdf-highlight-extractor";

type AppState =
  | { step: "upload" }
  | { step: "choose"; result: ExtractionResult; fileName: string }
  | {
      step: "playing";
      text: string;
      segments: ExtractionResult["highlightedSegments"];
      fileName: string;
      totalPages: number;
      mode: "highlights" | "full";
    };

function App() {
  const [state, setState] = useState<AppState>({ step: "upload" });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await extractHighlightsFromPdf(file);

      if (!result.allText.trim()) {
        setError(
          "Nao foi possivel extrair texto deste PDF. Ele pode ser um PDF de imagem (escaneado).",
        );
        setIsLoading(false);
        return;
      }

      // Always go to choose screen
      setState({ step: "choose", result, fileName: file.name });
    } catch (err) {
      console.error("PDF extraction error:", err);
      setError("Erro ao processar o PDF. Verifique se o arquivo e valido.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChooseMode = useCallback(
    (mode: "highlights" | "full") => {
      if (state.step !== "choose") return;
      const { result, fileName } = state;

      const text =
        mode === "highlights"
          ? result.highlightedSegments.map((s) => s.text).join(".\n\n")
          : result.allText;

      setState({
        step: "playing",
        text,
        segments: result.highlightedSegments,
        fileName,
        totalPages: result.totalPages,
        mode,
      });
    },
    [state],
  );

  const handleReset = useCallback(() => {
    setState({ step: "upload" });
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-[#FFFDF7]">
      {/* Subtle background pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, #F97316 0.5px, transparent 0)",
        backgroundSize: "24px 24px",
      }} />

      <div className="relative max-w-3xl mx-auto px-4 py-12">
        {state.step === "upload" && (
          <div className="space-y-4">
            <FileUpload
              onFileSelected={handleFileSelected}
              isLoading={isLoading}
            />
            {error && (
              <div className="mx-auto max-w-lg rounded-xl bg-red-50 border border-red-200/60 p-4 text-center animate-slide-up">
                <p className="text-sm text-red-500">{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-2 text-xs text-red-400 hover:text-red-600 underline underline-offset-2"
                >
                  Tentar novamente
                </button>
              </div>
            )}
          </div>
        )}

        {state.step === "choose" && (
          <div className="space-y-8 text-center animate-fade-in">
            {/* Header */}
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-50 flex items-center justify-center mx-auto shadow-sm">
                {state.result.hasHighlights ? (
                  <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-orange-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                )}
              </div>

              <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">
                {state.result.hasHighlights
                  ? "Highlights encontrados!"
                  : "PDF carregado!"}
              </h2>

              <p className="text-stone-500 text-sm max-w-sm mx-auto">
                {state.result.hasHighlights ? (
                  <>
                    <span className="font-bold text-amber-500">
                      {state.result.highlightedSegments.length}
                    </span>{" "}
                    trechos destacados em{" "}
                    <span className="font-bold">
                      {state.result.totalPages}
                    </span>{" "}
                    {state.result.totalPages === 1 ? "pagina" : "paginas"}.
                    Como deseja ouvir?
                  </>
                ) : (
                  <>
                    <span className="font-bold">{state.result.totalPages}</span>{" "}
                    {state.result.totalPages === 1 ? "pagina" : "paginas"} encontradas.
                    Nenhum highlight detectado.
                  </>
                )}
              </p>
            </div>

            {/* Mode cards */}
            <div
              className={`grid gap-4 max-w-sm mx-auto ${
                state.result.hasHighlights ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {state.result.hasHighlights && (
                <button
                  onClick={() => handleChooseMode("highlights")}
                  className="group rounded-2xl bg-gradient-to-b from-amber-50 to-white border-2 border-amber-200/60 p-5 text-center transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-amber-100/50 hover:border-amber-300 active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                  </div>
                  <p className="font-bold text-stone-800 text-[15px]">
                    So destaques
                  </p>
                  <p className="text-[11px] text-stone-400 mt-1">
                    Ouvir trechos marcados
                  </p>
                </button>
              )}

              <button
                onClick={() => handleChooseMode("full")}
                className="group rounded-2xl bg-gradient-to-b from-stone-50 to-white border-2 border-stone-200/60 p-5 text-center transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:shadow-stone-100/50 hover:border-stone-300 active:scale-[0.98]"
              >
                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <p className="font-bold text-stone-800 text-[15px]">
                  PDF completo
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  Ouvir todo o conteudo
                </p>
              </button>
            </div>

            <button
              onClick={handleReset}
              className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
            >
              ← Voltar
            </button>
          </div>
        )}

        {state.step === "playing" && (
          <AudioPlayer
            text={state.text}
            segments={state.segments}
            fileName={state.fileName}
            totalPages={state.totalPages}
            onReset={handleReset}
            mode={state.mode}
          />
        )}
      </div>
    </div>
  );
}

export default App;
