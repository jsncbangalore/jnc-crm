import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrandingSettings } from '../types';
import { brandingApi, resolveFileUrl } from '../services/api';
import { useAuth } from './AuthContext';
import { getProductName, getProductLogoUrl } from '../config/brand';

const BRANDING_STORAGE_KEY = 'app_branding';

const getDefaultBranding = (): BrandingSettings => ({
  companyDisplayName: getProductName(),
  companyPhone: '',
  companyLogoUrl: getProductLogoUrl(),
});

interface BrandingContextType {
  branding: BrandingSettings;
  loading: boolean;
  refreshBranding: () => Promise<void>;
  updateBranding: (updated: Partial<BrandingSettings>) => Promise<BrandingSettings>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: getDefaultBranding(),
  loading: false,
  refreshBranding: async () => {},
  updateBranding: async () => getDefaultBranding(),
});

const sanitizeCompanyLogo = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return getProductLogoUrl();
  if (url.startsWith('data:') || url.length > 500) return getProductLogoUrl();
  const resolved = resolveFileUrl(url);
  if (!resolved || resolved.startsWith('data:') || resolved.length > 500) return getProductLogoUrl();
  return resolved;
};

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    try {
      const cached = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.companyLogoUrl?.startsWith('data:')) {
          localStorage.removeItem(BRANDING_STORAGE_KEY);
        } else if (parsed.companyLogoUrl && !parsed.companyLogoUrl.includes('/settings/branding/logo')) {
          return {
            ...parsed,
            companyLogoUrl: sanitizeCompanyLogo(parsed.companyLogoUrl),
          };
        }
      }
    } catch {}
    return getDefaultBranding();
  });
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    try {
      const activeTenantId = user?.tenantId || user?.tenant?.id;
      const { data } = await brandingApi.get(activeTenantId || undefined);
      if (data && data.companyDisplayName) {
        const resolvedLogo = sanitizeCompanyLogo(data.companyLogoUrl);
        const brandObj: BrandingSettings = {
          companyDisplayName: data.companyDisplayName || getDefaultBranding().companyDisplayName,
          companyPhone: data.companyPhone || '',
          companyLogoUrl: resolvedLogo,
        };
        setBranding(brandObj);
        localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(brandObj));
      }
    } catch (err) {
      console.warn('Failed to load branding from API, using default branding', err);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, user?.tenant?.id]);

  useEffect(() => {
    if (user?.tenant?.name) {
      const resolvedLogo = sanitizeCompanyLogo(user.tenant.logoUrl);
      const brandObj: BrandingSettings = {
        companyDisplayName: user.tenant.name,
        companyPhone: user.tenant.phone || '',
        companyLogoUrl: resolvedLogo,
      };
      setBranding(brandObj);
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(brandObj));
    }
    refreshBranding();
  }, [user?.tenant?.name, user?.tenant?.phone, user?.tenant?.logoUrl, refreshBranding]);

  const updateBranding = async (dto: Partial<BrandingSettings>): Promise<BrandingSettings> => {
    const { data } = await brandingApi.update(dto);
    const resolvedLogo = sanitizeCompanyLogo(data.companyLogoUrl);
    const newBranding: BrandingSettings = {
      companyDisplayName: data.companyDisplayName || getDefaultBranding().companyDisplayName,
      companyPhone: data.companyPhone || '',
      companyLogoUrl: resolvedLogo,
    };
    setBranding(newBranding);
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(newBranding));
    return newBranding;
  };

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => useContext(BrandingContext);
