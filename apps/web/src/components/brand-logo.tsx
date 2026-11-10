import Image from "next/image";

interface BrandLogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export function BrandLogo({ size = 28, className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/squeez-logo.png"
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={className}
      aria-hidden="true"
    />
  );
}
