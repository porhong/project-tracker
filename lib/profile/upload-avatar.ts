import { FunctionsHttpError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type AvatarUploadResult = { path: string } | { error: string };

const GENERIC_ERROR = "Could not upload profile photo. Please try again.";

// The Edge Function decodes the image to raw pixels to resize/re-encode it,
// which briefly needs ~4 bytes per pixel. A full-resolution phone photo
// (e.g. 4032x3024 ~= 12MP) blows past the function's 256MB memory limit on
// its own, before any resize logic even runs. Shrinking client-side first
// -- cheap here, since the browser already has to decode the file for the
// preview -- keeps the server-side decode comfortably within budget
// regardless of what the original camera produced.
const CLIENT_PRESCALE_MAX_DIMENSION = 1200;
const CLIENT_PRESCALE_QUALITY = 0.9;

async function prescaleIfLarge(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: "from-image" applies EXIF rotation so the canvas
    // (and everything downstream) sees already-upright pixels.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, CLIENT_PRESCALE_MAX_DIMENSION / Math.max(width, height));
  if (scale >= 1) {
    bitmap.close();
    return file;
  }

  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CLIENT_PRESCALE_QUALITY),
  );
  return blob ?? file;
}

/**
 * Uploads a profile photo via the `process-avatar` Edge Function, which
 * resizes, strips metadata, and re-encodes it as WebP server-side before
 * storing it. Pass `targetUserId` when an admin is uploading on behalf of
 * another user; Storage RLS is what actually authorizes that.
 */
export async function uploadAvatar(
  file: File,
  targetUserId?: string,
): Promise<AvatarUploadResult> {
  const prepared = await prescaleIfLarge(file);
  const body = new FormData();
  body.append("file", prepared, "avatar");
  if (targetUserId) body.append("userId", targetUserId);

  const { data, error } = await createClient().functions.invoke<{ path: string }>(
    "process-avatar",
    { body },
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      if (payload?.error) return { error: payload.error };
    }
    return { error: GENERIC_ERROR };
  }
  if (!data?.path) return { error: GENERIC_ERROR };

  return { path: data.path };
}
