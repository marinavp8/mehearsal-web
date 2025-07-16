"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import PitchDetectorComponent from "../components/PitchDetector";
import SpeechRecognizer from "../components/SpeechRecognizer";

const FaceLandmarkerComponent: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null);
  const [blendshapes, setBlendshapes] = useState<string[]>([]);
  const [eyeBlendshapes, setEyeBlendshapes] = useState<string[]>([]);
  const [isSmiling, setIsSmiling] = useState<boolean>(false);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const requestRef = useRef<number>(0);
  const [gazeDirection, setGazeDirection] = useState<'left-up' | 'center-up' | 'right-up' | 'left-down' | 'center-down' | 'right-down'>('center-up');
  const [fps, setFps] = useState<number>(0);
  const [inferenceMs, setInferenceMs] = useState<number>(0);
  const lastFpsUpdate = useRef<number>(performance.now());
  const frameCount = useRef<number>(0);
  const [pitchDetectorActive, setPitchDetectorActive] = useState<boolean>(true);
  const [speechRecognizerActive, setSpeechRecognizerActive] = useState<boolean>(true);
  const [speechLanguage, setSpeechLanguage] = useState<'es' | 'en'>('es');
  const lastFaceBlendshapes = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const detectLoop = useCallback(() => {
    const process = async () => {
      try {
        if (!videoRef.current || !canvasRef.current || !faceLandmarker || !handLandmarker) {
          if (requestRef.current) {
            cancelAnimationFrame(requestRef.current);
            requestRef.current = 0;
          }
          return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.error("No se pudo obtener el contexto del canvas");
          return;
        }
        const draw = new DrawingUtils(ctx);

        // Verificar que el video esté listo
        if (video.readyState < 2) {
          requestRef.current = requestAnimationFrame(process);
          return;
        }

        const frameStart = performance.now();

        const now = performance.now();
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;

          // Limpiar solo el canvas de landmarks
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const faceResult = await faceLandmarker.detectForVideo(video, now);
          const handResult = await handLandmarker.detectForVideo(video, now);

          if (faceResult.faceLandmarks && faceResult.faceBlendshapes?.length) {
            lastFaceBlendshapes.current = {};
            faceResult.faceBlendshapes[0].categories.forEach(s => {
              lastFaceBlendshapes.current[s.displayName || s.categoryName] = s.score;
            });

            for (const landmarks of faceResult.faceLandmarks) {
              // Comentado para evitar spam en consola
              // console.log(landmarks);
              // draw.drawConnectors(
              //   landmarks,
              //   FaceLandmarker.FACE_LANDMARKS_TESSELATION,
              //   { color: '#C0C0C070', lineWidth: 1 }
              // );
              // draw.drawConnectors(
              //   landmarks,
              //   FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
              //   { color: '#FF3030' }
              // );
              // draw.drawConnectors(
              //   landmarks,
              //   FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
              //   { color: '#30FF30' }
              // );
              // draw.drawConnectors(
              //   landmarks,
              //   FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
              //   { color: '#E0E0E0' }
              // );
              // draw.drawConnectors(
              //   landmarks,
              //   FaceLandmarker.FACE_LANDMARKS_LIPS,
              //   { color: '#E0E0E0' }
              // );
            }

            const shapeList = faceResult.faceBlendshapes[0].categories
              .filter(s => (s.displayName || s.categoryName).startsWith('mouthSmile'))
              .map(s => `${s.displayName || s.categoryName}: ${(s.score * 100).toFixed(1)}%`);
            setBlendshapes(shapeList);

            const eyeShapeList = faceResult.faceBlendshapes[0].categories
              .filter(s => {
                const name = s.displayName || s.categoryName;
                return name === 'eyeLookUpLeft' ||
                  name === 'eyeLookUpRight' ||
                  name === 'eyeLookDownLeft' ||
                  name === 'eyeLookDownRight' ||
                  name === 'eyeLookOutLeft' ||
                  name === 'eyeLookOutRight';
              })
              .map(s => `${s.displayName || s.categoryName}: ${(s.score * 100).toFixed(1)}%`);
            setEyeBlendshapes(eyeShapeList);

            const smileScore = faceResult.faceBlendshapes[0].categories
              .filter(s => (s.displayName || s.categoryName).startsWith('mouthSmile'))
              .reduce((acc: number, curr: any) => acc + curr.score, 0) / 2;

            setIsSmiling(smileScore > 0.3);

            const up = (faceResult.faceBlendshapes[0].categories.find(s => (s.displayName || s.categoryName) === 'eyeLookUpLeft')?.score || 0)
              + (faceResult.faceBlendshapes[0].categories.find(s => (s.displayName || s.categoryName) === 'eyeLookUpRight')?.score || 0);
            const down = (faceResult.faceBlendshapes[0].categories.find(s => (s.displayName || s.categoryName) === 'eyeLookDownLeft')?.score || 0)
              + (faceResult.faceBlendshapes[0].categories.find(s => (s.displayName || s.categoryName) === 'eyeLookDownRight')?.score || 0);
            const left = (faceResult.faceBlendshapes[0].categories.find(s => (s.displayName || s.categoryName) === 'eyeLookOutLeft')?.score || 0);
            const right = (faceResult.faceBlendshapes[0].categories.find(s => (s.displayName || s.categoryName) === 'eyeLookOutRight')?.score || 0);
            const threshold = 0.3;
            let vertical: 'up' | 'down' | 'center';
            if (up > down && up > threshold) {
              vertical = 'up';
            } else if (down > up && down > threshold) {
              vertical = 'down';
            } else {
              vertical = 'center';
            }
            let horizontal: 'left' | 'right' | 'center';
            if (left > right && left > threshold) {
              horizontal = 'right';
            } else if (right > left && right > threshold) {
              horizontal = 'left';
            } else {
              horizontal = 'center';
            }
            let gaze: 'left-up' | 'center-up' | 'right-up' | 'left-down' | 'center-down' | 'right-down' = 'center-up';
            if (vertical === 'up') {
              if (horizontal === 'left') gaze = 'left-up';
              else if (horizontal === 'right') gaze = 'right-up';
              else gaze = 'center-up';
            } else if (vertical === 'down') {
              if (horizontal === 'left') gaze = 'left-down';
              else if (horizontal === 'right') gaze = 'right-down';
              else gaze = 'center-down';
            } else {
              if (horizontal === 'left') gaze = 'left-up';
              else if (horizontal === 'right') gaze = 'right-up';
              else gaze = 'center-up';
            }
            setGazeDirection(gaze);
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
            }

            ctx.save();
            ctx.scale(-1, 1);
            for (const landmarks of handResult.landmarks) {
              const handLabelRaw = handResult.handedness?.[handResult.landmarks.indexOf(landmarks)]?.[0]?.displayName || '';
              const handLabel = handLabelRaw === 'Left' ? 'Right' : handLabelRaw === 'Right' ? 'Left' : handLabelRaw;
              ctx.font = '16px Arial';
              ctx.fillStyle = '#FFFF00';
              ctx.fillText(handLabel, -landmarks[0].x * canvas.width - 10, landmarks[0].y * canvas.height);

              const wristPos = landmarks[0];
              const posText = `x: ${wristPos.x.toFixed(2)} y: ${wristPos.y.toFixed(2)} z: ${wristPos.z.toFixed(2)}`;
              ctx.fillText(posText, -landmarks[0].x * canvas.width - 10, landmarks[0].y * canvas.height + 20);
            }
            ctx.restore();
          }

          const frameEnd = performance.now();
          setInferenceMs(frameEnd - frameStart);
          frameCount.current += 1;
          if (frameEnd - lastFpsUpdate.current > 1000) {
            setFps(frameCount.current);
            frameCount.current = 0;
            lastFpsUpdate.current = frameEnd;
          }
        }

        requestRef.current = requestAnimationFrame(process);
      } catch (error) {
        console.error("Error en el loop de detección:", error);
        // Continuar con el siguiente frame incluso si hay error
        requestRef.current = requestAnimationFrame(process);
      }
    };

    requestRef.current = requestAnimationFrame(process);
  }, [faceLandmarker, handLandmarker]);

  useEffect(() => {
    if (!backgroundCanvasRef.current) return;

    const canvas = backgroundCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error("No se pudo obtener el contexto del canvas de fondo");
      return;
    }

    // Asegurar que el canvas tenga dimensiones válidas
    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
      console.warn("Canvas tiene dimensiones 0, esperando...");
      return;
    }

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Limpiar el canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // secciones del canvas
    const sectionWidth = canvas.width / 3;
    const sectionHeight = canvas.height / 2;

    // Secciones superiores (sin transformación de espejo)
    ctx.fillStyle = gazeDirection === 'left-up' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(0, 0, sectionWidth, sectionHeight);

    ctx.fillStyle = gazeDirection === 'center-up' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(sectionWidth, 0, sectionWidth, sectionHeight);

    ctx.fillStyle = gazeDirection === 'right-up' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(sectionWidth * 2, 0, sectionWidth, sectionHeight);

    // Secciones inferiores (sin transformación de espejo)
    ctx.fillStyle = gazeDirection === 'left-down' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(0, sectionHeight, sectionWidth, sectionHeight);

    ctx.fillStyle = gazeDirection === 'center-down' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(sectionWidth, sectionHeight, sectionWidth, sectionHeight);

    ctx.fillStyle = gazeDirection === 'right-down' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 255, 0, 0.1)';
    ctx.fillRect(sectionWidth * 2, sectionHeight, sectionWidth, sectionHeight);
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
          setIsInitialized(true);
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
    if (isInitialized && faceLandmarker && handLandmarker && videoRef.current && canvasRef.current) {
      console.log('Starting detection loop');
      detectLoop();
    }
  }, [isInitialized, faceLandmarker, handLandmarker, detectLoop]);



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-purple-500">
            MEHEARSAL
          </h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pitchDetectorActive}
                onChange={(e) => setPitchDetectorActive(e.target.checked)}
                className="w-4 h-4 text-pink-500 bg-gray-700 border-gray-600 rounded focus:ring-pink-500 focus:ring-2"
              />
              <span className="text-gray-300">Pitch Detector</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={speechRecognizerActive}
                onChange={(e) => setSpeechRecognizerActive(e.target.checked)}
                className="w-4 h-4 text-pink-500 bg-gray-700 border-gray-600 rounded focus:ring-pink-500 focus:ring-2"
              />
              <span className="text-gray-300">Speech Recognizer</span>
            </label>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-6 shadow-2xl mb-8">
          <div className="flex gap-6">
            <div className="relative w-full max-w-[800px] aspect-video rounded-lg overflow-hidden">
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

            <div className="min-w-[250px] bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-gray-200">Valores de Detección</h3>
              <div className="text-sm text-gray-400 mb-2">FPS: {fps} | Inferencia: {inferenceMs.toFixed(1)} ms</div>
              <ul className="space-y-2 text-sm font-mono">
                {eyeBlendshapes.map((s, i) => (
                  <li
                    key={i}
                    className="bg-gray-800/50 rounded px-3 py-2 text-gray-300"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Gesture Detection Results */}
          {blendshapes.length > 0 && (
            <div className="w-full bg-gray-800 rounded-xl p-6 shadow-xl">
              <h3 className="text-lg font-semibold mb-4 text-gray-200">Detección de Gestos</h3>
              <div className={`text-center mb-4 p-4 rounded-lg ${isSmiling ? 'bg-green-600' : 'bg-blue-600'}`}>
                <p className="text-xl font-bold">
                  {isSmiling ? '😊 Sonriendo' : '😐 Serio'}
                </p>
              </div>
              <div className="text-center mb-4 p-4 rounded-lg bg-purple-600">
                <p className="text-xl font-bold">
                  {gazeDirection === 'left-up' ? '👀 Mirando arriba-izquierda' :
                    gazeDirection === 'center-up' ? '👀 Mirando arriba-centro' :
                      gazeDirection === 'right-up' ? '👀 Mirando arriba-derecha' :
                        gazeDirection === 'left-down' ? '👀 Mirando abajo-izquierda' :
                          gazeDirection === 'center-down' ? '👀 Mirando abajo-centro' :
                            '👀 Mirando abajo-derecha'}
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

          {/* Pitch Detector */}
          <PitchDetectorComponent isActive={pitchDetectorActive} />

          {/* Speech Recognizer */}
          <SpeechRecognizer
            isActive={speechRecognizerActive}
            language={speechLanguage}
            onLanguageChange={setSpeechLanguage}
          />
        </div>

        {/* Combined Status */}
        <div className="bg-gray-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-semibold mb-4 text-gray-200">Estado del Sistema</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                <span className="text-sm font-medium text-gray-300">Detección de Gestos</span>
              </div>
              <p className="text-xs text-gray-400">Activo y funcionando</p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${pitchDetectorActive ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                <span className="text-sm font-medium text-gray-300">Detección de Pitch</span>
              </div>
              <p className="text-xs text-gray-400">
                {pitchDetectorActive ? 'Activo y escuchando' : 'Desactivado'}
              </p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${speechRecognizerActive ? 'bg-green-400' : 'bg-gray-500'}`}></div>
                <span className="text-sm font-medium text-gray-300">Reconocimiento de Voz</span>
              </div>
              <p className="text-xs text-gray-400">
                {speechRecognizerActive ? 'Activo y escuchando' : 'Desactivado'}
              </p>
            </div>
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                <span className="text-sm font-medium text-gray-300">Rendimiento</span>
              </div>
              <p className="text-xs text-gray-400">{fps} FPS | {inferenceMs.toFixed(1)}ms</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FaceLandmarkerComponent;