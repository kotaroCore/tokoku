'use client';
import { createContext, useContext } from 'react';

// Pengguna yang sedang login (nama, peran, izin), diisi dari layout lewat AppShell.
// Hanya untuk menampilkan / mengunci tombol; pemeriksaan sebenarnya ada di API.
export const MeContext = createContext({ name: '', role: 'staff', izin: [] });
export const useMe = () => useContext(MeContext);
