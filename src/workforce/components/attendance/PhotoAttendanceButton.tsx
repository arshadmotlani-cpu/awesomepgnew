'use client';

import { useRef, useState, useTransition } from 'react';
import { markPresentWithPhotoAction } from '@/src/workforce/actions/attendance';

type Props = {
  disabled?: boolean;
  alreadyMarked?: boolean;
};

export function PhotoAttendanceButton({ disabled, alreadyMarked }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locationHint, setLocationHint] = useState('Checking office location…');
  const [pending, startTransition] = useTransition();

  if (alreadyMarked) {
    return (
      <p className="text-sm font-medium text-emerald-400">
        ✓ Present — attendance locked for today
      </p>
    );
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }

  async function openCamera() {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera access is required to mark attendance.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setMessage('Camera access is required to mark attendance.');
    }
  }

  function captureAndSubmit() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setMessage('Could not capture photo. Please try again.');
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage('Could not capture photo. Please try again.');
          return;
        }
        stopCamera();

        if (!navigator.geolocation) {
          setMessage(
            'Location access is required to mark attendance. Please allow location access and try again.',
          );
          return;
        }

        setLocationHint('Verifying office location…');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocationHint('Submitting attendance…');
            const formData = new FormData();
            formData.set('photo', blob, 'attendance.jpg');
            formData.set('latitude', String(pos.coords.latitude));
            formData.set('longitude', String(pos.coords.longitude));
            formData.set('accuracyMetres', String(pos.coords.accuracy));

            startTransition(async () => {
              const result = await markPresentWithPhotoAction(formData);
              if (result.error) {
                setMessage(result.error);
                if (result.error.includes('not at the office')) {
                  setLocationHint('Outside office radius');
                }
              } else {
                window.location.reload();
              }
            });
          },
          () => {
            setLocationHint('Location unavailable');
            setMessage(
              'Location access is required to mark attendance. Please allow location access and try again.',
            );
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
      },
      'image/jpeg',
      0.85,
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fyh-text-secondary">Location: {locationHint}</p>

      {!cameraOpen ? (
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => void openCamera()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-fyh-accent px-4 py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          <span aria-hidden>📷</span>
          {pending ? 'Submitting…' : 'Take Photo & Mark Present'}
        </button>
      ) : (
        <div className="space-y-3">
          <video ref={videoRef} className="aspect-[3/4] w-full max-w-xs rounded-xl border border-[color:var(--fyh-border)] object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={captureAndSubmit}
              className="rounded-lg bg-fyh-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            >
              {pending ? 'Submitting…' : 'Capture & Submit'}
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="rounded-lg border border-[color:var(--fyh-border)] px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message ? <p className="text-sm text-amber-300">{message}</p> : null}
    </div>
  );
}
