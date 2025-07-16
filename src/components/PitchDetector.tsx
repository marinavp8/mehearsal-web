"use client";
import React, { useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { Line } from "react-chartjs-2";
import {
    Chart as ChartJS,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Tooltip,
    Legend,
} from "chart.js";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

// Type declaration for webkitAudioContext
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

const BUFFER_SIZE = 1024;
const MIN_CLARITY = 0.95;
const MIN_FREQUENCY = 50;
const MAX_FREQUENCY = 500;

const getNoteFromFrequency = (frequency: number): string => {
    const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const a4 = 440;
    const c0 = a4 * Math.pow(2, -4.75);

    if (frequency < MIN_FREQUENCY) return "---";

    const halfStepsFromC0 = Math.round(12 * Math.log2(frequency / c0));
    const octave = Math.floor(halfStepsFromC0 / 12);
    const noteIndex = halfStepsFromC0 % 12;

    return noteStrings[noteIndex] + octave;
};

interface PitchDetectorProps {
    isActive?: boolean;
}

const PitchDetectorComponent: React.FC<PitchDetectorProps> = ({ isActive = true }) => {
    const [pitch, setPitch] = useState<number | null>(null);
    const [clarity, setClarity] = useState<number | null>(null);
    const [pitchHistory, setPitchHistory] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isListening, setIsListening] = useState<boolean>(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const detectorRef = useRef<ReturnType<typeof PitchDetector.forFloat32Array> | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        let mounted = true;

        const start = async () => {
            if (!isActive) return;

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (!mounted) return;

                const audioContext = new (window.AudioContext || window.webkitAudioContext!)();
                audioContextRef.current = audioContext;

                const source = audioContext.createMediaStreamSource(stream);
                sourceRef.current = source;

                const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
                processorRef.current = processor;

                detectorRef.current = PitchDetector.forFloat32Array(BUFFER_SIZE);

                processor.onaudioprocess = (event) => {
                    const input = event.inputBuffer.getChannelData(0);
                    if (detectorRef.current) {
                        const [detectedPitch, detectedClarity] = detectorRef.current.findPitch(input, audioContext.sampleRate);

                        if (detectedClarity > MIN_CLARITY &&
                            detectedPitch > MIN_FREQUENCY &&
                            detectedPitch < MAX_FREQUENCY) {

                            setPitch(detectedPitch);
                            setClarity(detectedClarity);
                            setPitchHistory((prev: number[]) => [
                                ...prev.slice(-99),
                                detectedPitch
                            ]);
                        }
                    }
                };

                source.connect(processor);
                processor.connect(audioContext.destination);
                setIsListening(true);
            } catch (err: unknown) {
                console.error("Microphone access error:", err);
                setError("Could not access microphone.");
            }
        };

        const stop = () => {
            processorRef.current?.disconnect();
            sourceRef.current?.disconnect();
            audioContextRef.current?.close();
            setIsListening(false);
        };

        if (isActive) {
            start();
        } else {
            stop();
        }

        return () => {
            mounted = false;
            stop();
        };
    }, [isActive]);

    const chartData = {
        labels: pitchHistory.map((_, i) => i),
        datasets: [
            {
                label: "Pitch (Hz)",
                data: pitchHistory,
                fill: false,
                borderColor: "rgb(255, 99, 132)",
                tension: 0.1,
                spanGaps: true,
            },
        ],
    };

    if (!isActive) {
        return (
            <div className="bg-gray-800 rounded-xl p-6 shadow-xl">
                <h3 className="text-lg font-semibold mb-4 text-gray-200">Pitch Detector</h3>
                <div className="text-gray-400 text-center py-8">
                    Pitch detector is disabled
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800 rounded-xl p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-200">Pitch Detector</h3>
            {error && <div className="text-red-400 mb-4 text-sm">{error}</div>}

            <div className="space-y-3 mb-4">
                <div className="flex justify-between items-center">
                    <span className="text-gray-300">Pitch:</span>
                    <span className="font-mono text-pink-400">
                        {pitch && pitch > 0 ? `${pitch.toFixed(1)} Hz` : "No pitch detected"}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-300">Note:</span>
                    <span className="font-mono text-green-400">
                        {pitch && pitch > 0 ? getNoteFromFrequency(pitch) : "---"}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-300">Clarity:</span>
                    <span className="font-mono text-purple-400">
                        {clarity !== null ? clarity.toFixed(2) : "--"}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-gray-300">Status:</span>
                    <span className={`font-mono ${isListening ? 'text-green-400' : 'text-red-400'}`}>
                        {isListening ? 'Listening' : 'Stopped'}
                    </span>
                </div>
            </div>

            <div className="w-full h-32 bg-gray-900 rounded-lg p-2">
                <Line
                    data={chartData}
                    options={{
                        animation: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: {
                                min: MIN_FREQUENCY,
                                max: MAX_FREQUENCY,
                                grid: { color: 'rgba(255,255,255,0.1)' },
                                ticks: { color: 'rgba(255,255,255,0.7)' }
                            },
                            x: {
                                grid: { color: 'rgba(255,255,255,0.1)' },
                                ticks: { color: 'rgba(255,255,255,0.7)' }
                            }
                        },
                        responsive: true,
                        maintainAspectRatio: false
                    }}
                />
            </div>
        </div>
    );
};

export default PitchDetectorComponent; 