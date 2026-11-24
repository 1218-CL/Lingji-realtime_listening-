import { useCallback, useEffect, useRef } from "react";
import { api, errorMessage } from "../lib/api";

export type ServerTranscriptionState =
  | "idle"
  | "listening"
  | "transcribing"
  | "error";

interface UseServerTranscriptionOptions {
  enabled: boolean;
  stream: MediaStream | null;
  lectureId: string;
  getAt: () => number;
  onFinal: (text: string, at: number) => void;
  onState?: (state: ServerTranscriptionState) => void;
  onError?: (message: string) => void;
}

const SEGMENT_MS = 20_000;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return (
    ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    ) || ""
  );
}

/**
 * Records complete 20 second WebM segments from the same microphone stream and
 * sends them to the local server's ASR proxy. Complete segments are used (rather
 * than timeslice chunks) because most speech APIs need a container header.
 */
export function useServerTranscription({
  enabled,
  stream,
  lectureId,
  getAt,
  onFinal,
  onState,
  onError,
}: UseServerTranscriptionOptions) {
  const activeRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const getAtRef = useRef(getAt);
  const onFinalRef = useRef(onFinal);
  const onStateRef = useRef(onState);
  const onErrorRef = useRef(onError);
  const stopResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getAtRef.current = getAt;
    onFinalRef.current = onFinal;
    onStateRef.current = onState;
    onErrorRef.current = onError;
  }, [getAt, onFinal, onError, onState]);

  const reportError = useCallback((message: string) => {
    onStateRef.current?.("error");
    onErrorRef.current?.(message);
  }, []);

  const enqueue = useCallback((blob: Blob, startAt: number) => {
    queueRef.current = queueRef.current.then(async () => {
      if (blob.size < 500) return;
      onStateRef.current?.("transcribing");
      try {
        let result;
        try {
          result = await api.transcribeChunk(lectureId, blob, blob.type || "audio/webm");
        } catch {
          // One retry covers a brief network hiccup without flooding the API.
          result = await api.transcribeChunk(lectureId, blob, blob.type || "audio/webm");
        }
        if (result.text.trim()) {
          onFinalRef.current(result.text.trim(), startAt);
        }
        if (activeRef.current) onStateRef.current?.("listening");
      } catch (error) {
        reportError(errorMessage(error));
      }
    });
  }, [lectureId, reportError]);

  const beginSegment = useCallback(() => {
    if (!activeRef.current || !stream) return;
    const mime = pickMimeType();
    if (!mime) {
      reportError("当前浏览器不支持音频分片上传。");
      activeRef.current = false;
      return;
    }
    const startAt = getAtRef.current();
    const chunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined,
      );
    } catch {
      reportError("无法启动服务端语音识别录音。");
      activeRef.current = false;
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const blob = chunks.length
        ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
        : null;
      const shouldContinue = activeRef.current;
      if (shouldContinue) beginSegment();
      if (blob) enqueue(blob, startAt);
      stopResolveRef.current?.();
      stopResolveRef.current = null;
    };
    recorder.start();
    onStateRef.current?.("listening");
    timerRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, SEGMENT_MS);
  }, [enqueue, reportError, stream]);

  const stop = useCallback(async () => {
    activeRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        stopResolveRef.current = resolve;
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      });
    }
    recorderRef.current = null;
    onStateRef.current?.("idle");
  }, []);

  const flush = useCallback(async () => {
    await queueRef.current.catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !stream) return;
    activeRef.current = true;
    beginSegment();
    return () => {
      void stop();
    };
  }, [beginSegment, enabled, stop, stream]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return { stop, flush };
}
