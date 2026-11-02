import { useEffect, useRef, useState } from "react";
import { Crop, Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { readableError } from "@/lib/errors";
import { toast } from "sonner";

function clamp(value: number, min = -100, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export function ImageCropDialog({
  file,
  title,
  aspect,
  outputWidth,
  outputHeight,
  rounded = false,
  onCancel,
  onComplete,
}: {
  file: File;
  title: string;
  aspect: number;
  outputWidth: number;
  outputHeight: number;
  rounded?: boolean;
  onCancel: () => void;
  onComplete: (file: File) => Promise<void> | void;
}) {
  const [sourceUrl] = useState(() => URL.createObjectURL(file));
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [busy, setBusy] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl]);

  const crop = async () => {
    const image = imageRef.current;
    if (!image || !image.naturalWidth || !image.naturalHeight) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not crop this image.");

      const coverScale = Math.max(
        outputWidth / image.naturalWidth,
        outputHeight / image.naturalHeight,
      );
      const scale = coverScale * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const maxShiftX = Math.max(0, (width - outputWidth) / 2);
      const maxShiftY = Math.max(0, (height - outputHeight) / 2);
      const x = (outputWidth - width) / 2 + (offsetX / 100) * maxShiftX;
      const y = (outputHeight - height) / 2 + (offsetY / 100) * maxShiftY;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, x, y, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("Image crop failed.")),
          "image/webp",
          0.92,
        );
      });
      const name = `${file.name.replace(/\.[^.]+$/, "")}-cropped.webp`;
      await onComplete(new File([blob], name, { type: "image/webp" }));
    } catch (error) {
      toast.error(readableError(error, "Could not crop that image."));
    } finally {
      setBusy(false);
    }
  };

  const uploadOriginal = async () => {
    setBusy(true);
    try {
      await onComplete(file);
    } catch (error) {
      toast.error(readableError(error, "Could not use that image."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Drag the image and adjust the zoom before uploading it.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div
            className={cn(
              "relative mx-auto w-full max-w-xl touch-none cursor-grab overflow-hidden border border-border bg-black/70 active:cursor-grabbing",
              rounded ? "rounded-full" : "rounded-xl",
            )}
            style={{
              aspectRatio: aspect,
              maxWidth: aspect <= 1 ? "min(36rem, 52vh)" : "36rem",
            }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = {
                x: event.clientX,
                y: event.clientY,
                offsetX,
                offsetY,
              };
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setOffsetX(
                clamp(
                  drag.offsetX + ((event.clientX - drag.x) / rect.width) * 200,
                ),
              );
              setOffsetY(
                clamp(
                  drag.offsetY + ((event.clientY - drag.y) / rect.height) * 200,
                ),
              );
            }}
            onPointerUp={() => {
              dragRef.current = null;
            }}
          >
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Crop preview"
              className="pointer-events-none absolute left-1/2 top-1/2 size-full select-none object-cover"
              style={{
                transform: `translate(-50%, -50%) translate(${offsetX / 2}%, ${offsetY / 2}%) scale(${zoom})`,
              }}
            />
            <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/25" />
            <span className="pointer-events-none absolute inset-1/3 border border-dashed border-white/45" />
          </div>

          <div className="grid gap-4 rounded-xl border border-border/70 bg-surface p-4">
            <label className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-sm">
              <span>Zoom</span>
              <Slider
                min={100}
                max={300}
                step={5}
                value={[Math.round(zoom * 100)]}
                onValueChange={(values) => setZoom((values[0] ?? 100) / 100)}
              />
              <span className="text-right text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </label>
            <label className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-sm">
              <span>Horizontal</span>
              <Slider
                min={-100}
                max={100}
                step={1}
                value={[offsetX]}
                onValueChange={(values) => setOffsetX(values[0] ?? 0)}
              />
              <span className="text-right text-xs text-muted-foreground">
                {Math.round(offsetX)}
              </span>
            </label>
            <label className="grid grid-cols-[5rem_1fr_3rem] items-center gap-3 text-sm">
              <span>Vertical</span>
              <Slider
                min={-100}
                max={100}
                step={1}
                value={[offsetY]}
                onValueChange={(values) => setOffsetY(values[0] ?? 0)}
              />
              <span className="text-right text-xs text-muted-foreground">
                {Math.round(offsetY)}
              </span>
            </label>
          </div>

          {(file.type === "image/gif" || file.type === "image/apng") && (
            <p className="text-xs text-warning">
              Cropping exports a high-quality static WebP. Choose “Use original”
              to keep this image animated.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void uploadOriginal()}
          >
            Use original
          </Button>
          <Button type="button" disabled={busy} onClick={() => void crop()}>
            {busy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Crop className="mr-1.5 size-4" />
            )}
            Crop and use
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
