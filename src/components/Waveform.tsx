import { useEffect, useRef } from "react";

interface WaveformProps {
  analyser: AnalyserNode | null;
  active: boolean;
  color?: string;
  bars?: number;
  height?: number;
  className?: string;
}

export function Waveform({
  analyser,
  active,
  color = "#7fe3dc",
  bars = 44,
  height = 48,
  className = "",
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let heightPx = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      heightPx = Math.max(1, rect.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(heightPx * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    if (analyser) {
      data = new Uint8Array(analyser.frequencyBinCount);
    }

    const draw = (time: number) => {
      context.clearRect(0, 0, width, heightPx);
      if (analyser && data) analyser.getByteFrequencyData(data);

      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      const mid = heightPx / 2;

      for (let index = 0; index < bars; index += 1) {
        let level: number;
        if (active) {
          if (data) {
            const sourceIndex = Math.floor((index / bars) * data.length * 0.72);
            const raw = data[sourceIndex] / 255;
            const neighbor = data[Math.min(sourceIndex + 2, data.length - 1)] / 255;
            level = Math.max(0.1, raw * 0.8 + neighbor * 0.2);
          } else {
            level = 0.18 + Math.abs(Math.sin(time / 360 + index * 0.44)) * 0.5;
          }
        } else {
          level = 0.1 + Math.abs(Math.sin(time / 900 + index * 0.35)) * 0.12;
        }

        const barHeight = Math.max(3, level * heightPx * 0.92);
        const x = index * (barWidth + gap);
        const y = mid - barHeight / 2;
        context.globalAlpha = active ? 0.5 + level * 0.5 : 0.38;
        context.fillStyle = color;
        context.beginPath();
        const radius = Math.min(barWidth / 2, 2.5);
        context.roundRect(x, y, barWidth, barHeight, radius);
        context.fill();
      }
      context.globalAlpha = 1;
      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
    };
  }, [analyser, active, bars, color]);

  return (
    <canvas
      ref={canvasRef}
      className={`waveform ${className}`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
