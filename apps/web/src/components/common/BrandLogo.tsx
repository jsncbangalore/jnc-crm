import React, { useState } from 'react';
import { BRAND_ASSETS, PRODUCT_NAME } from '../../config/brand';

export interface BrandLogoProps {
  size?: number;
  reversed?: boolean;
  className?: string;
  showText?: boolean;
  variant?: 'full' | 'icon';
  productOnly?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 36,
  reversed = false,
  className = '',
  showText = true,
  variant = 'full',
}) => {
  const [imgError, setImgError] = useState(false);

  // Permanent brand - NEVER overridden by tenant or dynamic settings
  const displayName = PRODUCT_NAME;

  // Permanent logo image from static brand assets
  const logoSrc = variant === 'icon' || !showText
    ? BRAND_ASSETS.logoIcon
    : reversed
      ? BRAND_ASSETS.logoDark
      : BRAND_ASSETS.logoLight;

  if (imgError || !logoSrc) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        <span className={`font-black tracking-tight text-base sm:text-lg ${reversed ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
          {displayName}
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={logoSrc}
        alt={displayName}
        data-testid="brand-logo-img"
        style={{
          height: `${size}px`,
          width: 'auto',
          maxWidth: variant === 'icon' || !showText ? `${size}px` : `${Math.round(size * 2.8)}px`,
        }}
        className="object-contain shrink-0"
        onError={() => setImgError(true)}
      />
    </div>
  );
};

export default BrandLogo;

