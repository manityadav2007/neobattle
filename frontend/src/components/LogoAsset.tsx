'use client';

interface LogoAssetProps {
  className?: string;
}

export default function LogoAsset({ className = '' }: LogoAssetProps) {
  return (
    <img
      src="/logo/image_21332e.jpg"
      alt="NEOBATTLE"
      className={`mix-blend-screen object-contain ${className}`}
    />
  );
}
