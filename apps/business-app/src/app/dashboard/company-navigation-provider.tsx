'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { OwnerNavItem } from './owner-shell';

const CompanyNavigationContext = createContext<OwnerNavItem[] | null>(null);

/** Sidebar links are computed on the server from current company permissions. */
export function CompanyNavigationProvider({
 navigation,children,
}:{navigation:OwnerNavItem[];children:ReactNode}) {
 return <CompanyNavigationContext.Provider value={navigation}>
   {children}
 </CompanyNavigationContext.Provider>;
}
export function useCompanyNavigation() {
 return useContext(CompanyNavigationContext);
}
