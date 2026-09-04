"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { CHAIN_ID } from "@/lib/constants";

type WalletState = {
  address: string | null;
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null;
  ready: boolean;
  authenticated: boolean;
  wrongNetwork: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
};

const WalletContext = createContext<WalletState | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [provider, setProvider] = useState<WalletState["provider"]>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const emailUser = user?.linkedAccounts?.some((account) => account.type === "email");
  const wallet = emailUser
    ? wallets.find((item) => item.walletClientType === "privy" || item.walletClientType === "privy-v2")
    : null;

  useEffect(() => {
    if (!authenticated || !wallet) {
      // Clear an old provider when the email session ends.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProvider(null);
      setWrongNetwork(false);
      return;
    }
    let cancelled = false;
    async function load() {
      const chainId = Number((wallet?.chainId ?? "").split(":").pop());
      if (chainId !== CHAIN_ID) {
        try {
          await wallet?.switchChain(CHAIN_ID);
        } catch {
          if (!cancelled) setWrongNetwork(true);
          return;
        }
      }
      const nextProvider = await wallet?.getEthereumProvider();
      if (!cancelled) {
        setWrongNetwork(false);
        setProvider(nextProvider as WalletState["provider"]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authenticated, wallet]);

  const connect = useCallback(() => login(), [login]);
  const disconnect = useCallback(async () => {
    await logout();
    setProvider(null);
  }, [logout]);

  return (
    <WalletContext.Provider
      value={{
        address: wallet?.address ?? null,
        provider,
        ready,
        authenticated,
        wrongNetwork,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
