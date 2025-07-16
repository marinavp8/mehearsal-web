"use client"
import { useEffect, useRef, useState } from 'react';
import { createModel } from 'vosk-browser';

type VoskResultMessage = { result: { text: string } };
type VoskPartialResultMessage = { result: { partial: string } };

const MODEL_PATHS: Record<string, string> = {
    es: '/models/vosk-model-small-es-0.42.tar.gz',
    en: '/models/model.tar.gz',
};

function App() {
    const [result, setResult] = useState<string>('');
    const [partial, setPartial] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [language, setLanguage] = useState<'es' | 'en'>('es');

    const recognizerRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const recognizerNodeRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        let model: any;
        let mediaStream: MediaStream;
        let cancelled = false;

        async function init() {
            setLoading(true);
            setError(null);
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        channelCount: 1,
                        sampleRate: 16000,
                    },
                });

                if (cancelled) return;

                const audioContext = new AudioContext();
                audioContextRef.current = audioContext;

                // Carga el modelo según el idioma seleccionado
                model = await createModel(MODEL_PATHS[language]);

                if (cancelled) return;

                const recognizer = new model.KaldiRecognizer(audioContext.sampleRate);
                recognizerRef.current = recognizer;

                recognizer.on('result', (message: VoskResultMessage) => {
                    setResult(message.result.text);
                });

                recognizer.on('partialresult', (message: VoskPartialResultMessage) => {
                    setPartial(message.result.partial);
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

                setLoading(false);
            } catch (err: any) {
                setError(err?.message || String(err));
                setLoading(false);
            }
        }

        init();

        return () => {
            cancelled = true;
            if (recognizerRef.current?.remove) recognizerRef.current.remove();
            if (audioContextRef.current) audioContextRef.current.close();
            if (mediaStream) {
                mediaStream.getTracks().forEach((track) => track.stop());
            }
        };
    }, [language]); // <-- Recarga el modelo si cambia el idioma

    return (
        <div className="min-h-screen bg-gray-100 text-gray-800 flex flex-col items-center p-8">
            <h1 className="text-2xl font-bold mb-4">Vosk Speech Recognition</h1>
            <div className="mb-4">
                <label className="mr-2 font-semibold">Idioma:</label>
                <select
                    value={language}
                    onChange={e => setLanguage(e.target.value as 'es' | 'en')}
                    className="border rounded px-2 py-1"
                >
                    <option value="es">Español</option>
                    <option value="en">Inglés</option>
                </select>
            </div>
            {loading && <p className="text-blue-500 mb-4">Loading model and microphone...</p>}
            {error && <p className="text-red-600 mb-4">Error: {error}</p>}
            <div className="bg-white shadow-md rounded p-4 w-full max-w-lg mb-4">
                <div className="mb-2">
                    <strong>Partial:</strong> <span className="text-gray-700">{partial}</span>
                </div>
                <div>
                    <strong>Result:</strong> <span className="text-gray-900 font-semibold">{result}</span>
                </div>
            </div>
        </div>
    );
}

export default App;

