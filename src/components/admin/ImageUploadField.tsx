import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { uploadContentImage } from "@/lib/uploadImage";

interface ImageUploadFieldProps {
  fieldId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ImageUploadField({ fieldId, label, value, onChange }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { url, savedPct } = await uploadContentImage(file);
      onChange(url);
      toast.success(savedPct > 0 ? `Image uploaded — optimized ${savedPct}% smaller` : "Image uploaded!");
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
