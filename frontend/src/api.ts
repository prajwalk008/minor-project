import type { Draft, Listing, Match, OrderRequest, ProductReview, ReviewImage, PublicSeller } from './types';
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
      INVALID_NAME: 'invalidName',
      PURCHASE_REQUIRED: 'reviewPurchaseRequired', REVIEW_EXISTS: 'reviewExists', INVALID_REVIEW: 'reviewInvalid',
      INVALID_CREDENTIALS: 'invalidCredentials',
    };
    return t(codes[e.code] || 'error');
  }
  return t('error');
}
async function json<T>(path: string, method = 'GET', data?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (data) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { method, headers, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error?.code || 'HTTP_ERROR', result.error?.message || 'Request failed');
  return result as T;
}
export async function publishDraft(d: Draft, token: string): Promise<Listing> {
  const photo = await json<{ photoId: string }>('/api/listing-photos', 'POST', { clientPhotoId: d.clientPhotoId, mimeType: d.photoMimeType, base64: await photoBase64(d.photoRef) }, token);
  return json<Listing>('/api/listings', 'POST', { ...d.fields, clientDraftId: d.localId, photoId: photo.photoId }, token);
}
export async function getListings(q = '') { return (await json<{ listings: Listing[] }>(`/api/listings?q=${encodeURIComponent(q)}`)).listings; }
export async function getListing(id: string) { return json<Listing>(`/api/listings/${encodeURIComponent(id)}`); }
export async function getPublicSeller(id: string) { return json<{ seller: PublicSeller; listings: Listing[] }>(`/api/sellers/${encodeURIComponent(id)}`); }
export async function getReviews(id: string) { return (await json<{ reviews: ProductReview[] }>(`/api/listings/${encodeURIComponent(id)}/reviews`)).reviews; }
export async function getReviewEligibility(id: string, token: string) { return json<{ purchased: boolean; reviewed: boolean }>(`/api/listings/${encodeURIComponent(id)}/reviews/eligibility`, 'GET', undefined, token); }
export async function publishReview(id: string, input: { rating: number; body: string; images: ReviewImage[] }, token: string) { return json<{ status: string }>(`/api/listings/${encodeURIComponent(id)}/reviews`, 'POST', input, token); }
export async function getSellerRequests(sellerId: string, token: string) { return (await json<{ requests: OrderRequest[] }>(`/api/sellers/${encodeURIComponent(sellerId)}/requests`, 'GET', undefined, token)).requests; }
export async function getBuyerRequests(token: string) { return (await json<{ requests: OrderRequest[] }>('/api/buyers/me/requests', 'GET', undefined, token)).requests; }
export async function createRequest(input: { listingId: string; buyerName: string; buyerPhone: string; quantity: number }, token: string) { return json<OrderRequest>('/api/requests', 'POST', input, token); }
export async function getRequest(id: string, token: string) { return json<OrderRequest>(`/api/requests/${encodeURIComponent(id)}`, 'GET', undefined, token); }
export async function setRequestStatus(id: string, data: Record<string, unknown>, token: string) { return json<OrderRequest>(`/api/requests/${encodeURIComponent(id)}/status`, 'PATCH', data, token); }
export async function getMatches(input: Record<string, unknown>) { return (await json<{ matches: Match[] }>('/api/transport/matches', 'POST', input)).matches; }
export type Account = { id: string; role: 'seller' | 'customer'; email: string; phone: string | null; firstName: string | null; lastName: string | null; createdAt: string };
export type AuthSession = { account: Account; token: string; expiresAt: string };
export async function registerAccount(input: { role: Account['role']; email: string; password: string; phone?: string; firstName: string; lastName: string }) {
  return json<AuthSession>('/api/auth/register', 'POST', input);
}
export async function loginAccount(input: { role: Account['role']; identifier: string; password: string }) {
  return json<AuthSession>('/api/auth/login', 'POST', input);
}
export async function logoutAccount(token: string) { return json<{ status: 'ok' }>('/api/auth/logout', 'POST', undefined, token); }
