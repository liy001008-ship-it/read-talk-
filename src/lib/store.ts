'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
type State = {
    theme: 'paper' | 'light' | 'dark';
    fontSize: number;
    leftWidth: number;
    rightWidth: number;
    lastBook: string;
    immersive: boolean;
    set: (v: Partial<Omit<State, 'set'>>) => void;
};
export const usePreferences = create<State>()(persist(set => ({ theme: 'paper', fontSize: 20, leftWidth: 250, rightWidth: 360, lastBook: '', immersive: false, set: v => set(v) }), { name: 'between-pages-preferences' }));
