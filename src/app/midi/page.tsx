'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        JSSynth: any;
    }
}

const PREDEFINED_MIDI_FILES = [
    { name: 'Fur Elise (Beethoven)', path: '/midi/furelise.mid' },
    { name: 'Carmen (Bizet)', path: '/midi/carmen.mid' }
];

export default function MidiPlayer() {
    const [playingStatus, setPlayingStatus] = useState('Stopped');
    const [originalBPM, setOriginalBPM] = useState<number | null>(null);
    const [desiredBPM, setDesiredBPM] = useState(120);
    const [midiData, setMidiData] = useState<Uint8Array | null>(null);
    const [selectedMidiFile, setSelectedMidiFile] = useState<string>('');

    const acRef = useRef<AudioContext | null>(null);
    const synthRef = useRef<any>(null);
    const sfontIdRef = useRef<number | null>(null);

    // Función para cargar el script js-synthesizer
    const loadScript = (src: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };

    // Inicializar sintetizador
    const initializeSynth = async () => {
        if (!acRef.current) acRef.current = new AudioContext();
        if (acRef.current.state === 'suspended') await acRef.current.resume();

        if (!synthRef.current) {
            console.log('Cargando módulos...');
            await acRef.current.audioWorklet.addModule('/lib/libfluidsynth-2.4.6.js');
            await acRef.current.audioWorklet.addModule('/lib/js-synthesizer.worklet.min.js');

            console.log('Inicializando sintetizador...');
            synthRef.current = new window.JSSynth.AudioWorkletNodeSynthesizer();
            synthRef.current.init(acRef.current.sampleRate);
            synthRef.current.createAudioNode(acRef.current).connect(acRef.current.destination);
        }

        if (!sfontIdRef.current) {
            const sfontBin = await fetch('/midi/FluidR3.sf2').then(r => r.arrayBuffer());
            sfontIdRef.current = await synthRef.current.loadSFont(sfontBin);
        }
    };

    // Parsear tempo del MIDI
    const parseTempoFromMIDI = (arrayBuffer: ArrayBuffer): number | null => {
        const data = new Uint8Array(arrayBuffer);
        for (let i = 0; i < data.length - 6; i++) {
            if (data[i] === 0xFF && data[i + 1] === 0x51 && data[i + 2] === 0x03) {
                const tempo = (data[i + 3] << 16) | (data[i + 4] << 8) | data[i + 5];
                return Math.round(60000000 / tempo);
            }
        }
        return null;
    };

    // Modificar tempo del MIDI
    const modifyMIDI_Tempo = (originalData: Uint8Array, ratio: number): Uint8Array => {
        const data = new Uint8Array(originalData);
        const modified = new Uint8Array(data);
        for (let i = 0; i < data.length - 6; i++) {
            if (data[i] === 0xFF && data[i + 1] === 0x51 && data[i + 2] === 0x03) {
                const oldTempo = (data[i + 3] << 16) | (data[i + 4] << 8) | data[i + 5];
                const newTempo = Math.min(Math.max(Math.round(oldTempo / ratio), 1), 0xFFFFFF);
                modified[i + 3] = (newTempo >> 16) & 0xFF;
                modified[i + 4] = (newTempo >> 8) & 0xFF;
                modified[i + 5] = newTempo & 0xFF;
            }
        }
        return modified;
    };

    // Cargar archivo MIDI predefinido
    const loadPredefinedMidi = async (path: string) => {
        try {
            setPlayingStatus('Cargando MIDI...');
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`No se pudo cargar ${path}`);
            }
            const buffer = await response.arrayBuffer();
            setMidiData(new Uint8Array(buffer));

            const bpm = parseTempoFromMIDI(buffer);
            setOriginalBPM(bpm);
            if (bpm) setDesiredBPM(bpm);

            setPlayingStatus('MIDI cargado');
        } catch (err) {
            console.error('Error al cargar MIDI:', err);
            setPlayingStatus('Error al cargar MIDI');
        }
    };

    // Manejar cambio en el selector de archivos predefinidos
    const handlePredefinedMidiChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedPath = e.target.value;
        setSelectedMidiFile(selectedPath);

        if (selectedPath) {
            loadPredefinedMidi(selectedPath);
        } else {
            setMidiData(null);
            setOriginalBPM(null);
            setPlayingStatus('Stopped');
        }
    };

    // Reproducir música
    const playMusic = async () => {
        if (playingStatus === 'Playing') {
            synthRef.current?.stopPlayer();
            setPlayingStatus('Detenido');
            return;
        }

        if (!midiData) {
            setPlayingStatus('No se ha cargado MIDI');
            return;
        }

        try {
            setPlayingStatus('Preparando...');
            await initializeSynth();

            const ratio = desiredBPM / (originalBPM || 120);
            const modifiedMIDI = modifyMIDI_Tempo(midiData, ratio);
            await synthRef.current.addSMFDataToPlayer(modifiedMIDI);

            setPlayingStatus('Playing');
            await synthRef.current.playPlayer();

            await synthRef.current.waitForPlayerStopped();
            await synthRef.current.waitForVoicesStopped();
            await synthRef.current.resetPlayer();

            setPlayingStatus('Finalizado');
        } catch (err) {
            console.error('Error al reproducir:', err);
            setPlayingStatus('Error');
        }
    };

    // Manejar archivo MIDI subido por el usuario
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setPlayingStatus('Cargando MIDI...');
            const buffer = await file.arrayBuffer();
            setMidiData(new Uint8Array(buffer));

            const bpm = parseTempoFromMIDI(buffer);
            setOriginalBPM(bpm);
            if (bpm) setDesiredBPM(bpm);

            setPlayingStatus('MIDI cargado');
            setSelectedMidiFile(''); // Limpiar selector predefinido
        } catch (err) {
            console.error('Error al cargar MIDI:', err);
            setPlayingStatus('Error al cargar MIDI');
        }
    };

    // Cargar script al montar el componente
    useEffect(() => {
        loadScript('/lib/js-synthesizer.min.js');
    }, []);

    return (
        <div className="max-w-2xl mx-auto p-8">
            <h2 className="text-2xl font-bold mb-6">Reproductor MIDI (js-synthesizer)</h2>

            <div className="space-y-4">
                {/* Selector de archivos predefinidos */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Seleccionar archivo MIDI predefinido:
                        <select
                            value={selectedMidiFile}
                            onChange={handlePredefinedMidiChange}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="">-- Seleccionar archivo --</option>
                            {PREDEFINED_MIDI_FILES.map((file) => (
                                <option key={file.path} value={file.path}>
                                    {file.name}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {/* Separador */}
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">O</span>
                    </div>
                </div>

                {/* Subir archivo personalizado */}
                <div>
                    <label className="block text-sm font-medium mb-2">
                        Subir archivo MIDI personalizado (.mid):
                        <input
                            type="file"
                            accept=".mid"
                            onChange={handleFileChange}
                            className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </label>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2">
                        BPM original:
                        <input
                            type="number"
                            value={originalBPM || ''}
                            readOnly
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                        />
                    </label>
                </div>

                <div>
                    <label className="block text-sm font-medium mb-2">
                        BPM deseado:
                        <input
                            type="number"
                            value={desiredBPM}
                            onChange={(e) => setDesiredBPM(Number(e.target.value))}
                            min="10"
                            max="400"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </label>
                </div>

                <button
                    onClick={playMusic}
                    disabled={!midiData}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {playingStatus === 'Playing' ? '⏹ Detener' : '▶ Reproducir'}
                </button>

                <p className={`font-bold ${playingStatus === 'Playing' ? 'text-green-600' :
                    playingStatus === 'Error' ? 'text-red-600' :
                        playingStatus === 'MIDI cargado' ? 'text-blue-600' : 'text-gray-600'
                    }`}>
                    {playingStatus === 'Stopped' ? 'Esperando archivo MIDI...' : playingStatus}
                </p>
            </div>
        </div>
    );
}