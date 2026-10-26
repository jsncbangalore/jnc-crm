import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { BrandingSettings } from '../types';
import { brandingApi, resolveFileUrl } from '../services/api';
import { useAuth } from './AuthContext';
import { getProductName, getProductLogoUrl } from '../config/brand';

const BRANDING_STORAGE_KEY = 'app_branding';

export const getDefaultBranding = (): BrandingSettings => ({
  companyDisplayName: getProductName(),
  companyPhone: '',
  companyLogoUrl: getProductLogoUrl(),
  portalLogoUrl: null,
});

export const resetBrandingCache = () => {
  try {
    localStorage.removeItem(BRANDING_STORAGE_KEY);
    sessionStorage.removeItem(BRANDING_STORAGE_KEY);
    sessionStorage.removeItem('last_company_code');
    sessionStorage.removeItem('remembered_tenant_id');
  } catch {}
};

interface BrandingContextType {
  branding: BrandingSettings;
  loading: boolean;
  refreshBranding: () => Promise<void>;
  updateBranding: (updated: Partial<BrandingSettings>) => Promise<BrandingSettings>;
  resetBranding: () => void;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: getDefaultBranding(),
  loading: false,
  refreshBranding: async () => {},
  updateBranding: async () => getDefaultBranding(),
  resetBranding: () => {},
});

const sanitizeCompanyLogo = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return getProductLogoUrl();
  if (url.startsWith('data:image/')) return url;
  const resolved = resolveFileUrl(url);
  if (!resolved) return getProductLogoUrl();
  return resolved;
};

const sanitizePortalLogo = (url?: string | null): string | null => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:image/')) return url;
  const resolved = resolveFileUrl(url);
  if (!resolved) return null;
  return resolved;
};

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const prevTenantIdRef = useRef<string | undefined>(user?.tenantId);

  const [branding, setBranding] = useState<BrandingSettings>(() => {
    try {
      const cached = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.companyLogoUrl) {
          return {
            ...parsed,
            companyLogoUrl: sanitizeCompanyLogo(parsed.companyLogoUrl),
            portalLogoUrl: sanitizePortalLogo(parsed.portalLogoUrl),
          };
        }
      }
    } catch {}
    return getDefaultBranding();
  });
  const [loading, setLoading] = useState(true);

  const resetBranding = useCallback(() => {
    resetBrandingCache();
    setBranding(getDefaultBranding());
  }, []);

  const refreshBranding = useCallback(async () => {
    try {
      const activeTenantId = user?.tenantId || user?.tenant?.id;
      if (!activeTenantId) {
        setBranding(getDefaultBranding());
        setLoading(false);
        return;
      }
      const { data } = await brandingApi.get(activeTenantId || undefined);
      if (data && data.companyDisplayName) {
        const resolvedLogo = sanitizeCompanyLogo(data.companyLogoUrl);
        const resolvedPortalLogo = sanitizePortalLogo(data.portalLogoUrl);
        const brandObj: BrandingSettings = {
          companyDisplayName: data.companyDisplayName || getDefaultBranding().companyDisplayName,
          companyPhone: data.companyPhone || '',
          companyLogoUrl: resolvedLogo,
          portalLogoUrl: resolvedPortalLogo,
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
    const currentTenantId = user?.tenantId || user?.tenant?.id;
    // If tenant changed or user logged out, clear cache
    if (prevTenantIdRef.current && prevTenantIdRef.current !== currentTenantId) {
      resetBrandingCache();
      setBranding(getDefaultBranding());
    }
    prevTenantIdRef.current = currentTenantId;

    if (!user) {
      resetBrandingCache();
      setBranding(getDefaultBranding());
      setLoading(false);
      return;
    }

    if (user?.tenant?.name) {
      const resolvedLogo = sanitizeCompanyLogo(user.tenant.logoUrl);
      const resolvedPortalLogo = sanitizePortalLogo((user.tenant as any).portalLogoUrl);
      const brandObj: BrandingSettings = {
        companyDisplayName: user.tenant.name,
        companyPhone: user.tenant.phone || '',
        companyLogoUrl: resolvedLogo,
        portalLogoUrl: resolvedPortalLogo,
      };
      setBranding(brandObj);
      localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(brandObj));
    }
    refreshBranding();
  }, [user, user?.tenant?.name, user?.tenant?.phone, user?.tenant?.logoUrl, refreshBranding]);

  const updateBranding = async (dto: Partial<BrandingSettings>): Promise<BrandingSettings> => {
    const { data } = await brandingApi.update(dto);
    const resolvedLogo = sanitizeCompanyLogo(data.companyLogoUrl);
    const resolvedPortalLogo = sanitizePortalLogo(data.portalLogoUrl);
    const newBranding: BrandingSettings = {
      companyDisplayName: data.companyDisplayName || getDefaultBranding().companyDisplayName,
      companyPhone: data.companyPhone || '',
      companyLogoUrl: resolvedLogo,
      portalLogoUrl: resolvedPortalLogo,
    };
    setBranding(newBranding);
    localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(newBranding));
    return newBranding;
  };

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding, updateBranding, resetBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => useContext(BrandingContext);
