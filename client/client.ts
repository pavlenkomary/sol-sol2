import BN from "bn.js";
import assert from "assert";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  getAccount,
  getOrCreateAssociatedTokenAccount,
  getMint,
  mintTo,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { keypairIdentity, token, Metaplex } from "@metaplex-foundation/js";
import type { TokenVault } from "../target/types/token_vault";

// Configure the client to use the local cluster
anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.TokenVault as anchor.Program<TokenVault>;


const mintAuthority = program.provider.wallet.payer;
const decimals = 9;

let [tokenAccountOwnerPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_account_owner_pda")],
  program.programId
);

const metaplex = new Metaplex(program.provider.connection).use(
  keypairIdentity(program.provider.wallet.payer)
);

const createdSFT = await metaplex.nfts().createSft({
  uri: "https://shdw-drive.genesysgo.net/AzjHvXgqUJortnr5fXDG2aPkp2PfFMvu4Egr57fdiite/PirateCoinMeta",
  name: "USDFOX",
  symbol: "USFX",
  sellerFeeBasisPoints: 100,
  updateAuthority: mintAuthority,
  mintAuthority: mintAuthority,
  decimals: decimals,
  tokenStandard: "Fungible",
  isMutable: true,
});

console.log(
  "Creating semi fungible spl token with address: " + createdSFT.sft.address
);

const mintDecimals = Math.pow(10, decimals);

let mintResult = await metaplex.nfts().mint({
  nftOrSft: createdSFT.sft,
  authority: program.provider.wallet.payer,
  toOwner: program.provider.wallet.payer.publicKey,
  // amount: token(1000000 * mintDecimals),
  amount: token(1 * mintDecimals),
});

console.log("Mint to result: " + mintResult.response.signature);

const tokenAccount = await getOrCreateAssociatedTokenAccount(
  program.provider.connection,
  program.provider.wallet.payer,
  createdSFT.mintAddress,
  program.provider.wallet.payer.publicKey
);

console.log("tokenAccount: " + tokenAccount.address);
console.log("TokenAccountOwnerPda: " + tokenAccountOwnerPda);

let tokenAccountInfo = await getAccount(program.provider.connection, tokenAccount.address);
console.log(
  "Owned token amount: " + tokenAccountInfo.amount / BigInt(mintDecimals)
);

let confirmOptions = {
  skipPreflight: true,
};
console.log("We now initialise account having minted a token");

let [tokenVault] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_vault"), createdSFT.mintAddress.toBuffer()],
  program.programId
);
console.log("VaultAccount: " + tokenVault);

let txHash = await program.methods
  .initialize()
  .accounts({
    tokenAccountOwnerPda: tokenAccountOwnerPda,
    senderTokenAccount: tokenAccount.address,
    vaultTokenAccount: tokenVault,
    mintOfTokenBeingSent: createdSFT.mintAddress,
    signer: program.provider.publicKey,
  })
  .rpc(confirmOptions);

console.log(`Initialize`);
await logTransaction(txHash);

tokenAccountInfo = await getAccount(program.provider.connection, tokenAccount.address);
console.log(
  "Owned token amount: " + tokenAccountInfo.amount / BigInt(mintDecimals)
);

async function logTransaction(txHash) {
  const { blockhash, lastValidBlockHeight } =
    await program.provider.connection.getLatestBlockhash();

  await program.provider.connection.confirmTransaction({
    blockhash,
    lastValidBlockHeight,
    signature: txHash,
  });

  console.log(
    `Solana Explorer: https://explorer.solana.com/tx/${txHash}?cluster=devnet`
  );
}

//  COULD SWITCH AUTH TO BE PDA. IS THIS THE MOST SECURE WAY????? IDK IDK

// An acccount that SOl is sent to. Need to look into the best way to create this in a secure manner.
const bondingCurveAccount = new web3.Keypair();
// This needs some sort of security improvements

// Buy coin in pre-sale stage. This will mint 2x the requested coins which atm is just random 1-1000* 1000000
// This then transfers 1/2 this amount to the users wallet (need to swap out vault wallet for users wallet here.)
const data = new BN(1000000);
const txHash = await program.methods
  .transferLamports(data)
  .accounts({
    from: program.provider.publicKey,
    bondingCurve: bondingCurveAccount.publicKey,
    tokenAccountOwnerPda: tokenAccountOwnerPda,
    vaultTokenAccount: tokenVault,
    senderTokenAccount: tokenAccount.address,
    mintOfTokenBeingSent: createdSFT.mintAddress,
    signer: program.provider.publicKey,
    mintAuthority: program.provider.publicKey,
    tokenProgram: token.TOKEN_PROGRAM_ID, // Token program ID
    systemProgram: SystemProgram.programId,
    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    recentSlothashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  })
  .signers([program.provider.wallet.payer])
  .rpc(confirmOptions);

console.log("Someone pre-buys {}", `https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
await program.provider.connection.confirmTransaction(txHash, "finalized");
const newAccountBalance = await program.provider.connection.getBalance(
  bondingCurveAccount.publicKey
);
assert.strictEqual(
  newAccountBalance,
  data.toNumber(),
  "The new account should have the transferred lamports"
);

// SIM A SECOND BUYER
// Generate keypair for the new account
// const newAccountKp = new web3.Keypair();
// const data = new BN(1000000);
// const txHash = await program.methods
//   .transferLamports(data)
//   .accounts({
//     from: program.provider.publicKey,
//     bondingCurve: bondingCurveAccount.publicKey,
//     tokenAccountOwnerPda: tokenAccountOwnerPda,
//     vaultTokenAccount: tokenVault,
//     senderTokenAccount: tokenAccount.address,
//     mintOfTokenBeingSent: createdSFT.mintAddress,
//     signer: program.provider.publicKey,
//     mintAuthority: program.provider.publicKey,
//     tokenProgram: token.TOKEN_PROGRAM_ID, // Token program ID
//     systemProgram: SystemProgram.programId,
//     rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//     recentSlothashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
//   })
//   .signers([program.provider.wallet.payer])
//   .rpc(confirmOptions);

// console.log("Someone else pre-bought some tokens {}", `https://explorer.solana.com/tx/${txHash}?cluster=devnet`);


// // SIM A THIRD BUYER
// // Generate keypair for the new account
// const newAccountKp = new web3.Keypair();
// const data = new BN(1000000);
// const txHash = await program.methods
//   .transferLamports(data)
//   .accounts({
//     from: program.provider.publicKey,
//     bondingCurve: bondingCurveAccount.publicKey,
//     tokenAccountOwnerPda: tokenAccountOwnerPda,
//     vaultTokenAccount: tokenVault,
//     senderTokenAccount: tokenAccount.address,
//     mintOfTokenBeingSent: createdSFT.mintAddress,
//     signer: program.provider.publicKey,
//     mintAuthority: program.provider.publicKey,
//     tokenProgram: token.TOKEN_PROGRAM_ID, // Token program ID
//     systemProgram: SystemProgram.programId,
//     rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//     recentSlothashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
//   })
//   .signers([program.provider.wallet.payer])
//   .rpc(confirmOptions);

// console.log(`https://explorer.solana.com/tx/${txHash}?cluster=devnet`);



// 1 buy
// Generate a new random keypair (user wallet)
const userWallet = Keypair.generate();
console.log("User's public key:", userWallet.publicKey.toBase58());
const mintAddress = createdSFT.mintAddress; // Use the existing mint address from your SFT
// Create or get the associated token account for the new user
const userTokenAccount = await getOrCreateAssociatedTokenAccount(
  program.provider.connection,        // The Solana connection object
  program.provider.wallet.payer,    // The payer's wallet keypair NEED TO SWAP TO USER AT LATER POINT
  mintAddress,          // The mint address of the token
  userWallet.publicKey  // The public key of the newly generated user wallet
);

console.log("User's token account address: " + userTokenAccount.address);

const amountToBuy = new BN(1000000);
// Execute the buy_tokens transaction
let txHash = await program.methods.buyTokens(amountToBuy)
  .accounts({
    from: program.provider.publicKey,              // User's public key SWAP TO USER AT SOME POINT
    bondingCurve: bondingCurveAccount.publicKey, // bonding curve account public key
    userTokenAccount: userTokenAccount.address, // User's token account
    senderTokenAccount: tokenAccount.address,  // Account from which tokens will be transferred
    tokenAccountOwnerPda: tokenAccountOwnerPda, // PDA
    systemProgram: SystemProgram.programId, // System program
    tokenProgram: token.TOKEN_PROGRAM_ID,         // Token program
    signer: program.provider.publicKey,
  })
  .signers([program.provider.wallet.payer])
  .rpc(confirmOptions);

console.log(`Transaction hash: ${txHash}`);

console.log('User has purchased')

const amountToSell = new BN(1000000); // Adjust this value as needed

// THIS some bs below here where i need to deposit some sol to the userwallet so they can exist (rent)
const tokenAccountSize = 165;
const minimumBalanceForRentExemption = await program.provider.connection.getMinimumBalanceForRentExemption(
  tokenAccountSize
);
const userTokenAccountBalance = await program.provider.connection.getBalance(userWallet.publicKey);
const lamportsNeeded = minimumBalanceForRentExemption - userTokenAccountBalance;
const transferTransaction = new web3.Transaction().add(
  web3.SystemProgram.transfer({
    fromPubkey: program.provider.publicKey, // User's wallet
    toPubkey: userWallet.publicKey, // User's token account
    lamports: lamportsNeeded, // Amount needed to cover rent-exemption
  })
);
const transferSignature = await web3.sendAndConfirmTransaction(
  program.provider.connection,
  transferTransaction,
  [program.provider.wallet.payer]
);

const initializeTriggerAccount = async () => {
  const triggerAccount = Keypair.generate();
  const txHash = await program.methods.initializeTriggerAccount()
    .accounts({
      triggerAccount: triggerAccount.publicKey, // The new trigger account
      authority: program.provider.publicKey,           // Authority paying for the account creation
      systemProgram: SystemProgram.programId,   // System program
    })
    .signers([triggerAccount, program.provider.wallet.payer]) // Trigger account keypair and authority signs
    .rpc();

  console.log(`Initialized trigger account with transaction hash: ${txHash}`);
  return triggerAccount;
};
const triggerAccount = await initializeTriggerAccount();

const setTrigger = async (triggerAccount: PublicKey, authority: Keypair, isTriggered: boolean) => {
  const txHash = await program.methods.setTrigger(isTriggered)
    .accounts({
      authority: program.provider.publicKey,        // Authority to set the trigger
      triggerAccount: triggerAccount,        // Initialized trigger account
    })
    .signers([program.provider.wallet.payer])                    // Authority's keypair signs the transaction
    .rpc();

  console.log(`Set trigger transaction hash: ${txHash}`);
};
// Only we can set trigger, and this blocks buys or sells.
await setTrigger(triggerAccount.publicKey, program.provider.wallet.payer, true);

console.log("trigger set")
const sellTxHash = await program.methods.sellTokens(amountToSell)
  .accounts({
    from: userWallet.publicKey,                // User's public key (payer)
    bondingCurve: bondingCurveAccount.publicKey, // Vault account to receive SOL
    userTokenAccount: userTokenAccount.address, // User's token account from which tokens will be sold
    senderTokenAccount: tokenAccount.address,   // Vault's token account to receive tokens
    signer: userWallet.publicKey,              // Authority for token transfer
    systemProgram: SystemProgram.programId,   // System program
    tokenProgram: token.TOKEN_PROGRAM_ID, 
    tokenAccountOwnerPda: tokenAccountOwnerPda,      // Token program
    triggerAccount: triggerAccount.publicKey,
  })
  .signers([userWallet, bondingCurveAccount]) // User's keypair should sign the transaction
  .rpc(confirmOptions);

console.log(`Sell transaction hash: ${sellTxHash}`);

console.log('User has sold.')


// Here I block selling: We will buy and then sell
await setTrigger(triggerAccount.publicKey, program.provider.wallet.payer, false);

const amountToBuy = new BN(1000000);
// Execute the buy_tokens transaction
let txHash = await program.methods.buyTokens(amountToBuy)
  .accounts({
    from: program.provider.publicKey,              // User's public key SWAP TO USER AT SOME POINT
    bondingCurve: bondingCurveAccount.publicKey, // bonding curve account public key
    userTokenAccount: userTokenAccount.address, // User's token account
    senderTokenAccount: tokenAccount.address,  // Account from which tokens will be transferred
    tokenAccountOwnerPda: tokenAccountOwnerPda, // PDA
    systemProgram: SystemProgram.programId, // System program
    tokenProgram: token.TOKEN_PROGRAM_ID,         // Token program
    signer: program.provider.publicKey,
  })
  .signers([program.provider.wallet.payer])
  .rpc(confirmOptions);

console.log(`Transaction hash: ${txHash}`);

console.log('User has purchased')
const sellTxHash = await program.methods.sellTokens(amountToSell)
  .accounts({
    from: userWallet.publicKey,                // User's public key (payer)
    bondingCurve: bondingCurveAccount.publicKey, // Vault account to receive SOL
    userTokenAccount: userTokenAccount.address, // User's token account from which tokens will be sold
    senderTokenAccount: tokenAccount.address,   // Vault's token account to receive tokens
    signer: userWallet.publicKey,              // Authority for token transfer
    systemProgram: SystemProgram.programId,   // System program
    tokenProgram: token.TOKEN_PROGRAM_ID, 
    tokenAccountOwnerPda: tokenAccountOwnerPda,      // Token program
    triggerAccount: triggerAccount.publicKey,
  })
  .signers([userWallet, bondingCurveAccount]) // User's keypair should sign the transaction
  .rpc(confirmOptions);

console.log(`Sell transaction hash: ${sellTxHash}`);