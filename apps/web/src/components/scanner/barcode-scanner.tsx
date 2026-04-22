"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, Keyboard, RotateCcw, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ScannerProps = {
  value?: string;
  onResult: (serial: string) => void;
};

type ZxingControls = {
  stop: () => void;
  switchTorch?: (onOff: boolean) => Promise<void>;
};

export function BarcodeScanner({ value, onResult }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ZxingControls | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<"manual" | "camera">("manual");
  const [message, setMessage] = useState("Manual entry is always available.");
  const [manual, setManual] = useState(value ?? "");
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;

    async function startScanner() {
      setIsStarting(true);
      setMessage("Starting camera. Allow camera access if prompted.");
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library")
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.TRY_HARDER, true);
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417
        ]);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 500
        });

        if (!videoRef.current || cancelled) return;

        let controls: ZxingControls;
        try {
          controls = await reader.decodeFromConstraints(
            {
              video: {
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 }
              },
              audio: false
            },
            videoRef.current,
            (result, _error, activeControls) => {
              if (!result) return;
              const scanned = normalizeSerialFromScan(result.getText());
              if (!scanned) return;
              activeControls.stop();
              controlsRef.current = null;
              setIsScanning(false);
              setMode("manual");
              setLastScan(scanned);
              setManual(scanned);
              setMessage(`Scanned ${scanned}. Review before saving.`);
              onResult(scanned);
            }
          );
        } catch {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          const rearCamera = devices.find((device) => /back|rear|environment/i.test(device.label));
          const cameraId = rearCamera?.deviceId ?? devices[0]?.deviceId;
          if (!cameraId) {
            setMessage("No camera was found. Check browser camera permission, then try Scan again.");
            setMode("manual");
            return;
          }
          controls = await reader.decodeFromVideoDevice(cameraId, videoRef.current, (result, _error, activeControls) => {
            if (!result) return;
            const scanned = normalizeSerialFromScan(result.getText());
            if (!scanned) return;
            activeControls.stop();
            controlsRef.current = null;
            setIsScanning(false);
            setMode("manual");
            setLastScan(scanned);
            setManual(scanned);
            setMessage(`Scanned ${scanned}. Review before saving.`);
            onResult(scanned);
          });
        }

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setTorchAvailable(Boolean(controls.switchTorch));
        setIsScanning(true);
        setMessage("Camera ready. Fill the box with the barcode bars.");
      } catch {
        setMessage("Camera scanner could not start. Use Photo or enter the serial manually.");
        setMode("manual");
      } finally {
        setIsStarting(false);
      }
    }

    startScanner();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      setIsScanning(false);
      setTorchOn(false);
      setTorchAvailable(false);
    };
  }, [mode, onResult]);

  async function scanFile(file: File | undefined) {
    if (!file) return;
    setMessage("Scanning photo with ZXing...");
    const imageUrl = URL.createObjectURL(file);
    try {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library")
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODABAR,
        BarcodeFormat.ITF,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.PDF_417
      ]);
      const reader = new BrowserMultiFormatReader(hints);
      const scanned = normalizeSerialFromScan((await reader.decodeFromImageUrl(imageUrl)).getText());
      setLastScan(scanned);
      setManual(scanned);
      setMessage(`Scanned ${scanned}. Review before saving.`);
      onResult(scanned);
    } catch {
      setMessage("Could not read a barcode from that photo. Try closer, brighter, and fill the photo with the barcode.");
    } finally {
      URL.revokeObjectURL(imageUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function toggleTorch() {
    if (!controlsRef.current?.switchTorch) return;
    const next = !torchOn;
    try {
      await controlsRef.current.switchTorch(next);
      setTorchOn(next);
    } catch {
      setMessage("Torch is not available in this browser.");
      setTorchAvailable(false);
    }
  }

  function updateManual(serial: string) {
    setManual(serial);
    onResult(serial);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setMode("camera")} disabled={isStarting || isScanning}>
          <Camera className="h-4 w-4" />
          {isStarting ? "Starting" : isScanning ? "Scanning" : "Scan"}
        </Button>
        <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setMode("manual")}>
          <Keyboard className="h-4 w-4" />
          Manual
        </Button>
        <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => setMode("camera")} disabled={isStarting}>
          <RotateCcw className="h-4 w-4" />
          Rescan
        </Button>
        <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          Photo
        </Button>
        {torchAvailable ? (
          <Button type="button" className="bg-secondary text-secondary-foreground hover:bg-secondary/80" onClick={toggleTorch}>
            <Zap className="h-4 w-4" />
            {torchOn ? "Torch off" : "Torch"}
          </Button>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => scanFile(event.target.files?.[0])}
      />
      <div className={mode === "camera" ? "block" : "hidden"}>
        <div className="relative overflow-hidden rounded-md border border-border bg-black">
          <video ref={videoRef} className="h-72 w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-[7%] top-1/2 h-28 -translate-y-1/2 rounded-md border-2 border-primary/90 shadow-[0_0_0_999px_rgba(0,0,0,0.28)]" />
          <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-0.5 -translate-y-1/2 bg-primary/90 shadow-sm" />
        </div>
      </div>
      {lastScan ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          Last scan: <span className="font-mono">{lastScan}</span>
        </div>
      ) : null}
      <Input
        value={manual}
        placeholder="Enter or scan serial number"
        onChange={(event) => updateManual(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        Tip: barcode scanning reads the encoded barcode value. For standard labels, that matches the printed serial text underneath.
      </p>
    </div>
  );
}

function normalizeSerialFromScan(raw: string) {
  let value = raw.trim().replace(/[\u0000-\u001F\u007F]/g, "");
  try {
    const url = new URL(value);
    value = url.searchParams.get("serial") || url.searchParams.get("sn") || url.searchParams.get("s") || value;
  } catch {
    // Plain serial values are expected; URLs are only a convenience cleanup.
  }
  value = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
  value = value
    .replace(/^serial(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*/i, "")
    .replace(/^s\/?n\s*[:#-]?\s*/i, "")
    .replace(/^asset\s*(?:tag)?\s*[:#-]?\s*/i, "")
    .replace(/^id\s*[:#-]?\s*/i, "")
    .trim();
  return value.match(/[A-Za-z0-9]/) ? value : "";
}
