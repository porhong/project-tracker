import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsFor } from "@/lib/profile/avatar";

type ProfileAvatarProps = {
  name: string | null;
  email?: string;
  url?: string | null;
  size?: "sm" | "default" | "lg";
};

export function ProfileAvatar({
  name,
  email,
  url,
  size = "default",
}: ProfileAvatarProps) {
  return (
    <Avatar size={size}>
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback>{initialsFor(name, email)}</AvatarFallback>
    </Avatar>
  );
}
