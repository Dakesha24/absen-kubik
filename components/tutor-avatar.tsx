import Image from "next/image";
import { tutorPhotoFor } from "@/lib/tutor-photos";

type TutorAvatarProps = {
  name: string;
  size: number;
  className: string;
  priority?: boolean;
};

export default function TutorAvatar({ name, size, className, priority = false }: TutorAvatarProps) {
  const photo = tutorPhotoFor(name);
  if (!photo) {
    return <span className={className} aria-label={`Inisial ${name}`}>
      {name.trim().charAt(0).toLocaleUpperCase("id-ID") || "T"}
    </span>;
  }

  return <Image
    className={className}
    src={photo}
    alt={`Foto ${name}`}
    width={size}
    height={size}
    sizes={`${size}px`}
    priority={priority}
  />;
}
