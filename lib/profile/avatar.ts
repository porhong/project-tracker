export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const AVATAR_FILE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const AVATAR_ACCEPT = Object.keys(AVATAR_FILE_TYPES).join(",");

export function validateAvatarFile(file: File): string | null {
  if (!(file.type in AVATAR_FILE_TYPES)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return "Profile photos must be 5 MB or smaller.";
  }
  return null;
}

export function createAvatarPath(userId: string, file: File) {
  const extension = AVATAR_FILE_TYPES[file.type as keyof typeof AVATAR_FILE_TYPES];
  return `${userId}/${crypto.randomUUID()}.${extension}`;
}

export function isAvatarPathForUser(value: unknown, userId: string): value is string {
  if (typeof value !== "string") return false;
  const escapedUserId = userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escapedUserId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(?:jpg|png|webp)$`,
    "i",
  ).test(value);
}

export function initialsFor(name: string | null | undefined, email?: string) {
  const source = (name || email || "?").trim();
  const words = source.split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
