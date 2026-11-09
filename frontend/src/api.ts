import type { Draft, Listing, Match, OrderRequest } from './types';
import type { Key } from './i18n';
import { photoBase64 } from './photoStore';

export const API = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
export class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }
export function displayError(e: unknown, t: (key: Key) => string): string {
  if (e instanceof ApiError) {
    const codes: Record<string, Key> = {
      INVALID_INPUT: 'invalid', INVALID_TERMS: 'invalid', INVALID_IMAGE: 'invalid',
      COUNTEROFFER_REQUIRED: 'counterofferRequired', STOCK_UNAVAILABLE: 'stockUnavailable',
      TRANSPORT_UNAVAILABLE: 'transportUnavailable',
      INVALID_AUTH_INPUT: 'invalidAuthInput', ACCOUNT_EXISTS: 'accountExists',
      INVALID_CREDENTIALS: 'invalidCredentials',
    };
    return t(codes[e.code] || 'error');
  }
  return t('error');
}
async function json<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, { method, headers: data ? { 'Content-Type': 'application/json' } : undefined, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error?.code || 'HTTP_ERROR', result.error?.message || 'Request failed');
  return result as T;
}
export async function publishDraft(d: Draft): Promise<Listing> {
  const photo = await json<{ photoId: string }>('/api/listing-photos', 'POST', { sellerId: 'demo-seller', clientPhotoId: d.clientPhotoId, mimeType: d.photoMimeType, base64: await photoBase64(d.photoRef) });
  return json<Listing>('/api/listings', 'POST', { ...d.fields, sellerId: 'demo-seller', clientDraftId: d.localId, photoId: photo.photoId });
}
export async function getListings(q = '') { return (await json<{ listings: Listing[] }>(`/api/listings?q=${encodeURIComponent(q)}`)).listings; }
export async function getSellerRequests() { return (await json<{ requests: OrderRequest[] }>('/api/sellers/demo-seller/requests')).requests; }
export async function createRequest(input: { listingId: string; buyerName: string; buyerPhone: string; quantity: number }) { return json<OrderRequest>('/api/requests', 'POST', input); }
export async function setRequestStatus(id: string, data: Record<string, unknown>) { return json<OrderRequest>(`/api/requests/${id}/status`, 'PATCH', data); }
export async function getMatches(input: Record<string, unknown>) { return (await json<{ matches: Match[] }>('/api/transport/matches', 'POST', input)).matches; }
export type Account = { id: string; role: 'seller' | 'customer'; email: string; phone: string | null; createdAt: string };
export async function registerAccount(input: { role: Account['role']; email: string; password: string; phone?: string }) {
  return json<{ account: Account }>('/api/auth/register', 'POST', input);
}
export async function loginAccount(input: { role: Account['role']; identifier: string; password: string }) {
  return json<{ account: Account }>('/api/auth/login', 'POST', input);
}
