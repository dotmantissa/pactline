"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { CHAIN_ID, RPC_URL } from "@/lib/constants";
import { WalletProvider } from "@/components/wallet-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ""}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#5aff88",
          logo: "/icon.svg",
          landingHeader: "Terms in the open. A record when it matters.",
          walletList: [],
        },
        loginMethods: ["email"],
        embeddedWallets: {
          ethereum: { createOnLogin: "all-users" },
          showWalletUIs: false,
        },
        defaultChain: {
          id: CHAIN_ID,
          name: "GenLayer Studio",
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
          rpcUrls: { default: { http: [RPC_URL] } },
        },
        supportedChains: [
          {
            id: CHAIN_ID,
            name: "GenLayer Studio",
            nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
            rpcUrls: { default: { http: [RPC_URL] } },
          },
        ],
      }}
    >
      <WalletProvider>{children}</WalletProvider>
    </PrivyProvider>
  );
}
