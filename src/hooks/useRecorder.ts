import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "requesting" | "recording" | "stopping" | "error";

interface UseRecorderOptions {
  language?: string;
  onFinal?: (text: string, at: number) => void;
  onError?: (message: string) => void;
  browserSpeechEnabled?: boolean;
}

interface StopResult {
  blob: Blob | null;
  mime: string;
  durationSec: number;
}

function speechConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function useRecorder({
  language = "zh-CN",
  onFinal,
  onError,
  browserSpeechEnabled = true,
}: UseRecorderOptions = {}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [speechSupported] = useState(() => Boolean(speechConstructor()));
  const [mediaSupported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== "undefined",
  );

  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  const languageRef = useRef(language);
  const browserSpeechEnabledRef = useRef(browserSpeechEnabled);
  useEffect(() => {
    onFinalRef.current = onFinal;
    onErrorRef.current = onError;
    languageRef.current = language;
    browserSpeechEnabledRef.current = browserSpeechEnabled;
  }, [onFinal, onError, language, browserSpeechEnabled]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRef = useRef(false);
  const speechFailedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const elapsedRef = useRef(0);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const restartDelayRef = useRef(420);
  const networkWarnedRef = useRef(false);
  const mimeRef = useRef("audio/webm");

  const reportError = useCallback((message: string) => {
    setError(message);
    onErrorRef.current?.(message);
  }, []);

  const createRecognition = useCallback((): SpeechRecognitionLike | null => {
    const Constructor = speechConstructor();
    if (!Constructor) return null;
    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageRef.current;
    recognition.maxAlternatives = 1;

    const scheduleRestart = (delay: number) => {
      if (!shouldRestartRef.current || !activeRef.current) return;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = window.setTimeout(() => {
        if (!shouldRestartRef.current || !activeRef.current) return;
        try {
          recognition.start();
        } catch {
          // InvalidStateError can happen while the previous session is closing.
        }
      }, delay);
    };

    recognition.onstart = () => {
      restartDelayRef.current = 420;
    };

    recognition.onresult = (event) => {
      networkWarnedRef.current = false;
      restartDelayRef.current = 420;
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const value = result?.[0]?.transcript?.trim() || "";
        if (!value) continue;
        if (result.isFinal) {
          onFinalRef.current?.(value, elapsedRef.current);
        } else {
          interimText += value;
        }
      }
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        speechFailedRef.current = true;
        shouldRestartRef.current = false;
        reportError("浏览器拒绝了语音识别权限，录音和计时仍在继续；接入支持视觉的模型后可用图片辅助。");
        return;
      }
      if (event.error === "network") {
        // Chrome's speech service occasionally drops its network stream. Keep
        // recording/notes alive and reconnect in the background instead of
        // stopping until the page is refreshed.
        speechFailedRef.current = false;
        shouldRestartRef.current = true;
        restartDelayRef.current = 5_000;
        if (!networkWarnedRef.current) {
          networkWarnedRef.current = true;
          reportError("语音识别网络暂时断开，正在后台自动重连；录音和计时不会中断。");
        }
        scheduleRestart(5_000);
        return;
      }
      if (event.error === "audio-capture") {
        speechFailedRef.current = true;
        shouldRestartRef.current = false;
        reportError("没有检测到可用的麦克风，请检查设备设置。");
      }
    };

    recognition.onend = () => {
      setInterim("");
      if (!shouldRestartRef.current || speechFailedRef.current || !activeRef.current) return;
      scheduleRestart(restartDelayRef.current);
    };

    return recognition;
  }, [reportError]);

  const cleanupMedia = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      shouldRestartRef.current = false;
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    recorderRef.current = null;
    setAnalyser(null);
    setStream(null);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (activeRef.current || startingRef.current) return false;
    if (!mediaSupported) {
      reportError("当前浏览器不支持录音，请使用最新版 Chrome 或 Edge。");
      setStatus("error");
      return false;
    }
    startingRef.current = true;
    setStatus("requesting");
    setError("");
    setInterim("");
    chunksRef.current = [];
    speechFailedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setStream(stream);

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        const node = audioContext.createAnalyser();
        node.fftSize = 256;
        node.smoothingTimeConstant = 0.8;
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(node);
        node.connect(silentGain);
        silentGain.connect(audioContext.destination);
        await audioContext.resume().catch(() => {});
        audioContextRef.current = audioContext;
        setAnalyser(node);
      }

      const mime = pickMimeType();
      mimeRef.current = mime ? mime.split(";")[0] : "audio/webm";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      const recognition = browserSpeechEnabledRef.current
        ? createRecognition()
        : null;
      if (recognition) {
        recognitionRef.current = recognition;
        shouldRestartRef.current = true;
        try {
          recognition.start();
        } catch {
          reportError("语音识别启动失败，录音和计时仍在继续，会在后台自动重试。");
        }
      }

      startedAtRef.current = Date.now();
      elapsedRef.current = 0;
      setElapsedSec(0);
      activeRef.current = true;
      setStatus("recording");
      timerRef.current = window.setInterval(() => {
        const next = Math.floor((Date.now() - startedAtRef.current) / 1000);
        elapsedRef.current = next;
        setElapsedSec(next);
      }, 500);
      return true;
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "麦克风权限被拒绝。请在浏览器地址栏中允许麦克风后重试。"
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "没有找到麦克风设备，请连接设备后重试。"
            : "无法启动录音，请检查麦克风和浏览器权限。";
      cleanupMedia();
      activeRef.current = false;
      startingRef.current = false;
      setStatus("error");
      reportError(message);
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [cleanupMedia, createRecognition, mediaSupported, reportError]);

  const stop = useCallback(async (): Promise<StopResult> => {
    const durationSec = elapsedRef.current;
    if (!recorderRef.current && !streamRef.current) {
      setStatus("idle");
      setInterim("");
      return { blob: null, mime: mimeRef.current, durationSec };
    }
    setStatus("stopping");
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const recorder = recorderRef.current;
    let blob: Blob | null = null;
    if (recorder && recorder.state !== "inactive") {
      blob = await new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => {
          const type = recorder.mimeType || mimeRef.current;
          resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type }) : null);
        };
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      });
    }

    activeRef.current = false;
    cleanupMedia();
    setElapsedSec(durationSec);
    elapsedRef.current = durationSec;
    setStatus("idle");
    setInterim("");
    return { blob, mime: mimeRef.current, durationSec };
  }, [cleanupMedia]);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      activeRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    };
  }, []);

  return {
    status,
    interim,
    error,
    elapsedSec,
    analyser,
    stream,
    speechSupported,
    mediaSupported,
    start,
    stop,
    clearError: () => setError(""),
  };
}
