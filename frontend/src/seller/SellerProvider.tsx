import React, { createContext, useContext, useEffect, useState } from 'react';
import { getListings, getSellerRequests, publishDraft } from '../api';
import { loadDrafts, putDraft, removeDraft } from '../draftStore';
import { deletePhoto } from '../photoStore';
import type { Draft, Listing, OrderRequest } from '../types';
import { useAppState } from '../app/_layout';

type SellerState = {
  drafts: Draft[];
  listings: Listing[];
  requests: OrderRequest[];
  remoteAvailable: boolean;
  syncing: boolean;
  notice: 'uploaded' | 'uploadFailed' | null;
  refreshDrafts: () => Promise<void>;
  refreshRemote: () => Promise<void>;
  syncDrafts: () => Promise<void>;
};
const Context = createContext<SellerState | null>(null);
export function useSeller(): SellerState {
  const value = useContext(Context);
  if (!value) throw new Error('Seller state requires SellerProvider');
  return value;
}
export function SellerProvider({ children, onPublished }: { children: React.ReactNode; onPublished: () => void }) {
  const { account, token } = useAppState();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [remoteAvailable, setRemoteAvailable] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<SellerState['notice']>(null);
  useEffect(() => {
    let active = true;
    loadDrafts().then(items => { if (active) setDrafts(items); }).catch(() => {});
    if (!token || account?.role !== 'seller') {
      return () => { active = false; };
    }
    Promise.all([getListings(), getSellerRequests(account.id, token)])
      .then(([items, orders]) => {
        if (!active) return;
        setListings(items.filter(item => item.sellerId === account.id));
        setRequests(orders);
        setRemoteAvailable(true);
      })
      .catch(() => { if (active) setRemoteAvailable(false); });
    return () => { active = false; };
  }, [account?.id, account?.role, token]);
  const refreshDrafts = async () => setDrafts(await loadDrafts());
  const refreshRemote = async () => {
    if (!token || account?.role !== 'seller') {
      setRemoteAvailable(false);
      return;
    }
    try {
      const [items, orders] = await Promise.all([getListings(), getSellerRequests(account.id, token)]);
      setListings(items.filter(item => item.sellerId === account.id));
      setRequests(orders);
      setRemoteAvailable(true);
    } catch {
      setRemoteAvailable(false);
    }
  };
  const syncDrafts = async () => {
    if (syncing) return;
    if (!token || account?.role !== 'seller') {
      setNotice('uploadFailed');
      return;
    }
    setSyncing(true);
    let failed = false;
    let uploaded = false;
    try {
      for (const draft of await loadDrafts()) {
        try {
          await putDraft({ ...draft, status: 'uploading' });
          await publishDraft(draft, token);
          await removeDraft(draft.localId);
          await deletePhoto(draft.photoRef);
          uploaded = true;
        } catch (error) {
          failed = true;
          await putDraft({ ...draft, status: 'failed', error: error instanceof Error ? error.message : String(error) });
        }
      }
      await refreshDrafts();
      if (uploaded) {
        onPublished();
        await refreshRemote();
      }
      setNotice(failed ? 'uploadFailed' : uploaded ? 'uploaded' : null);
    } finally {
      setSyncing(false);
    }
  };
  return <Context.Provider value={{ drafts, listings, requests, remoteAvailable, syncing, notice, refreshDrafts, refreshRemote, syncDrafts }}>
    {children}
  </Context.Provider>;
}