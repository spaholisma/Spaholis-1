import { supabase } from "@/integrations/supabase/client";

/**
 * Downscale a large raster image (max 2000px on the long edge) and re-encode as
 * JPEG so heavy camera/stock photos upload quickly. Returns a new File; throws
 * if the browser can't decode the source.
 */
export async function compressImage(file: File, maxDim = 2000, quality = 0.82): Promise<File> {
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
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("encode error");
  if (blob.size >= file.size) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export interface UploadResult {
  url: string;
  savedPct: number;
}

/**
 * Validate, auto-optimize (raster > 1MB) and upload an image to the public
 * `content-images` bucket. Returns the public URL. Throws on invalid/too-large.
 */
export async function uploadContentImage(file: File): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) throw new Error("Please select an image file");
  if (file.size > 40 * 1024 * 1024) throw new Error("Image is too large (over 40MB). Please choose a smaller file.");

  let upload = file;
  const raster = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (raster && file.size > 1_000_000) {
    try {
      upload = await compressImage(file);
    } catch {
      upload = file;
    }
  }

  const ext = upload.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "jpg");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from("content-images").upload(path, upload, { upsert: true, contentType: upload.type });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(path);
  const savedPct = file.size > 0 ? Math.round((1 - upload.size / file.size) * 100) : 0;
  return { url: urlData.publicUrl, savedPct: upload !== file ? savedPct : 0 };
}
