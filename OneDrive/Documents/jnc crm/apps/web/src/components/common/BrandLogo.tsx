import React, { useState } from 'react';
import { useBranding } from '../../contexts/BrandingContext';
import { BRAND_ASSETS, getProductName } from '../../config/brand';

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
  productOnly = false,
}) => {
  const { branding } = useBranding();
  const [imgError, setImgError] = useState(false);

  // If productOnly is set (e.g. on AuthLayout pre-login screens), NEVER use tenant/cached branding
  const customLogoUrl = productOnly ? null : branding.companyLogoUrl;
  const displayName = productOnly ? getProductName() : (branding.companyDisplayName || getProductName());

  // Determine fallback image from build-time brand config
  const defaultLogoSrc = variant === 'icon' || !showText
    ? BRAND_ASSETS.logoIcon
    : reversed
      ? BRAND_ASSETS.logoDark
      : BRAND_ASSETS.logoLight;

  const logoSrc = customLogoUrl && !imgError ? customLogoUrl : defaultLogoSrc;

  // If no logo image or image error in productOnly mode, render product name as text
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
