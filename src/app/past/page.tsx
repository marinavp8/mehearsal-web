"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import Script from "next/script";
import { AspectRatio } from "@/components/ui/aspect-ratio";

declare global {
    interface Window {
        Hands: {
            new(config: { locateFile: (file: string) => string }): {
                setOptions: (options: {
                    maxNumHands: number;
                    modelComplexity: number;
                    minDetectionConfidence: number;
                    minTrackingConfidence: number;
                }) => void;
                onResults: (callback: (results: {
                    image: HTMLVideoElement;
                    multiHandLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
                    multiHandedness: Array<{ label: string; score: number }>;
                }) => void) => void;
                send: (data: { image: HTMLVideoElement }) => Promise<void>;
            };
        };
        FaceMesh: {
            new(config: { locateFile: (file: string) => string }): {
                setOptions: (options: {
                    maxNumFaces: number;
                    refineLandmarks: boolean;
                    minDetectionConfidence: number;
                    minTrackingConfidence: number;
                }) => void;
                onResults: (callback: (results: {
                    image: HTMLVideoElement;
                    multiFaceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
                }) => void) => void;
                send: (data: { image: HTMLVideoElement }) => Promise<void>;
            };
        };
        Camera: {
            new(video: HTMLVideoElement, config: {
                onFrame: () => Promise<void>;
                width: number;
                height: number;
            }): {
                start: () => void;
                stop: () => void;
            };
        };
        drawConnectors: (
            ctx: CanvasRenderingContext2D,
            points: Array<{ x: number; y: number; z: number }>,
            connections: Array<[number, number]>,
            options: { color: string; lineWidth: number }
        ) => void;
        drawLandmarks: (
            ctx: CanvasRenderingContext2D,
            points: Array<{ x: number; y: number; z: number }>,
            options: { color: string; lineWidth: number }
        ) => void;
        HAND_CONNECTIONS: Array<[number, number]>;
        FACEMESH_TESSELATION: Array<[number, number]>;
        FACEMESH_RIGHT_EYE: Array<[number, number]>;
        FACEMESH_LEFT_EYE: Array<[number, number]>;
        FACEMESH_FACE_OVAL: Array<[number, number]>;
    }
}

export default function Home() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [handDetection, setHandDetection] = useState(true);
    const [faceDetection, setFaceDetection] = useState(true);

    useEffect(() => {
        let camera: InstanceType<Window['Camera']> | null = null;
        let hands: InstanceType<Window['Hands']> | null = null;
        let faceMesh: InstanceType<Window['FaceMesh']> | null = null;
        let lastVideoWidth = 0;
        let lastVideoHeight = 0;

        function resizeCanvasToVideo() {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (video && canvas) {
                if (video.videoWidth !== lastVideoWidth || video.videoHeight !== lastVideoHeight) {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    lastVideoWidth = video.videoWidth;
                    lastVideoHeight = video.videoHeight;
                }
            }
        }

        function onHandResults(results: {
            image: HTMLVideoElement;
            multiHandLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
            multiHandedness: Array<{ label: string; score: number }>;
        }) {
            if (!canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            if (!handDetection) return;
            ctx.save();
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
            if (results.multiHandLandmarks) {
                for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                    const landmarks = results.multiHandLandmarks[i];
                    const handedness = results.multiHandedness?.[i]?.label || 'Unknown';

                    const wrist = landmarks[0];
                    ctx.beginPath();
                    ctx.arc(
                        wrist.x * canvasRef.current.width,
                        wrist.y * canvasRef.current.height,
                        40,
                        0,
                        2 * Math.PI
                    );
                    ctx.fillStyle = handedness === 'Right' ? '#FFFF00' : '#0000FF';
                    ctx.fill();

                    ctx.font = '20px Arial';
                    ctx.fillStyle = 'white';
                    ctx.fillText(
                        handedness,
                        wrist.x * canvasRef.current.width + 50,
                        wrist.y * canvasRef.current.height
                    );

                    window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
                        color: '#00FF00', lineWidth: 5
                    });
                    window.drawLandmarks(ctx, landmarks, {
                        color: '#FF0000', lineWidth: 2
                    });
                }
            }
            ctx.restore();
        }

        function onFaceResults(results: {
            image: HTMLVideoElement;
            multiFaceLandmarks: Array<Array<{ x: number; y: number; z: number }>>;
        }) {
            if (!canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;
            if (!faceDetection) return;
            ctx.save();
            if (!handDetection) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            if (results.multiFaceLandmarks) {
                for (const landmarks of results.multiFaceLandmarks) {
                    // Calculate smile intensity using mouth corners
                    const leftMouthCorner = landmarks[61]; // Left corner of mouth
                    const rightMouthCorner = landmarks[291]; // Right corner of mouth

                    if (leftMouthCorner && rightMouthCorner) {
                        const mouthWidth = Math.sqrt(
                            Math.pow(rightMouthCorner.x - leftMouthCorner.x, 2) +
                            Math.pow(rightMouthCorner.y - leftMouthCorner.y, 2)
                        );

                        const smileThreshold = 0.15;
                        const isCurrentlySmiling = mouthWidth > smileThreshold;

                        ctx.font = '24px Arial';
                        ctx.fillStyle = isCurrentlySmiling ? '#00FF00' : '#FF0000';
                        ctx.fillText(
                            isCurrentlySmiling ? '😊 Sonriendo' : '😐 No sonriendo',
                            20,
                            40
                        );
                    }

                    window.drawConnectors(ctx, landmarks, window.FACEMESH_TESSELATION, {
                        color: '#C0C0C0', lineWidth: 1
                    });
                    window.drawConnectors(ctx, landmarks, window.FACEMESH_RIGHT_EYE, {
                        color: '#FF3030', lineWidth: 2
                    });
                    window.drawConnectors(ctx, landmarks, window.FACEMESH_LEFT_EYE, {
                        color: '#30FF30', lineWidth: 2
                    });
                    window.drawConnectors(ctx, landmarks, window.FACEMESH_FACE_OVAL, {
                        color: '#E0E0E0', lineWidth: 2
                    });

                    const leftEye = landmarks[33];
                    const rightEye = landmarks[263];
                    const nose = landmarks[1];

                    if (leftEye && rightEye && nose) {
                        const eyeCenter = {
                            x: (leftEye.x + rightEye.x) / 2,
                            y: (leftEye.y + rightEye.y) / 2
                        };

                        const gazeDirection = {
                            x: nose.x - eyeCenter.x,
                            y: nose.y - eyeCenter.y
                        };

                        const length = Math.sqrt(gazeDirection.x * gazeDirection.x + gazeDirection.y * gazeDirection.y);
                        const normalizedDirection = {
                            x: gazeDirection.x / length,
                            y: gazeDirection.y / length
                        };

                        const gradient = ctx.createRadialGradient(
                            eyeCenter.x * canvasRef.current.width,
                            eyeCenter.y * canvasRef.current.height,
                            0,
                            eyeCenter.x * canvasRef.current.width,
                            eyeCenter.y * canvasRef.current.height,
                            200
                        );

                        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
                        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(
                            eyeCenter.x * canvasRef.current.width + normalizedDirection.x * 100,
                            eyeCenter.y * canvasRef.current.height + normalizedDirection.y * 100,
                            100,
                            0,
                            Math.PI * 2
                        );
                        ctx.fill();
                    }
                }
            }
            ctx.restore();
        }

        async function setupMediapipe() {
            if (
                !window.Hands ||
                !window.FaceMesh ||
                !window.Camera ||
                !window.drawConnectors ||
                !window.drawLandmarks
            ) {
                setTimeout(setupMediapipe, 200);
                return;
            }
            const video = videoRef.current;
            if (!video) return;

            hands = new window.Hands({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
            });
            hands.setOptions({
                maxNumHands: 2,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            hands.onResults(onHandResults);

            faceMesh = new window.FaceMesh({
                locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            faceMesh.setOptions({
                maxNumFaces: 1,
                refineLandmarks: true,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            faceMesh.onResults(onFaceResults);

            camera = new window.Camera(video, {
                onFrame: async () => {
                    resizeCanvasToVideo();
                    if (handDetection && hands) {
                        await hands.send({ image: video });
                    }
                    if (faceDetection && faceMesh) {
                        await faceMesh.send({ image: video });
                    }
                },
                width: 1280,
                height: 720
            });
            camera.start();
        }

        setupMediapipe();

        window.addEventListener('resize', resizeCanvasToVideo);

        return () => {
            window.removeEventListener('resize', resizeCanvasToVideo);
            if (camera && camera.stop) camera.stop();
        };
    }, [handDetection, faceDetection]);

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
            <div className="container max-w-4xl p-8 text-center">
                <h1 className="text-4xl font-bold text-blue-600 mb-8">Hand and Face Detection</h1>
                <div className="relative w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-lg bg-black">
                    <AspectRatio ratio={16 / 9} className="relative">
                        <video ref={videoRef} id="input-video" playsInline className="w-full h-auto" />
                        <canvas ref={canvasRef} id="output-canvas" className="absolute top-0 left-0 w-full h-full" />
                    </AspectRatio>
                </div>
                <div className="controls flex gap-4 justify-center mt-8">
                    <Button
                        variant={handDetection ? "default" : "outline"}
                        className={handDetection ? "bg-green-500" : ""}
                        onClick={() => setHandDetection((v) => !v)}
                    >
                        Toggle Hand Detection
                    </Button>
                    <Button
                        variant={faceDetection ? "default" : "outline"}
                        className={faceDetection ? "bg-green-500" : ""}
                        onClick={() => setFaceDetection((v) => !v)}
                    >
                        Toggle Face Detection
                    </Button>
                </div>
            </div>
            {/* MediaPipe scripts */}
            <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" strategy="beforeInteractive" />
            <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/control_utils/control_utils.js" strategy="beforeInteractive" />
            <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" strategy="beforeInteractive" />
            <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js" strategy="beforeInteractive" />
            <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js" strategy="beforeInteractive" />
        </main>
    );
}
