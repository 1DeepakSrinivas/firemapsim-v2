import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoMarkIconProps = {
  className?: string;
  alt?: string;
};

export function LogoMarkIcon({ className, alt = "FireMapSim-v2" }: LogoMarkIconProps) {
  return (
    <Image
      src="/icons/logo.svg"
      alt={alt}
      width={512}
      height={512}
      className={cn("shrink-0 dark:invert", className)}
      priority={false}
    />
  );
}

