"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    FaceLandmarker,
    HandLandmarker,
    FilesetResolver,
    DrawingUtils,
} from "@mediapipe/tasks-vision";

const FaceLandmarkerComponent: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
    const [blendshapes, setBlendshapes] = useState<string[]>([]);
    const [isSmiling, setIsSmiling] = useState<boolean>(false);
    const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
    const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
    const [running, setRunning] = useState(true);
    const lastVideoTimeRef = useRef<number>(-1);
    const requestRef = useRef<number>(0);
    const [gazeDirection, setGazeDirection] = useState<'left' | 'right' | 'center'>('center');

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

                // Limpiar solo el canvas de landmarks
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const faceResult = await faceLandmarker.detectForVideo(video, now);
                const handResult = await handLandmarker.detectForVideo(video, now);

                if (faceResult.faceLandmarks && faceResult.faceBlendshapes?.length) {
                    for (const landmarks of faceResult.faceLandmarks) {
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

                    const shapeList = faceResult.faceBlendshapes[0].categories
                        .filter(s => (s.displayName || s.categoryName).startsWith('mouthSmile'))
                        .map(s => `${s.displayName || s.categoryName}: ${(s.score * 100).toFixed(1)}%`);
                    setBlendshapes(shapeList);

                    const smileScore = faceResult.faceBlendshapes[0].categories
                        .filter(s => (s.displayName || s.categoryName).startsWith('mouthSmile'))
                        .reduce((acc, curr) => acc + curr.score, 0) / 2;

                    setIsSmiling(smileScore > 0.3);

                    const eyeLookoutLeft = faceResult.faceBlendshapes[0].categories
                        .find(s => (s.displayName || s.categoryName) === 'eyeLookOutLeft')?.score || 0;

                    const eyeLookoutRight = faceResult.faceBlendshapes[0].categories
                        .find(s => (s.displayName || s.categoryName) === 'eyeLookOutRight')?.score || 0;

                    if (eyeLookoutLeft > 0.3) {
                        setGazeDirection('left');
                    } else if (eyeLookoutRight > 0.3) {
                        setGazeDirection('right');
                    } else {
                        setGazeDirection('center');
                    }
                }

                if (handResult.landmarks) {
                    for (const landmarks of handResult.landmarks) {
                        draw.drawConnectors(
                            landmarks,
                            HandLandmarker.HAND_CONNECTIONS,
                            { color: '#00FF00', lineWidth: 2 }
                        );

                        for (let i = 1; i < landmarks.length; i++) {
                            draw.drawLandmarks([landmarks[i]], {
                                color: '#FF0000',
                                lineWidth: 1,
                                radius: 2,
                            });
                        }

                        draw.drawLandmarks([landmarks[0]], {
                            color: '#FFFF00',
                            lineWidth: 2,
                            radius: 6,
                        });

                        const handLabelRaw = handResult.handedness?.[handResult.landmarks.indexOf(landmarks)]?.[0]?.displayName || '';
                        const handLabel = handLabelRaw === 'Left' ? 'Right' : handLabelRaw === 'Right' ? 'Left' : handLabelRaw;
                        ctx.font = '16px Arial';
                        ctx.fillStyle = '#FFFF00';
                        ctx.fillText(handLabel, landmarks[0].x * canvas.width + 10, landmarks[0].y * canvas.height);

                        const wristPos = landmarks[0];
                        const posText = `x: ${wristPos.x.toFixed(2)} y: ${wristPos.y.toFixed(2)} z: ${wristPos.z.toFixed(2)}`;
                        ctx.fillText(posText, landmarks[0].x * canvas.width + 10, landmarks[0].y * canvas.height + 20);
                    }
                }
            }

            if (running) {
                requestRef.current = requestAnimationFrame(process);
            }
        };

        requestRef.current = requestAnimationFrame(process);
    }, [faceLandmarker, handLandmarker, running]);

    useEffect(() => {
        if (!backgroundCanvasRef.current) return;

        const canvas = backgroundCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        // secciones del canvas
        const sectionWidth = canvas.width / 3;

        // sección derecha (izquierda en el espejo)
        ctx.fillStyle = gazeDirection === 'left' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 0, 0, 0.1)';
        ctx.fillRect(sectionWidth * 2, 0, sectionWidth, canvas.height);

        // sección central
        ctx.fillStyle = gazeDirection === 'center' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
        ctx.fillRect(sectionWidth, 0, sectionWidth, canvas.height);

        // sección izquierda (derecha en el espejo)
        ctx.fillStyle = gazeDirection === 'right' ? 'rgba(0, 0, 255, 0.3)' : 'rgba(0, 0, 255, 0.1)';
        ctx.fillRect(0, 0, sectionWidth, canvas.height);
    }, [gazeDirection]);

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
            // Store videoRef.current in a variable to avoid the warning
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
                <h2 className="text-3xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-purple-500">
                    Face & Hand Detection
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
                            className="absolute w-full h-full object-cover transform scale-x-[-1]"
                        />
                        <canvas
                            ref={backgroundCanvasRef}
                            width="800"
                            height="600"
                            className="absolute w-full h-full object-cover transform scale-x-[-1]"
                        />
                        <canvas
                            ref={canvasRef}
                            width="800"
                            height="600"
                            className="absolute w-full h-full object-cover transform scale-x-[-1]"
                        />
                    </div>
                </div>

                <div className="flex flex-col items-center gap-6">
                    <button
                        onClick={stopCamera}
                        className={`px-6 py-3 rounded-full font-semibold transition-all duration-300 transform hover:scale-105 ${running
                            ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600'
                            : 'bg-gray-600 hover:bg-gray-700'
                            }`}
                    >
                        {running ? 'Detener detección' : 'Iniciar detección'}
                    </button>

                    {blendshapes.length > 0 && (
                        <div className="w-full max-w-md bg-gray-800 rounded-xl p-6 shadow-xl">
                            <h3 className="text-xl font-semibold mb-4 text-center text-pink-400">
                                Estado de la Sonrisa
                            </h3>
                            <div className={`text-center mb-4 p-4 rounded-lg ${isSmiling ? 'bg-green-600' : 'bg-blue-600'}`}>
                                <p className="text-xl font-bold">
                                    {isSmiling ? '😊 Sonriendo' : '😐 Serio'}
                                </p>
                            </div>
                            <div className="text-center mb-4 p-4 rounded-lg bg-purple-600">
                                <p className="text-xl font-bold">
                                    {gazeDirection === 'left' ? '👀 Mirando a la izquierda' :
                                        gazeDirection === 'right' ? '👀 Mirando a la derecha' :
                                            '👀 Mirando al centro'}
                                </p>
                            </div>
                            <ul className="space-y-2">
                                {blendshapes.map((s, i) => (
                                    <li
                                        key={i}
                                        className="bg-gray-700 rounded-lg p-3 text-sm font-medium"
                                    >
                                        {s}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FaceLandmarkerComponent;
