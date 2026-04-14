/**
 * MicButton — user-invoked voice dictation only.
 * Uses the Web Speech API (SpeechRecognition) when available.
 * Falls back to showing an informational message if not supported.
 * No passive capture — recording only starts on explicit user click.
 */

import { useState, useRef, useCallback } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultLike[];
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function MicButton({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const SpeechRecognitionAPI =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;

  const toggle = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      alert(
        "Speech recognition is not supported in this browser.\n" +
          "Use Chrome, Edge, or paste a transcript manually."
      );
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognitionAPI();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      const transcript = e.results[0][0].transcript;
      onTranscript(transcript);
    };

    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, onTranscript, SpeechRecognitionAPI]);

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? "Stop recording" : "Start voice dictation"}
      aria-label={listening ? "Stop recording" : "Start voice dictation"}
      className={`
        p-2.5 rounded-lg border transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-brand-500
        disabled:opacity-40 disabled:cursor-not-allowed
        ${
          listening
            ? "bg-red-600 border-red-500 text-white animate-pulse"
            : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
        }
      `}
    >
      {/* Microphone SVG */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-2 4v7a2 2 0 0 0 4 0V5a2 2 0 0 0-4 0zm8.364 5.636a.75.75 0 0 1 .75.75 7.5 7.5 0 0 1-14.228 3.284A7.5 7.5 0 0 1 3.886 11.386a.75.75 0 0 1 1.5 0 6 6 0 0 0 12 0 .75.75 0 0 1 .75-.75h.228zm-7.614 9.114a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5H10v-1.5a.75.75 0 0 1 .75-.75z" />
      </svg>
    </button>
  );
}
