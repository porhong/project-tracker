// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { decode as decodeJpeg } from "@jsquash/jpeg";
import { decode as decodePng } from "@jsquash/png";
import { decode as decodeWebp, encode as encodeWebp } from "@jsquash/webp";
import resize from "@jsquash/resize";

// magick-wasm was tried first (Supabase's documented example library) but its
// ~14MB WASM binary blows the platform's 2s-per-request CPU-time budget on
// anything but a trivial input (https://supabase.com/docs/guides/functions/limits).
// jSquash's per-format codecs are ~1-2MB combined and purpose-built for this
// decode -> resize -> encode pipeline, so they fit comfortably.

const AVATAR_BUCKET = "avatars";
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 320;
const WEBP_QUALITY = 82;
// Guards against a small file that decompresses into a huge bitmap. The
// client pre-shrinks to at most 1200x1200 (1.44MP) before upload, so this
// leaves headroom for that while still rejecting inputs large enough to trip
// the function's 256MB memory limit during decode (empirically, decoding a
// 4032x3024 / 12.2MP photo alone exceeds it).
const MAX_PIXELS = 4_000_000;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

function sniffFormat(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

// Fits within MAX_DIMENSION x MAX_DIMENSION preserving aspect ratio; never
// upscales an already-smaller image.
function targetDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Authenticated endpoint, so deploy with verify_jwt = true (see config.toml).
export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const callerId = ctx.userClaims?.id;
    if (!callerId) return fail(401, "Not authenticated.");

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail(400, "Expected multipart form data.");
    }

    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return fail(400, "A profile photo file is required.");
    }
    if (file.size > MAX_INPUT_BYTES) {
      return fail(400, "Profile photos must be 5 MB or smaller.");
    }

    // An admin may upload on behalf of another user; Storage RLS below is the
    // real authority on whether that's allowed, this only picks the target
    // folder.
    const requestedUserId = formData.get("userId");
    const targetUserId =
      typeof requestedUserId === "string" && requestedUserId ? requestedUserId : callerId;

    const inputBuffer = await file.arrayBuffer();
    const format = sniffFormat(new Uint8Array(inputBuffer));
    if (!format) {
      return fail(400, "Choose a JPEG, PNG, or WebP image.");
    }

    let image: ImageData;
    try {
      if (format === "jpeg") {
        // preserveOrientation respects EXIF rotation from phone cameras.
        image = await decodeJpeg(inputBuffer, { preserveOrientation: true });
      } else if (format === "png") {
        image = (await decodePng(inputBuffer)) as ImageData;
      } else {
        image = await decodeWebp(inputBuffer);
      }
    } catch {
      return fail(400, "Could not read that image. It may be corrupted.");
    }

    if (image.width * image.height > MAX_PIXELS) {
      return fail(400, "That image is too large to process.");
    }

    const { width, height } = targetDimensions(image.width, image.height);
    if (width !== image.width || height !== image.height) {
      image = await resize(image, { width, height });
    }

    let webpBuffer: ArrayBuffer;
    try {
      // Encoding from raw pixel data naturally drops any source EXIF/GPS
      // metadata -- nothing from the original file carries over.
      webpBuffer = await encodeWebp(image, { quality: WEBP_QUALITY });
    } catch {
      return fail(500, "Could not encode the profile photo.");
    }

    const path = `${targetUserId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await ctx.supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, new Uint8Array(webpBuffer), { contentType: "image/webp", upsert: false });

    if (uploadError) {
      return fail(403, `Could not save the profile photo: ${uploadError.message}`);
    }

    return Response.json({ path });
  }),
};

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/process-avatar' \
    --header 'Authorization: Bearer <user-jwt>' \
    --header 'apiKey: <publishable-key>' \
    -F 'file=@/path/to/photo.jpg'

*/
