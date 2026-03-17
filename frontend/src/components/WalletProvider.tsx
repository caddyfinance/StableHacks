import { useMemo, ReactNode } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

import '@solana/wallet-adapter-react-ui/styles.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ConnProvider = ConnectionProvider as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WalletProv = SolanaWalletProvider as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ModalProv = WalletModalProvider as any;

export default function WalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl('devnet'), []);
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnProvider endpoint={endpoint}>
      <WalletProv wallets={wallets} autoConnect={false}>
        <ModalProv>
          {children}
        </ModalProv>
      </WalletProv>
    </ConnProvider>
  );
}
