import assert from "assert";
import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import { SolPay } from "../target/types/sol_pay";

interface PDAParameters {
  escrowWalletKey: anchor.web3.PublicKey;
  stateKey: anchor.web3.PublicKey;
  escrowBump: number;
  stateBump: number;
  idx: anchor.BN;
}

describe("sol-pay", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolPay as Program<SolPay>;

  let mintAddress: anchor.web3.PublicKey; // Public Key because PDA
  let fromUser: anchor.web3.Keypair;
  let fromUserWallet: anchor.web3.PublicKey; // Public Key because PDA
  let toUser: anchor.web3.Keypair;

  let pda: PDAParameters;

  const getPdaParams = async (
    connection: anchor.web3.Connection,
    fromUser: anchor.web3.PublicKey,
    toUser: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey
  ): Promise<PDAParameters> => {
    const uid = new anchor.BN(parseInt((Date.now() / 1000).toString()));
    const uidBuffer = uid.toBuffer("le", 8);

    let [statePubKey, stateBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("escrow_state"),
          fromUser.toBuffer(),
          toUser.toBuffer(),
          mint.toBuffer(),
          uidBuffer,
        ],
        program.programId
      );
    let [walletPubKey, walletBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("escrow_wallet"),
          fromUser.toBuffer(),
          toUser.toBuffer(),
          mint.toBuffer(),
          uidBuffer,
        ],
        program.programId
      );
    return {
      idx: uid,
      escrowBump: walletBump,
      escrowWalletKey: walletPubKey,
      stateBump,
      stateKey: statePubKey,
    };
  };

  const createMint = async (
    connection: anchor.web3.Connection
  ): Promise<anchor.web3.PublicKey> => {
    // Can be done with spl.Token.createMint()

    const tokenMint = new anchor.web3.Keypair();
    const lamportsForMint =
      await provider.connection.getMinimumBalanceForRentExemption(
        spl.MintLayout.span
      );
    let tx = new anchor.web3.Transaction();

    // Allocate mint
    tx.add(
      anchor.web3.SystemProgram.createAccount({
        programId: spl.TOKEN_PROGRAM_ID,
        space: spl.MintLayout.span,
        fromPubkey: provider.wallet.publicKey,
        newAccountPubkey: tokenMint.publicKey,
        lamports: lamportsForMint,
      })
    );
    // Allocate wallet account
    tx.add(
      spl.Token.createInitMintInstruction(
        spl.TOKEN_PROGRAM_ID,
        tokenMint.publicKey,
        6,
        provider.wallet.publicKey,
        provider.wallet.publicKey
      )
    );
    const signature = await provider.send(tx, [tokenMint]);

    console.log(`[${tokenMint.publicKey}] Created new mint account`);
    return tokenMint.publicKey;
  };

  const createUserAndAssociatedWallet = async (
    connection: anchor.web3.Connection,
    mint?: anchor.web3.PublicKey
  ): Promise<[anchor.web3.Keypair, anchor.web3.PublicKey | undefined]> => {
    const user = new anchor.web3.Keypair();
    let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined =
      undefined;

    // Fund user with some SOL
    let txFund = new anchor.web3.Transaction();
    txFund.add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: user.publicKey,
        lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    const sigTxFund = await provider.send(txFund);
    console.log(`[${user.publicKey.toBase58()}] Funded new account with 5 SOL`);

    if (mint) {
      // Create a token account for the user and mint some tokens
      userAssociatedTokenAccount = await spl.Token.getAssociatedTokenAddress(
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        spl.TOKEN_PROGRAM_ID,
        mint,
        user.publicKey
      );

      const txFundTokenAccount = new anchor.web3.Transaction();
      txFundTokenAccount.add(
        spl.Token.createAssociatedTokenAccountInstruction(
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          spl.TOKEN_PROGRAM_ID,
          mint,
          userAssociatedTokenAccount,
          user.publicKey,
          user.publicKey
        )
      );
      txFundTokenAccount.add(
        spl.Token.createMintToInstruction(
          spl.TOKEN_PROGRAM_ID,
          mint,
          userAssociatedTokenAccount,
          provider.wallet.publicKey,
          [],
          1337000000
        )
      );
      const txFundTokenSig = await provider.send(txFundTokenAccount, [user]);
      console.log(
        `[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}`
      );
    }
    return [user, userAssociatedTokenAccount];
  };

  const readAccount = async (
    accountPublicKey: anchor.web3.PublicKey,
    provider: anchor.Provider
  ): Promise<[spl.AccountInfo, string]> => {
    const tokenInfoLol = await provider.connection.getAccountInfo(
      accountPublicKey
    );
    const data = Buffer.from(tokenInfoLol.data);
    const accountInfo: spl.AccountInfo = spl.AccountLayout.decode(data);

    const amount = (accountInfo.amount as any as Buffer).readBigUInt64LE();
    return [accountInfo, amount.toString()];
  };

  const readMint = async (
    mintPublicKey: anchor.web3.PublicKey,
    provider: anchor.Provider
  ): Promise<spl.MintInfo> => {
    const tokenInfo = await provider.connection.getAccountInfo(mintPublicKey);
    const data = Buffer.from(tokenInfo.data);
    const accountInfo = spl.MintLayout.decode(data);
    return {
      ...accountInfo,
      mintAuthority:
        accountInfo.mintAuthority == null
          ? null
          : anchor.web3.PublicKey.decode(accountInfo.mintAuthority),
      freezeAuthority:
        accountInfo.freezeAuthority == null
          ? null
          : anchor.web3.PublicKey.decode(accountInfo.freezeAuthority),
    };
  };

  beforeEach(async () => {
    mintAddress = await createMint(provider.connection);
    [fromUser, fromUserWallet] = await createUserAndAssociatedWallet(
      provider.connection,
      mintAddress
    );

    let _rest;
    [toUser, ..._rest] = await createUserAndAssociatedWallet(
      provider.connection
    );

    pda = await getPdaParams(
      provider.connection,
      fromUser.publicKey,
      toUser.publicKey,
      mintAddress
    );
  });

  it("can initialize a safe payment by fromUser", async () => {
    const [, fromUserBalancePre] = await readAccount(fromUserWallet, provider);
    assert.equal(fromUserBalancePre, "1337000000");

    const amount = new anchor.BN(20000000);

    // Initialize mint account and fund the account
    const tx1 = await program.rpc.initializeNewEscrow(
      pda.idx,
      pda.stateBump,
      pda.escrowBump,
      amount,
      {
        accounts: {
          escrowStateAccount: pda.stateKey,
          escrowWalletAccount: pda.escrowWalletKey,
          mintOfTokenBeingSent: mintAddress,
          fromUser: fromUser.publicKey,
          toUser: toUser.publicKey,
          walletToWithdrawFrom: fromUserWallet,

          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        },
        signers: [fromUser],
      }
    );
    await provider.connection.confirmTransaction(tx1);
    console.log(
      `Initialized a new Safe Pay instance. fromUser will pay toUser 20 tokens`
    );

    // Assert that 20 tokens were moved from fromUser's account to the escrow.
    const [, fromUserBalancePost] = await readAccount(fromUserWallet, provider);
    assert.equal(fromUserBalancePost, "1317000000");
    const [, escrowBalancePost] = await readAccount(
      pda.escrowWalletKey,
      provider
    );
    assert.equal(escrowBalancePost, "20000000");

    const state = await program.account.escrowState.fetch(pda.stateKey);
    assert.equal(state.amount.toString(), "20000000");
    assert.equal(state.stage.toString(), "1");
  });

  // ------------------------------------------------------------------------

  it("can send escrow funds to toUser", async () => {
    const [, fromUserBalancePre] = await readAccount(fromUserWallet, provider);
    assert.equal(fromUserBalancePre, "1337000000");

    const amount = new anchor.BN(20000000);

    // Initialize mint account and fund the account
    const tx1 = await program.rpc.initializeNewEscrow(
      pda.idx,
      pda.stateBump,
      pda.escrowBump,
      amount,
      {
        accounts: {
          escrowStateAccount: pda.stateKey,
          escrowWalletAccount: pda.escrowWalletKey,
          mintOfTokenBeingSent: mintAddress,
          fromUser: fromUser.publicKey,
          toUser: toUser.publicKey,
          walletToWithdrawFrom: fromUserWallet,

          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        },
        signers: [fromUser],
      }
    );
    console.log(
      `Initialized a new Safe Pay instance. fromUser will pay toUser 20 tokens`
    );

    // Assert that 20 tokens were moved from fromUser's account to the escrow.
    const [, fromUserBalancePost] = await readAccount(fromUserWallet, provider);
    assert.equal(fromUserBalancePost, "1317000000");
    const [, escrowBalancePost] = await readAccount(
      pda.escrowWalletKey,
      provider
    );
    assert.equal(escrowBalancePost, "20000000");

    // Create a token account for toUser.
    // No need to init because instruction handles it with 'init_if_needed'
    const toUserTokenAccount = await spl.Token.getAssociatedTokenAddress(
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      spl.TOKEN_PROGRAM_ID,
      mintAddress,
      toUser.publicKey
    );
    const tx2 = await program.rpc.completeEscrow(
      pda.idx,
      pda.stateBump,
      pda.escrowBump,
      {
        accounts: {
          escrowStateAccount: pda.stateKey,
          escrowWalletAccount: pda.escrowWalletKey,
          mintOfTokenBeingSent: mintAddress,
          fromUser: fromUser.publicKey,
          toUser: toUser.publicKey,
          walletToDepositTo: toUserTokenAccount,

          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        },
        signers: [toUser],
      }
    );

    // Assert that 20 tokens were sent back.
    const [, toUserBalance] = await readAccount(toUserTokenAccount, provider);
    assert.equal(toUserBalance, "20000000");

    // // Assert that escrow was correctly closed.
    try {
      await readAccount(pda.escrowWalletKey, provider);
      return assert.fail("Account should be closed");
    } catch (e) {
      assert.equal(e.message, "Cannot read property 'data' of null");
    }
  });

  it("can pull back funds once they are deposited", async () => {
    const [, fromUserBalancePre] = await readAccount(fromUserWallet, provider);
    assert.equal(fromUserBalancePre, "1337000000");

    const amount = new anchor.BN(20000000);

    // Initialize mint account and fund the account
    const tx1 = await program.rpc.initializeNewEscrow(
      pda.idx,
      pda.stateBump,
      pda.escrowBump,
      amount,
      {
        accounts: {
          escrowStateAccount: pda.stateKey,
          escrowWalletAccount: pda.escrowWalletKey,
          mintOfTokenBeingSent: mintAddress,
          fromUser: fromUser.publicKey,
          toUser: toUser.publicKey,
          walletToWithdrawFrom: fromUserWallet,

          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        },
        signers: [fromUser],
      }
    );
    console.log(
      `Initialized a new Safe Pay instance. fromUser will pay toUser 20 tokens`
    );

    // Assert that 20 tokens were moved from fromUser's account to the escrow.
    const [, fromUserBalancePost] = await readAccount(fromUserWallet, provider);
    assert.equal(fromUserBalancePost, "1317000000");
    const [, escrowBalancePost] = await readAccount(
      pda.escrowWalletKey,
      provider
    );
    assert.equal(escrowBalancePost, "20000000");

    // Withdraw the funds back
    const tx2 = await program.rpc.pullbackEscrow(
      pda.idx,
      pda.stateBump,
      pda.escrowBump,
      {
        accounts: {
          escrowStateAccount: pda.stateKey,
          escrowWalletAccount: pda.escrowWalletKey,
          mintOfTokenBeingSent: mintAddress,
          fromUser: fromUser.publicKey,
          toUser: toUser.publicKey,
          refundWallet: fromUserWallet,

          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
        },
        signers: [fromUser],
      }
    );

    // Assert that 20 tokens were sent back.
    const [, fromUserBalanceRefund] = await readAccount(
      fromUserWallet,
      provider
    );
    assert.equal(fromUserBalanceRefund, "1337000000");

    // Assert that escrow was correctly closed.
    try {
      await readAccount(pda.escrowWalletKey, provider);
      return assert.fail("Account should be closed");
    } catch (e) {
      assert.equal(e.message, "Cannot read property 'data' of null");
    }

    const state = await program.account.escrowState.fetch(pda.stateKey);
    assert.equal(state.amount.toString(), "20000000");
    assert.equal(state.stage.toString(), "3");
  });
});
