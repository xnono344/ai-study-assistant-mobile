/**
 * Subscription service — RevenueCat integration.
 * Handles purchase, restore, sync, and customer portal.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases from 'react-native-purchases';

const REVENUECAT_KEYS = {
  ios: Constants.expoConfig?.extra?.revenuecatApiKeyIos as string | undefined,
  android: Constants.expoConfig?.extra?.revenuecatApiKeyAndroid as string | undefined,
};

let configured = false;

export async function configurePurchases(userId: string): Promise<boolean> {
  const apiKey = Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : REVENUECAT_KEYS.android;
  if (!apiKey) {
    if (__DEV__) console.warn('revenuecat_not_configured platform=' + Platform.OS);
    return false;
  }
  try {
    await Purchases.configure({
      apiKey,
      appUserID: userId,
    });
    configured = true;
    return true;
  } catch (e) {
    if (__DEV__) console.error('revenuecat_configure_failed', e);
    return false;
  }
}

export interface CustomerInfo {
  entitlements: {
    active: Record<string, { isActive: boolean; willRenew: boolean; productIdentifier: string; expirationDate: string }>;
  };
  originalAppUserId: string;
  managementURL?: string | null;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return (await Purchases.getCustomerInfo()) as any;
  } catch (e) {
    if (__DEV__) console.error('revenuecat_get_customer_info_failed', e);
    return null;
  }
}

export async function purchasePackage(packageId: string): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current;
    if (!offering) return null;
    const pkg = offering.availablePackages.find((p: any) => p.identifier === packageId);
    if (!pkg) return null;
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo as any;
  } catch (e: any) {
    if (e.userCancelled) return null;
    if (__DEV__) console.error('revenuecat_purchase_failed', e);
    return null;
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    const info = await Purchases.restorePurchases();
    return info as any;
  } catch (e) {
    if (__DEV__) console.error('revenuecat_restore_failed', e);
    return null;
  }
}

export async function getCustomerPortalUrl(): Promise<string | null> {
  if (!configured) return null;
  try {
    const url = (await Purchases.getCustomerInfo()).managementURL;
    return typeof url === 'string' ? url : null;
  } catch (e) {
    if (__DEV__) console.error('revenuecat_portal_failed', e);
    return null;
  }
}

export function isPremium(info: CustomerInfo | null): boolean {
  if (!info) return false;
  return info.entitlements?.active?.['premium']?.isActive === true;
}

export function isInGracePeriod(info: CustomerInfo | null): boolean {
  if (!info) return false;
  const ent = info.entitlements?.active?.['premium'];
  if (!ent?.expirationDate) return false;
  return new Date(ent.expirationDate) > new Date();
}
