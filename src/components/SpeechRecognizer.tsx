"use client"
import { useEffect, useRef, useState, useCallback } from 'react';
import { createModel } from 'vosk-browser';
import { getModelConfig, VoskModelConfig } from '../lib/vosk-models';

type VoskResultMessage = { result: { text: string } };
type VoskPartialResultMessage = { result: { partial: string } };

interface SpeechRecognizerProps {
  language?: 'es' | 'en';
  useS3?: boolean;
  onResult?: (text: string) => void;
  onPartialResult?: (text: string) => void;
  onError?: (error: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  autoStart?: boolean;
  className?: string;
}

export default function SpeechRecognizer({
  language = 'es',
  useS3 = false,
  onResult,
  onPartialResult,
  onError,
  onLoadingChange,
  autoStart = true,
  className = ''
}: SpeechRecognizerProps) {
  const [result, setResult] = useState<string>('');
  const [partial, setPartial] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [modelInfo, setModelInfo] = useState<VoskModelConfig | null>(null);

  const recognizerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recognizerNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const updateLoading = useCallback((loading: boolean) => {
    setLoading(loading);
    onLoadingChange?.(loading);
  }, [onLoadingChange]);

  const updateError = useCallback((error: string) => {
    setError(error);
    onError?.(error);
  }, [onError]);

  const updateResult = useCallback((text: string) => {
    setResult(text);
    onResult?.(text);
  }, [onResult]);

  const updatePartialResult = useCallback((text: string) => {
    setPartial(text);
    onPartialResult?.(text);
  }, [onPartialResult]);

  const initializeRecognizer = useCallback(async () => {
    let cancelled = false;
    
    try {
      updateLoading(true);
      updateError(null);
      
      // Get model configuration
      const config = getModelConfig(language, useS3);
      setModelInfo(config);

      // Request microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
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

      // Create audio context
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Load Vosk model
      const model = await createModel(config.url);

      if (cancelled) {
        model.remove?.();
        return;
      }

      // Create recognizer
      const recognizer = new model.KaldiRecognizer(audioContext.sampleRate);
      recognizerRef.current = recognizer;

      // Set up event handlers
      recognizer.on('result', (message: VoskResultMessage) => {
        const text = message.result.text;
        updateResult(text);
      });

      recognizer.on('partialresult', (message: VoskPartialResultMessage) => {
        const text = message.result.partial;
        updatePartialResult(text);
      });

      // Create audio processing node
      const recognizerNode = audioContext.createScriptProcessor(4096, 1, 1);
      recognizerNode.onaudioprocess = (event: AudioProcessingEvent) => {
        try {
          recognizer.acceptWaveform(event.inputBuffer);
        } catch (err) {
          console.error("Error accepting waveform", err);
        }
      };

      recognizerNodeRef.current = recognizerNode;

      // Connect audio source
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
  }, [language, useS3, updateLoading, updateError, updateResult, updatePartialResult]);

  const stopRecognizer = useCallback(() => {
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
  }, []);

  const startRecognizer = useCallback(async () => {
    if (isListening) return;
    await initializeRecognizer();
  }, [isListening, initializeRecognizer]);

  const toggleRecognizer = useCallback(async () => {
    if (isListening) {
      stopRecognizer();
    } else {
      await startRecognizer();
    }
  }, [isListening, startRecognizer, stopRecognizer]);

  useEffect(() => {
    if (autoStart) {
      startRecognizer();
    }

    return () => {
      stopRecognizer();
    };
  }, [language, useS3]); // Reinitialize when language or S3 setting changes

  return (
    <div className={`speech-recognizer ${className}`}>
      <div className="mb-4">
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={toggleRecognizer}
            disabled={loading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isListening
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? 'Loading...' : isListening ? 'Stop Listening' : 'Start Listening'}
          </button>
          
          {modelInfo && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{modelInfo.name}</span>
              <span className="mx-2">•</span>
              <span>{modelInfo.size}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="text-red-600 text-sm mb-2">
            Error: {error}
          </div>
        )}

        {loading && (
          <div className="text-blue-600 text-sm mb-2">
            Loading speech recognition model...
          </div>
        )}
      </div>

      <div className="bg-white shadow-md rounded-lg p-4 border">
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Partial Result:
          </label>
          <div className="text-gray-600 text-sm min-h-[1.5rem]">
            {partial || 'Listening...'}
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Final Result:
          </label>
          <div className="text-gray-900 font-medium min-h-[1.5rem]">
            {result || 'No speech detected yet'}
          </div>
        </div>
      </div>
    </div>
  );
} 