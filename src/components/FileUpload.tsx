import { useCallback, useState } from "react";

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export function FileUpload({ onFileSelected, isLoading }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0].type === "application/pdf") {
        onFileSelected(files[0]);
      }
    },
    [onFileSelected],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelected(files[0]);
      }
    },
    [onFileSelected],
  );

  return (
    <div className="flex flex-col items-center gap-10 animate-fade-in">
      {/* Hero */}
      <div className="text-center space-y-4">
        <div className="relative inline-block">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-50 flex items-center justify-center mx-auto shadow-sm animate-float">
            <svg
              className="w-10 h-10 text-orange-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
              />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-stone-900">
            PDF Audiobook
          </h1>
          <p className="text-stone-500 text-[15px] max-w-sm mx-auto leading-relaxed">
            Transforme seus PDFs marcados em audiobooks.
            <br />
            <span className="text-stone-400 text-[13px]">
              Detecta highlights e le em voz alta com qualidade.
            </span>
          </p>
        </div>
      </div>

      {/* Drop zone */}
      <label
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          relative cursor-pointer w-full max-w-lg rounded-2xl border-2 border-dashed
          transition-all duration-300 ease-out group
          ${
            isDragging
              ? "border-orange-400 bg-orange-50/80 scale-[1.02] shadow-lg shadow-orange-100"
              : "border-stone-200 bg-white/80 hover:border-orange-300 hover:bg-orange-50/30 hover:shadow-md hover:shadow-orange-50"
          }
          ${isLoading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isLoading}
        />

        <div className="p-10">
          {isLoading ? (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 border-[3px] border-orange-100 border-t-orange-500 rounded-full animate-spin" />
                <div className="absolute inset-0 w-12 h-12 border-[3px] border-transparent border-b-orange-300 rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-stone-600 text-sm font-medium">
                  Analisando PDF...
                </p>
                <p className="text-stone-400 text-xs">
                  Detectando trechos marcados
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg
                  className="w-7 h-7 text-orange-400 group-hover:text-orange-500 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
              </div>
              <div className="text-center space-y-1">
                <p className="text-stone-700 font-semibold text-[15px]">
                  Arraste um PDF aqui ou{" "}
                  <span className="text-orange-500 underline underline-offset-2 decoration-orange-200">
                    clique para selecionar
                  </span>
                </p>
                <p className="text-stone-400 text-xs">
                  PDF com highlights de qualquer leitor
                </p>
              </div>
            </div>
          )}
        </div>
      </label>

      {/* Steps */}
      <div className="grid grid-cols-3 gap-3 max-w-lg w-full">
        {[
          {
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            ),
            title: "Envie",
            desc: "Upload do PDF",
            delay: "stagger-1",
          },
          {
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
              </svg>
            ),
            title: "Detecta",
            desc: "Encontra highlights",
            delay: "stagger-2",
          },
          {
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
            ),
            title: "Ouca",
            desc: "Player com controles",
            delay: "stagger-3",
          },
        ].map((step) => (
          <div
            key={step.title}
            className={`animate-slide-up ${step.delay} rounded-xl bg-white/70 border border-stone-100 p-4 text-center space-y-2 transition-all duration-200 hover:bg-white hover:shadow-sm hover:border-stone-200`}
          >
            <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center mx-auto text-orange-400">
              {step.icon}
            </div>
            <p className="text-[13px] font-semibold text-stone-700">{step.title}</p>
            <p className="text-[11px] text-stone-400 leading-tight">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
