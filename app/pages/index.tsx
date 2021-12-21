import {
  WalletDisconnectButton,
  WalletMultiButton,
  useWalletModal,
} from "@solana/wallet-adapter-react-ui";
import { NextPage } from "next";
import { useAnchorWallet, useWallet } from "@solana/wallet-adapter-react";
import { Connection } from "@solana/web3.js";
import { Provider } from "@project-serum/anchor";
import FloatingNav from "../components/FloatingNav";
import { Wallet } from "@solana/wallet-adapter-base";
import useWorkspace from "../hooks/useWorkspace";
import React from "react";
import Dropdown from "../components/Dropdown";
import { Controller, useForm } from "react-hook-form";

const mints = [
  {
    name: "Ethereum",
    address: "ethereum",
  },
  {
    name: "Solana",
    address: "solana",
  },
  {
    name: "Avalanche",
    address: "avalanche",
  },
];

export interface IMint {
  name: string;
  address: string;
}

type FormInputs = {
  mint: IMint;
  toUser: string;
};

const Index: NextPage = () => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { register, handleSubmit, control, setValue } = useForm<FormInputs>({
    defaultValues: { mint: mints[0] },
  });
  const workspace = useWorkspace();

  const initEscrow = (data: FormInputs) => {
    console.log(data);
  };

  const handleMintClick = (item: IMint) => {
    setValue("mint", item);
    setIsOpen(false);
  };

  return (
    <>
      <FloatingNav />
      <div className="mt-4 w-full text-center">
        <h1 className="text-2xl text-slate-500 font-bold">solpay</h1>
      </div>
      <form
        onSubmit={handleSubmit(initEscrow)}
        className="w-full mt-4 space-y-4"
      >
        <Controller
          name="mint"
          control={control}
          render={({ field: { onChange, value } }) => {
            return (
              <div className="w-full relative">
                <label
                  htmlFor={`mint-dropdown`}
                  className="w-full p-4 rounded-full  bg-slate-700 flex items-center space-x-2"
                  onClick={() => setIsOpen(!isOpen)}
                >
                  <div className="h-8 w-8 rounded-full bg-slate-300" />
                  <p className="text-slate-300">{value.name}</p>
                </label>
                <div
                  className={`mint-dropdown absolute w-full top-full mt-2 ${
                    isOpen
                      ? "pointer-events-auto opacity-100"
                      : "pointer-events-none opacity-0"
                  } transition-all bg-slate-700 rounded-xl z-20`}
                >
                  {mints.map((item, i) => (
                    <div
                      key={`mint-${i}`}
                      onClick={() => handleMintClick(item)}
                      className="w-full p-4 border-b border-slate-800 flex items-center space-x-2"
                    >
                      <div className="h-8 w-8 rounded-full bg-slate-300" />
                      <div className="text-slate-300">{item.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        />
        <input
          {...register("toUser")}
          className="w-full p-4 rounded-full bg-slate-700 text-slate-300"
          placeholder="Recipient"
        />

        <button
          type="submit"
          className="w-full rounded-full p-4 bg-slate-300 text-slate-800 text-xl font-medium hover:bg-slate-400 transition-all"
        >
          pay now
        </button>
      </form>
      <hr className="my-6 border-t border-slate-500" />
    </>
  );
};

export default Index;
