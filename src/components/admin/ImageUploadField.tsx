import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageUploadFieldProps {
  fieldId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Downscale a large raster image (max 2000px on the long edge) and re-encode as
 * JPEG so heavy camera/stock photos upload quickly. Returns a new File; throws
 * if the browser can't decode the source.
 */
async function compressImage(file: File, maxDim = 2000, quality = 0.82): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("read error"));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode error"));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  // White matte so PNG transparency doesn't turn black when flattened to JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("encode error");
  // If compression somehow made it bigger (rare), keep the original.
  if (blob.size >= file.size) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export function ImageUploadField({ fieldId, label, value, onChange }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    // Guardrail on the raw input; heavy photos get compressed below.
    if (file.size > 40 * 1024 * 1024) {
      toast.error("Image is too large (over 40MB). Please choose a smaller file.");
      return;
    }

    setUploading(true);
    try {
      // Auto-optimize heavy raster photos (downscale + re-encode) so large
      // camera/stock images just work. SVG/GIF are uploaded as-is.
      let upload = file;
      const raster = /^image\/(jpeg|png|webp)$/.test(file.type);
      if (raster && file.size > 1_000_000) {
        try {
          upload = await compressImage(file);
        } catch {
          upload = file; // fall back to the original if the browser can't decode it
        }
      }

      const ext = upload.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg");
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("content-images")
        .upload(path, upload, { upsert: true, contentType: upload.type });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from("content-images")
        .getPublicUrl(path);

      onChange(urlData.publicUrl);
      const savedPct = file.size > 0 ? Math.round((1 - upload.size / file.size) * 100) : 0;
      toast.success(upload !== file && savedPct > 0 ? `Image uploaded — optimized ${savedPct}% smaller` : "Image uploaded!");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }, []);

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId} className="text-sm font-medium capitalize flex items-center gap-1.5">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="font-mono text-sm flex-1"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="shrink-0"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="shrink-0 text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-colors cursor-pointer max-w-xs",
          dragging
            ? "border-primary bg-primary/5"
            : value
              ? "border-border bg-muted/30"
              : "border-muted-foreground/25 bg-muted/10 hover:border-muted-foreground/40"
        )}
      >
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 rounded-lg z-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {value ? (
          <img
            src={value}
            alt={label}
            className="w-full h-32 object-cover rounded-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
            <Upload className="h-6 w-6 text-muted-foreground/50 mb-1.5" />
            <p className="text-xs text-muted-foreground">
              {dragging ? "Drop image here" : "Drag & drop or click to upload"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
