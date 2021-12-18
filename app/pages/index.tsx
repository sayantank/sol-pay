import {
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { NextPage } from "next";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import { Provider } from "@project-serum/anchor";
import FloatingNav from "../components/FloatingNav";
import { Wallet } from "@solana/wallet-adapter-base";
import useWorkspace from "../hooks/useWorkspace";

const Index: NextPage = () => {
  const workspace = useWorkspace();

  return (
    <>
      <FloatingNav />
      <div className="mt-4 w-full text-center">
        <h1 className="text-2xl text-slate-500 font-bold">solpay</h1>
        <WalletMultiButton />

        <p>{workspace?.wallet.publicKey.toBase58()}</p>
      </div>
    </>
  );
};

export default Index;
