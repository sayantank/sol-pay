import {
  WalletDisconnectButton,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";
import { NextPage } from "next";
import FloatingNav from "../components/FloatingNav";

const Index: NextPage = () => {
  return (
    <>
      <FloatingNav />
      <div className="mt-4 w-full text-center">
        <h1 className="text-2xl text-slate-500 font-bold">solpay</h1>
      </div>
    </>
  );
};

export default Index;
