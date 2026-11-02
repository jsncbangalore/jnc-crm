import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { BrandingSettings } from '../types';
import { brandingApi, resolveFileUrl } from '../services/api';
import { useAuth } from './AuthContext';

export const getDefaultBranding = (): BrandingSettings => ({
  companyDisplayName: '',
  companyPhone: '',
  companyLogoUrl: null,
});

/**
 * Ensures legacy or foreign branding cache keys are wiped from browser storage.
 */
export const resetBrandingCache = () => {
  try {
    localStorage.removeItem('app_branding');
    sessionStorage.removeItem('app_branding');
    // Clear any legacy tenant-keyed branding
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('crm_branding_')) {
        localStorage.removeItem(key);
      }
    });
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

const sanitizeCompanyLogo = (url?: string | null): string | null => {
  if (!url || typeof url !== 'string' || url.trim() === '') return null;
  if (url.startsWith('data:image/')) return url;
  const resolved = resolveFileUrl(url);
  return resolved || null;
};

export const BrandingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const prevTenantIdRef = useRef<string | undefined>(user?.tenantId || user?.tenant?.id);

  // In-memory state only - no persistent localStorage cache
  const [branding, setBranding] = useState<BrandingSettings>(() => {
    // Proactively clear any legacy storage keys
    resetBrandingCache();
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
      const { data } = await brandingApi.get(activeTenantId);
      if (data) {
        const resolvedLogo = sanitizeCompanyLogo(data.companyLogoUrl);
        const brandObj: BrandingSettings = {
          companyDisplayName: (data.companyDisplayName || '').trim(),
          companyPhone: (data.companyPhone || '').trim(),
          companyLogoUrl: resolvedLogo,
        };
        setBranding(brandObj);
      }
    } catch (err) {
      console.warn('Failed to load branding from API', err);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId, user?.tenant?.id]);

  useEffect(() => {
    const currentTenantId = user?.tenantId || user?.tenant?.id;
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
      const brandObj: BrandingSettings = {
        companyDisplayName: user.tenant.name.trim(),
        companyPhone: (user.tenant.phone || '').trim(),
        companyLogoUrl: resolvedLogo,
      };
      setBranding(brandObj);
    }
    refreshBranding();
  }, [user, user?.tenant?.name, user?.tenant?.phone, user?.tenant?.logoUrl, refreshBranding]);

  const updateBranding = async (dto: Partial<BrandingSettings>): Promise<BrandingSettings> => {
    const { data } = await brandingApi.update(dto);
    const resolvedLogo = sanitizeCompanyLogo(dto.companyLogoUrl !== undefined ? dto.companyLogoUrl : data.companyLogoUrl);
    const newBranding: BrandingSettings = {
      companyDisplayName: (data.companyDisplayName !== undefined ? data.companyDisplayName : (dto.companyDisplayName || branding.companyDisplayName || '')).trim(),
      companyPhone: (data.companyPhone !== undefined ? data.companyPhone : (dto.companyPhone || branding.companyPhone || '')).trim(),
      companyLogoUrl: resolvedLogo,
    };
    setBranding(newBranding);
    return newBranding;
  };

  return (
    <BrandingContext.Provider value={{ branding, loading, refreshBranding, updateBranding, resetBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => useContext(BrandingContext);
