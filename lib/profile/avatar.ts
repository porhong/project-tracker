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

export type MemberColorVariant = {
  avatarBg: string;
  avatarText: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  ringColor: string;
};

export const MEMBER_COLOR_VARIANTS: readonly MemberColorVariant[] = [
  {
    avatarBg: "bg-muted text-primary border border-primary/20",
    avatarText: "text-primary",
    badgeBg: "bg-muted",
    badgeBorder: "border-primary/20",
    badgeText: "text-primary",
    ringColor: "ring-primary/40",
  },
  {
    avatarBg: "bg-muted text-chart-2 border border-chart-2/20",
    avatarText: "text-chart-2",
    badgeBg: "bg-muted",
    badgeBorder: "border-chart-2/20",
    badgeText: "text-chart-2",
    ringColor: "ring-chart-2/40",
  },
  {
    avatarBg: "bg-muted text-chart-3 border border-chart-3/20",
    avatarText: "text-chart-3",
    badgeBg: "bg-muted",
    badgeBorder: "border-chart-3/20",
    badgeText: "text-chart-3",
    ringColor: "ring-chart-3/40",
  },
  {
    avatarBg: "bg-muted text-chart-4 border border-chart-4/20",
    avatarText: "text-chart-4",
    badgeBg: "bg-muted",
    badgeBorder: "border-chart-4/20",
    badgeText: "text-chart-4",
    ringColor: "ring-chart-4/40",
  },
  {
    avatarBg: "bg-muted text-chart-5 border border-chart-5/20",
    avatarText: "text-chart-5",
    badgeBg: "bg-muted",
    badgeBorder: "border-chart-5/20",
    badgeText: "text-chart-5",
    ringColor: "ring-chart-5/40",
  },
  {
    avatarBg: "bg-secondary text-secondary-foreground border border-border",
    avatarText: "text-secondary-foreground",
    badgeBg: "bg-secondary",
    badgeBorder: "border-border",
    badgeText: "text-secondary-foreground",
    ringColor: "ring-border",
  },
] as const;


export function getMemberColorVariant(nameOrKey?: string | null): MemberColorVariant {
  if (!nameOrKey) return MEMBER_COLOR_VARIANTS[0];
  let hash = 0;
  for (let i = 0; i < nameOrKey.length; i++) {
    hash = (hash << 5) - hash + nameOrKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % MEMBER_COLOR_VARIANTS.length;
  return MEMBER_COLOR_VARIANTS[index];
}

