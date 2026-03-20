'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

interface CameraCaptureModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCapture: (file: File) => void;
}

export function CameraCaptureModal({ open, onOpenChange, onCapture }: CameraCaptureModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [currentDeviceId, setCurrentDeviceId] = useState<string>('');
    const [isCapturing, setIsCapturing] = useState(false);

    // Initialize camera
    const startCamera = useCallback(async (deviceId?: string) => {
        if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost') {
            const msg = "La cámara requiere conexión segura (HTTPS) o Localhost.";
            console.error(msg, window.location.href);
            toast.error(msg);
            setHasPermission(false);
            return;
        }

        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            let stream: MediaStream;

            try {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const constraints: MediaStreamConstraints = {
                    video: deviceId
                        ? { deviceId: { exact: deviceId } }
                        : (isMobile ? { facingMode: 'environment' } : true)
                };
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.warn("Retrying with generic video constraints...", err);
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
            }

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            streamRef.current = stream;
            setHasPermission(true);

            // Enumerate devices for switching
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setDevices(videoDevices);

            // Set current device if not set, or update
            if (!deviceId) {
                const track = stream.getVideoTracks()[0];
                const settings = track.getSettings();
                if (settings.deviceId) {
                    setCurrentDeviceId(settings.deviceId);
                }
            } else {
                setCurrentDeviceId(deviceId);
            }

        } catch (err: unknown) {
            console.error("Camera Error:", err);
            setHasPermission(false);
            const errorName = err instanceof Error ? err.name : '';
            const errorMessage = err instanceof Error ? err.message : 'Unknown camera error';
            if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
                toast.error("Acceso denegado por el Sistema. Verifica: Preferencias del Sistema (Mac) -> Privacidad y Seguridad -> Cámara -> Permite tu navegador.");
            } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
                toast.error("No se detectó ninguna cámara conectada.");
            } else {
                toast.error(`Error al acceder a la cámara: ${errorName || errorMessage}`);
            }
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (open) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [open, startCamera, stopCamera]);

    const handleSwitchCamera = () => {
        if (devices.length < 2) return;
        const currentIndex = devices.findIndex(d => d.deviceId === currentDeviceId);
        const nextIndex = (currentIndex + 1) % devices.length;
        const nextDevice = devices[nextIndex];
        startCamera(nextDevice.deviceId);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current || !streamRef.current) return;
        setIsCapturing(true);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw video frame to canvas
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to blob/file
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
                    onCapture(file);
                    onOpenChange(false);
                }
                setIsCapturing(false);
            }, 'image/jpeg', 0.85);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-black border-none text-white h-[80vh] sm:h-auto flex flex-col">
                <DialogHeader className="p-4 bg-transparent absolute top-0 left-0 right-0 z-10 flex flex-row items-center justify-between">
                    <DialogTitle className="text-white drop-shadow-md">Camera</DialogTitle>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 rounded-full h-8 w-8"
                        onClick={() => onOpenChange(false)}
                    >
                        <X className="h-5 w-5" />
                    </Button>
                </DialogHeader>

                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                    {hasPermission === false ? (
                        <div className="text-center p-6 space-y-4">
                            <Camera className="h-12 w-12 mx-auto opacity-50" />
                            <p>Camera access denied or unavailable.</p>
                            <Button onClick={() => startCamera()} variant="outline" className="bg-white/10 border-white/20">
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="p-6 bg-black/80 backdrop-blur-sm flex items-center justify-between">
                    <div className="w-10">
                        {/* Placeholder for balance */}
                    </div>

                    <Button
                        size="icon"
                        className="h-16 w-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 transition-all active:scale-95 ring-2 ring-offset-2 ring-offset-black ring-white"
                        onClick={capturePhoto}
                        disabled={isCapturing || !hasPermission}
                    >
                        <div className="h-12 w-12 rounded-full bg-white" />
                    </Button>

                    <div className="w-10 flex justify-center">
                        {devices.length > 1 && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-white hover:bg-white/20 rounded-full"
                                onClick={handleSwitchCamera}
                            >
                                <RefreshCw className="h-6 w-6" />
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
