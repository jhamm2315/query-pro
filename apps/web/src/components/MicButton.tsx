/**
 * MicButton — user-invoked voice dictation only.
 *
 * Strategy (in order):
 *  1. Web Speech API   — instant, no round-trip, works in Chrome/Edge
 *  2. Whisper backend  — records audio via MediaRecorder, sends to /api/voice/transcribe
 *
 * No passive capture — recording only starts on explicit user click.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { voiceApi, healthApi } from "../lib/api";

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

// ── Web Speech API shim ────────────────────────────────────────────────────

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechApi(): SpeechRecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition as SpeechRecognitionCtor) ?? (w.webkitSpeechRecognition as SpeechRecognitionCtor) ?? null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function MicButton({ onTranscript, disabled }: Props) {
  const [listening, setListening] = useState(false);
  const [whisperAvailable, setWhisperAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Probe the health endpoint once to discover Whisper
  useEffect(() => {
    healthApi.check().then((data: Record<string, unknown>) => {
      const backends = data?.voice_backends as string[] | undefined;
      setWhisperAvailable(!!backends?.includes("whisper"));
    }).catch(() => {});
  }, []);

  const useWebSpeech = !!getSpeechApi();

  // ── Web Speech path ──────────────────────────────────────────────────────

  const toggleWebSpeech = useCallback(() => {
    const SpeechAPI = getSpeechApi()!;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SpeechAPI();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onTranscript(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, onTranscript]);

  // ── Whisper path (MediaRecorder → base64 → API) ──────────────────────────

  const toggleWhisper = useCallback(async () => {
    if (listening) {
      mediaRecorderRef.current?.stop();
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Microphone access denied.");
      return;
    }

    chunksRef.current = [];
    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);

      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const b64 = (reader.result as string).split(",")[1];
        try {
          const { transcript } = await voiceApi.transcribe(b64, "en", "whisper");
          if (transcript) onTranscript(transcript);
        } catch {
          alert("Transcription failed — check that the API is running.");
        }
      };
      reader.readAsDataURL(blob);
    };

    mr.start();
    setListening(true);
  }, [listening, onTranscript]);

  // ── Select strategy ──────────────────────────────────────────────────────

  const toggle = useWebSpeech
    ? toggleWebSpeech
    : whisperAvailable
      ? toggleWhisper
      : () => alert(
          "Speech recognition requires Chrome/Edge (Web Speech API) or the Whisper backend.\n" +
          "Install: pip install openai-whisper"
        );

  const title = listening
    ? "Stop recording"
    : useWebSpeech
      ? "Voice dictation (Web Speech)"
      : whisperAvailable
        ? "Voice dictation (Whisper)"
        : "Voice dictation unavailable";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`
        p-2.5 rounded-lg border transition-all duration-150
        focus:outline-none focus:ring-2 focus:ring-brand-500
        disabled:opacity-40 disabled:cursor-not-allowed
        ${listening
          ? "bg-red-600 border-red-500 text-white animate-pulse"
          : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white"
        }
      `}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-2 4v7a2 2 0 0 0 4 0V5a2 2 0 0 0-4 0zm8.364 5.636a.75.75 0 0 1 .75.75 7.5 7.5 0 0 1-14.228 3.284A7.5 7.5 0 0 1 3.886 11.386a.75.75 0 0 1 1.5 0 6 6 0 0 0 12 0 .75.75 0 0 1 .75-.75h.228zm-7.614 9.114a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5H10v-1.5a.75.75 0 0 1 .75-.75z" />
      </svg>
    </button>
  );
}
