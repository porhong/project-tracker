import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getMemberColorVariant, initialsFor } from "@/lib/profile/avatar";
import { cn } from "@/lib/utils";

type ProfileAvatarProps = {
  name: string | null;
  email?: string;
  url?: string | null;
  size?: "sm" | "default" | "lg";
  className?: string;
  fallbackClassName?: string;
};

export function ProfileAvatar({
  name,
  email,
  url,
  size = "default",
  className,
  fallbackClassName,
}: ProfileAvatarProps) {
  const variant = getMemberColorVariant(name || email);
  return (
    <Avatar size={size} className={cn("bg-background", className)}>
      {url ? <AvatarImage src={url} alt={name || email || "Profile photo"} /> : null}
      <AvatarFallback
        className={cn(
          "font-semibold select-none",
          size === "sm" && "text-[10px]",
          size === "default" && "text-[11px]",
          size === "lg" && "text-xs tracking-normal",
          variant.avatarBg,
          fallbackClassName,
        )}
      >
        {initialsFor(name, email)}
      </AvatarFallback>
    </Avatar>

  );
}


