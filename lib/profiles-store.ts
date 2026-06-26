"use client";
// My Context 프로필 store. 대화 저장(persist)과 동일하게 storage 계층을 SSOT로 삼고
// 메타 목록만 메모리에 캐시. SSR 안전: 초기값 고정, storage 접근은 hydrateProfiles()에서만.
import { create } from "zustand";
import { deleteProfile, listProfiles, loadProfile, saveProfile } from "@/lib/storage";
import type { ContextItem, ContextProfile, ProfileMeta } from "@/types";

export type ProfilesState = {
  profiles: ProfileMeta[];
  hydrated: boolean;
  hydrateProfiles: () => void;
  /** 현재 맥락을 이름 붙여 프로필로 저장. 성공 시 true. */
  saveAsProfile: (name: string, contexts: ContextItem[]) => boolean;
  removeProfile: (id: string) => void;
  getProfile: (id: string) => ContextProfile | null;
};

export const useProfiles = create<ProfilesState>((set) => ({
  profiles: [],
  hydrated: false,

  /** effect에서 1회 호출 — storage의 프로필 인덱스를 메모리에 반영. */
  hydrateProfiles: () => set({ profiles: listProfiles(), hydrated: true }),

  saveAsProfile: (name, contexts) => {
    const n = name.trim();
    if (!n || contexts.length === 0) return false;
    const now = Date.now();
    const profile: ContextProfile = { id: crypto.randomUUID(), name: n, contexts, createdAt: now, updatedAt: now };
    const ok = saveProfile(profile);
    if (ok) set({ profiles: listProfiles() }); // quota 실패면 목록 불변
    return ok;
  },

  removeProfile: (id) => {
    deleteProfile(id);
    set({ profiles: listProfiles() });
  },

  getProfile: (id) => loadProfile(id),
}));
