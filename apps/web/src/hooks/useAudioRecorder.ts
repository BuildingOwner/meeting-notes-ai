"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "requesting"
  | "denied"
  | "recording"
  | "paused"
  | "done";

export interface UseAudioRecorderReturn {
  state: RecorderState;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  blob: Blob | null;
  url: string | null;
  duration: number;
  mimeType: string;
  error: string | null;
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mimeType] = useState(getSupportedMimeType);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "denied") return;
    setError(null);
    setState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        revokeUrl();
        const objectUrl = URL.createObjectURL(recorded);
        urlRef.current = objectUrl;
        setBlob(recorded);
        setUrl(objectUrl);
        stopStream();
        clearTimer();
        setState("done");
      };

      recorder.start(250);
      setState("recording");
      setDuration(0);
      startTimer();
    } catch (err) {
      stopStream();
      setState("denied");
      setError(
        err instanceof Error ? err.message : "마이크 접근이 거부되었습니다."
      );
    }
  }, [state, mimeType, stopStream, revokeUrl, clearTimer, startTimer]);

  const stop = useCallback(() => {
    if (
      recorderRef.current &&
      (state === "recording" || state === "paused")
    ) {
      recorderRef.current.stop();
    }
  }, [state]);

  const pause = useCallback(() => {
    if (recorderRef.current && state === "recording") {
      recorderRef.current.pause();
      clearTimer();
      setState("paused");
    }
  }, [state, clearTimer]);

  const resume = useCallback(() => {
    if (recorderRef.current && state === "paused") {
      recorderRef.current.resume();
      setState("recording");
      startTimer();
    }
  }, [state, startTimer]);

  const reset = useCallback(() => {
    clearTimer();
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      if (state === "recording" || state === "paused") {
        recorderRef.current.stop();
      }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    stopStream();
    revokeUrl();
    setBlob(null);
    setUrl(null);
    setDuration(0);
    setError(null);
    setState("idle");
  }, [state, clearTimer, stopStream, revokeUrl]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      revokeUrl();
    };
  }, [clearTimer, stopStream, revokeUrl]);

  return {
    state,
    start,
    stop,
    pause,
    resume,
    reset,
    blob,
    url,
    duration,
    mimeType,
    error,
  };
}
