import React, { useState } from 'react';
import { useBranding } from '../../contexts/BrandingContext';
import { BRAND_ASSETS } from '../../config/brand';

export interface BrandLogoProps {
  size?: number;
  reversed?: boolean;
  className?: string;
  showText?: boolean;
  variant?: 'full' | 'icon';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 36,
  reversed = false,
  className = '',
  showText = true,
  variant = 'full',
}) => {
  const { branding } = useBranding();
  const [imgError, setImgError] = useState(false);
  const customLogoUrl = branding.companyLogoUrl;
  const displayName = branding.companyDisplayName || 'CRM';

  // Determine fallback image based on variant and reversed (dark/light)
  const defaultLogoSrc = variant === 'icon' || !showText
    ? BRAND_ASSETS.logoIcon
    : reversed
      ? BRAND_ASSETS.logoDark
      : BRAND_ASSETS.logoLight;

  const logoSrc = customLogoUrl && !imgError ? customLogoUrl : defaultLogoSrc;

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
