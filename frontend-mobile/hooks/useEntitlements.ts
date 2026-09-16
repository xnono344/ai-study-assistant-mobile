/**
 * useEntitlements — subscription tier from RevenueCat.
 */

import { useEffect, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { getCustomerInfo, CustomerInfo, isPremium as checkPremium, isInGracePeriod as checkGrace } from '../lib/subscription';
import { api } from '../lib/api';

export interface Entitlements {
  customerInfo: CustomerInfo | null;
  isPremium: boolean;
  isInGracePeriod: boolean;
  isLoading: boolean;
  manualSync: () => Promise<void>;
}

export function useEntitlements(): Entitlements {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInfo = useCallback(async () => {
    try {
      const info = await getCustomerInfo();
      setCustomerInfo(info);
    } catch {
      setCustomerInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const manualSync = useCallback(async () => {
    if (!customerInfo) return;
    try {
      await api.subscription.sync(customerInfo);
    } catch (e) {
      if (__DEV__) console.error('subscription_sync_failed', e);
    }
  }, [customerInfo]);

  useEffect(() => {
    fetchInfo();
    // Sync on app foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchInfo();
    });
    return () => sub.remove();
  }, [fetchInfo]);

  return {
    customerInfo,
    isPremium: checkPremium(customerInfo),
    isInGracePeriod: checkGrace(customerInfo),
    isLoading,
    manualSync,
  };
}
