"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    FaceLandmarker,
    HandLandmarker,
    FilesetResolver,
    DrawingUtils,
} from "@mediapipe/tasks-vision";

const GesturesDetectorComponent: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
    const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
    const [running, setRunning] = useState(true);
    const lastVideoTimeRef = useRef<number>(-1);
    const requestRef = useRef<number>(0);

    const detectLoop = useCallback(() => {
        const process = async () => {
            if (!running || !videoRef.current || !canvasRef.current || !faceLandmarker || !handLandmarker) {
                if (requestRef.current) {
                    cancelAnimationFrame(requestRef.current);
                    requestRef.current = 0;
                }
                return;
            }

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d")!;
            const draw = new DrawingUtils(ctx);

            const now = performance.now();
            if (video.currentTime !== lastVideoTimeRef.current) {
                lastVideoTimeRef.current = video.currentTime;

                // Limpiar el canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const faceResult = await faceLandmarker.detectForVideo(video, now);
                const handResult = await handLandmarker.detectForVideo(video, now);

                // Procesar landmarks faciales
                if (faceResult.faceLandmarks && faceResult.faceBlendshapes?.length) {
                    for (const landmarks of faceResult.faceLandmarks) {
                        // Dibujar landmarks faciales
                        draw.drawConnectors(
                            landmarks,
                            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
                            { color: '#C0C0C070', lineWidth: 1 }
                        );
                        draw.drawConnectors(
                            landmarks,
                            FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
                            { color: '#FF3030' }
                        );
                        draw.drawConnectors(
                            landmarks,
                            FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
                            { color: '#30FF30' }
                        );
                        draw.drawConnectors(
                            landmarks,
                            FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
                            { color: '#E0E0E0' }
                        );
                        draw.drawConnectors(
                            landmarks,
                            FaceLandmarker.FACE_LANDMARKS_LIPS,
                            { color: '#E0E0E0' }
                        );
                    }

                    // Console.log de todos los blendshapes de MediaPipe
                    console.log('=== BLENDSHAPES DE MEDIAPIPE ===');
                    faceResult.faceBlendshapes[0].categories.forEach((blendshape, index) => {
                        console.log(`${index + 1}. ${blendshape.displayName || blendshape.categoryName}: ${(blendshape.score * 100).toFixed(2)}%`);
                    });
                    console.log('================================');
                }

                // Procesar landmarks de manos
                if (handResult.landmarks) {
                    for (const landmarks of handResult.landmarks) {
                        // Dibujar conexiones de la mano
                        draw.drawConnectors(
                            landmarks,
                            HandLandmarker.HAND_CONNECTIONS,
                            { color: '#00FF00', lineWidth: 2 }
                        );

                        // Dibujar landmarks individuales
                        for (let i = 1; i < landmarks.length; i++) {
                            draw.drawLandmarks([landmarks[i]], {
                                color: '#FF0000',
                                lineWidth: 1,
                                radius: 2,
                            });
                        }

                        // Destacar el punto de la muñeca
                        draw.drawLandmarks([landmarks[0]], {
                            color: '#FFFF00',
                            lineWidth: 2,
                            radius: 6,
                        });
                    }

                    // Console.log de información de manos
                    console.log('=== MANOS DETECTADAS ===');
                    for (let i = 0; i < handResult.landmarks.length; i++) {
                        const handLabelRaw = handResult.handedness?.[i]?.[0]?.displayName || '';
                        const handLabel = handLabelRaw === 'Left' ? 'Right' : handLabelRaw === 'Right' ? 'Left' : handLabelRaw;
                        const wristPos = handResult.landmarks[i][0];
                        console.log(`Mano ${i + 1} (${handLabel}): x=${wristPos.x.toFixed(3)}, y=${wristPos.y.toFixed(3)}, z=${wristPos.z.toFixed(3)}`);
                    }
                    console.log('========================');
                }
            }

            if (running) {
                requestRef.current = requestAnimationFrame(process);
            }
        };

        requestRef.current = requestAnimationFrame(process);
    }, [faceLandmarker, handLandmarker, running]);

    useEffect(() => {
        let mounted = true;

        const initModel = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
                );

                const faceModel = await FaceLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                        delegate: "GPU",
                    },
                    outputFaceBlendshapes: true,
                    runningMode: "VIDEO",
                    numFaces: 1,
                });

                const handModel = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU",
                    },
                    runningMode: "VIDEO",
                    numHands: 2,
                });

                if (mounted) {
                    setFaceLandmarker(faceModel);
                    setHandLandmarker(handModel);
                    console.log('Models initialized');
                }
            } catch (error) {
                console.error('Error initializing models:', error);
            }
        };

        const initCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current && mounted) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                    console.log('Camera initialized');
                }
            } catch (error) {
                console.error("Error accessing camera:", error);
            }
        };

        const init = async () => {
            await initCamera();
            await initModel();
        };

        init();

        return () => {
            mounted = false;
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = 0;
            }
            const video = videoRef.current;
            if (video?.srcObject) {
                const tracks = (video.srcObject as MediaStream).getTracks();
                tracks?.forEach((t) => t.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (faceLandmarker && handLandmarker && videoRef.current && canvasRef.current) {
            console.log('Starting detection loop');
            detectLoop();
        }
    }, [faceLandmarker, handLandmarker, detectLoop]);

    const stopCamera = () => {
        if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = 0;
        }
        setRunning(false);
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-3xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-blue-500">
                    DETECTOR DE LANDMARKS
                </h2>

                <div className="bg-gray-800 rounded-xl p-6 shadow-2xl mb-8">
                    <div className="relative w-full max-w-[800px] mx-auto aspect-video rounded-lg overflow-hidden">
                        <video
                            ref={videoRef}
                            width="800"
                            height="600"
                            autoPlay
                            muted
                            playsInline
                            className="absolute w-full h-full object-cover"
                        />
                        <canvas
                            ref={canvasRef}
                            width="800"
                            height="600"
                            className="absolute w-full h-full object-cover"
                        />
                    </div>
                </div>

                <div className="flex flex-col items-center gap-6">
                    <button
                        onClick={stopCamera}
                        className={`px-6 py-3 rounded-full font-semibold transition-all duration-300 transform hover:scale-105 ${running
                            ? 'bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600'
                            : 'bg-gray-600 hover:bg-gray-700'
                            }`}
                    >
                        {running ? 'Detener detección' : 'Iniciar detección'}
                    </button>

                    <div className="w-full max-w-2xl bg-gray-800 rounded-xl p-6 shadow-xl">
                        <h3 className="text-xl font-bold mb-4 text-center text-green-400">
                            Información de Detección
                        </h3>
                        <div className="text-center p-8 bg-gray-700 rounded-lg">
                            <p className="text-gray-300 text-lg mb-4">
                                Revisa la consola del navegador para ver todos los blendshapes de MediaPipe
                            </p>
                            <div className="text-sm text-gray-400">
                                <p>• Landmarks faciales: 468 puntos</p>
                                <p>• Landmarks de manos: 21 puntos por mano</p>
                                <p>• Blendshapes: Todos los gestos faciales de MediaPipe</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GesturesDetectorComponent;
