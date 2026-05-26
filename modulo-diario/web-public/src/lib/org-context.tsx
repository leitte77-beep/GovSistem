"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type OrganizationInfo } from "./api";

interface OrgContextType {
  org: OrganizationInfo | null;
  loading: boolean;
}

const OrgContext = createContext<OrgContextType>({ org: null, loading: true });

export function OrgProvider({ children }: { children: ReactNode }) {
  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrganization()
      .then(setOrg)
      .catch(() => setOrg(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <OrgContext.Provider value={{ org, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
