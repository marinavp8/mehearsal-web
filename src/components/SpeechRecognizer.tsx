"use client"
import { useEffect, useRef, useState } from 'react';
import { createModel } from 'vosk-browser';

type VoskResultMessage = { result: { text: string } };
type VoskPartialResultMessage = { result: { partial: string } };

interface SpeechRecognizerProps {
  language?: 'es' | 'en';
  isActive?: boolean;
  onLanguageChange?: (language: 'es' | 'en') => void;
  onResult?: (text: string) => void;
  onPartialResult?: (text: string) => void;
  onError?: (error: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  className?: string;
}

const MODEL_PATHS: Record<string, string> = {
  es: '/models/vosk-model-es-prueba.zip',
  en: '/models/model.tar.gz',
};

export default function SpeechRecognizer({
  language = 'es',
  isActive = true,
  onLanguageChange,
  onResult,
  onPartialResult,
  onError,
  onLoadingChange,
  className = ''
}: SpeechRecognizerProps) {
  const [result, setResult] = useState<string>('');
  const [partial, setPartial] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);

  const recognizerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognizerNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const updateLoading = (loading: boolean) => {
    setLoading(loading);
    onLoadingChange?.(loading);
  };

  const updateError = (error: string | null) => {
    setError(error);
    if (error) onError?.(error);
  };

  const updateResult = (text: string) => {
    setResult(text);
    onResult?.(text);
  };

  const updatePartialResult = (text: string) => {
    setPartial(text);
    onPartialResult?.(text);
  };

  const stopRecognizer = () => {
    setIsListening(false);

    if (recognizerRef.current?.remove) {
      recognizerRef.current.remove();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    recognizerRef.current = null;
    audioContextRef.current = null;
    recognizerNodeRef.current = null;
    sourceRef.current = null;
    mediaStreamRef.current = null;
  };

  const startRecognizer = async () => {
    if (isListening || !isActive) return;

    let model: any;
    let mediaStream: MediaStream;
    let cancelled = false;

    try {
      updateLoading(true);
      updateError(null);

      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      if (cancelled) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }

      mediaStreamRef.current = mediaStream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Load model based on selected language
      model = await createModel(MODEL_PATHS[language]);

      if (cancelled) return;

      const recognizer = new model.KaldiRecognizer(audioContext.sampleRate);
      recognizerRef.current = recognizer;

      recognizer.on('result', (message: any) => {
        if (message.result?.text) {
          updateResult(message.result.text);
        }
      });

      recognizer.on('partialresult', (message: any) => {
        if (message.result?.partial) {
          updatePartialResult(message.result.partial);
        }
      });

      const recognizerNode = audioContext.createScriptProcessor(4096, 1, 1);
      recognizerNode.onaudioprocess = (event: AudioProcessingEvent) => {
        try {
          recognizer.acceptWaveform(event.inputBuffer);
        } catch (err) {
          console.error("Error accepting waveform", err);
        }
      };

      recognizerNodeRef.current = recognizerNode;

      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      source.connect(recognizerNode);
      recognizerNode.connect(audioContext.destination);

      updateLoading(false);
      setIsListening(true);

    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      updateError(errorMessage);
      updateLoading(false);
      console.error('Speech recognizer initialization error:', err);
    }

    return () => {
      cancelled = true;
    };
  };

  const toggleRecognizer = async () => {
    if (isListening) {
      stopRecognizer();
    } else {
      await startRecognizer();
    }
  };

  const handleLanguageChange = (newLanguage: 'es' | 'en') => {
    if (isListening) {
      stopRecognizer();
    }
    onLanguageChange?.(newLanguage);
  };

  useEffect(() => {
    if (isActive && !isListening) {
      startRecognizer();
    } else if (!isActive && isListening) {
      stopRecognizer();
    }

    return () => {
      stopRecognizer();
    };
  }, [isActive, language]);

  return (
    <div className={`w-full bg-gray-800 rounded-xl p-6 shadow-xl ${className}`}>
      <h3 className="text-lg font-semibold mb-4 text-gray-200">Reconocimiento de Voz</h3>

      <div className="mb-4">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={toggleRecognizer}
            disabled={loading || !isActive}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${isListening
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? 'Cargando...' : isListening ? 'Detener' : 'Iniciar'}
          </button>

          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value as 'es' | 'en')}
            disabled={isListening}
            className="bg-gray-700 text-gray-200 border border-gray-600 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>

        {error && (
          <div className="text-red-400 text-sm mb-4 p-3 bg-red-900/20 rounded-lg border border-red-800">
            Error: {error}
          </div>
        )}

        {loading && (
          <div className="text-blue-400 text-sm mb-4 p-3 bg-blue-900/20 rounded-lg border border-blue-800">
            Cargando modelo de reconocimiento de voz...
          </div>
        )}
      </div>

      <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-300 block mb-2">
            Resultado Parcial:
          </label>
          <div className="text-gray-400 text-sm min-h-[1.5rem] bg-gray-800/50 rounded px-3 py-2">
            {partial || 'Escuchando...'}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-300 block mb-2">
            Resultado Final:
          </label>
          <div className="text-gray-200 font-medium min-h-[1.5rem] bg-gray-800/50 rounded px-3 py-2">
            {result || 'No se ha detectado voz aún'}
          </div>
        </div>
      </div>

      {!isActive && (
        <div className="mt-4 p-3 bg-gray-700/30 rounded-lg border border-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
            <span className="text-sm text-gray-400">Reconocimiento de voz desactivado</span>
          </div>
        </div>
      )}
    </div>
  );
}