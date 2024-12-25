/* eslint-disable @next/next/no-img-element */
import { FC, useCallback, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction, createSetAuthorityInstruction, AuthorityType } from '@solana/spl-token';
import { createCreateMetadataAccountV3Instruction, PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import axios from 'axios';

export const CreateToken: FC = () => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [tokenName, setTokenName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [amount, setAmount] = useState('')
  const [decimals, setDecimals] = useState('')
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<{ type: string | null; message: string }>({ type: null, message: "" })

  const uploadToPinata = async (image: File, metadata: any) => {
    try {
      // Upload image to IPFS
      const formData = new FormData();
      formData.append('file', image);
      const imageRes = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`
        }
      });
      const imageUrl = `https://ipfs.io/ipfs/${imageRes.data.IpfsHash}`;

      // Create and upload metadata JSON
      const metadataJSON = {
        name: metadata.name,
        description: metadata.description,
        symbol: metadata.symbol,
        image: imageUrl,
      };
      const metadataRes = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadataJSON, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`
        }
      });

      return `https://ipfs.io/ipfs/${metadataRes.data.IpfsHash}`;
    } catch (error) {
      console.error("Error uploading to Pinata:", error);
      throw error;
    }
  };

  const onClick = useCallback(async (form) => {
    if (!imageFile) {
      setStatus({
        type: "error",
        message: "Please select an image for your token",
      });
      return;
    }

    setLoading(true);
    try {
      // Upload to IPFS first
      const metadataUri = await uploadToPinata(imageFile, {
        name: form.tokenName,
        description: form.description,
        symbol: form.symbol,
      });

      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const mintKeypair = Keypair.generate();
      const tokenATA = await getAssociatedTokenAddress(mintKeypair.publicKey, publicKey);

      const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
          metadata: PublicKey.findProgramAddressSync(
            [
              Buffer.from("metadata"),
              PROGRAM_ID.toBuffer(),
              mintKeypair.publicKey.toBuffer(),
            ],
            PROGRAM_ID,
          )[0],
          mint: mintKeypair.publicKey,
          mintAuthority: publicKey,
          payer: publicKey,
          updateAuthority: publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: form.tokenName,
              symbol: form.symbol,
              uri: metadataUri,
              creators: null,
              sellerFeeBasisPoints: 0,
              uses: null,
              collection: null,
            },
            isMutable: false,
            collectionDetails: null,
          },
        },
      );

      const createNewTokenTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports: lamports,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
          mintKeypair.publicKey, 
          form.decimals, 
          publicKey, 
          publicKey, 
          TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(
          publicKey,
          tokenATA,
          publicKey,
          mintKeypair.publicKey,
        ),
        createMintToInstruction(
          mintKeypair.publicKey,
          tokenATA,
          publicKey,
          form.amount * Math.pow(10, form.decimals),
        ),
        createMetadataInstruction,
        createSetAuthorityInstruction(
          mintKeypair.publicKey,
          publicKey,
          AuthorityType.MintTokens,
          null
        ),
        createSetAuthorityInstruction(
          mintKeypair.publicKey,
          publicKey,
          AuthorityType.FreezeAccount,
          null
        )
      );
      await sendTransaction(createNewTokenTransaction, connection, {signers: [mintKeypair]});

      setStatus({
        type: "success",
        message: `Token created successfully! Mint address: ${mintKeypair.publicKey.toString()}`,
      });
    } catch (error) {
      console.error('Error:', error);
      setStatus({
        type: "error",
        message: "Failed to create token. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection, sendTransaction, imageFile]);

  return (
    <div className="my-6">
      <input
        type="text"
        className="form-control block mb-2 w-full px-4 py-2 text-xl font-normal text-gray-700 bg-white bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:bg-white focus:border-blue-600 focus:outline-none"
        placeholder="Token Name"
        onChange={(e) => setTokenName(e.target.value)}
      />
      <input
        type="text"
        className="form-control block mb-2 w-full px-4 py-2 text-xl font-normal text-gray-700 bg-white bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:bg-white focus:border-blue-600 focus:outline-none"
        placeholder="Symbol"
        onChange={(e) => setSymbol(e.target.value)}
      />
      <input
        type="number"
        className="form-control block mb-2 w-full px-4 py-2 text-xl font-normal text-gray-700 bg-white bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:bg-white focus:border-blue-600 focus:outline-none"
        placeholder="Amount"
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        type="number"
        className="form-control block mb-2 w-full px-4 py-2 text-xl font-normal text-gray-700 bg-white bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:bg-white focus:border-blue-600 focus:outline-none"
        placeholder="Decimals"
        onChange={(e) => setDecimals(e.target.value)}
      />
      <textarea
        className="form-control block mb-2 w-full px-4 py-2 text-xl font-normal text-gray-700 bg-white bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:bg-white focus:border-blue-600 focus:outline-none"
        placeholder="Description"
        onChange={(e) => setDescription(e.target.value)}
      />
      <input
        type="file"
        accept="image/*"
        className="form-control block mb-2 w-full px-4 py-2 text-xl font-normal text-gray-700 bg-white bg-clip-padding border border-solid border-gray-300 rounded transition ease-in-out m-0 focus:text-gray-700 focus:bg-white focus:border-blue-600 focus:outline-none"
        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
      />
      
      {imageFile && (
        <img
          src={URL.createObjectURL(imageFile)}
          alt="Token preview"
          className="max-w-full h-auto rounded mb-2"
        />
      )}

      <button
        className="px-8 m-2 btn animate-pulse bg-gradient-to-r from-[#9945FF] to-[#14F195] hover:from-pink-500 hover:to-yellow-500 ..."
        disabled={loading}
        onClick={() => onClick({
          decimals: Number(decimals),
          amount: Number(amount),
          description,
          symbol,
          tokenName,
        })}>
        <span>{loading ? 'Creating Token...' : 'Create Token'}</span>
      </button>

      {status.type && (
        <div className={`mt-4 p-2 rounded ${
          status.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
        }`}>
          {status.message}
        </div>
      )}
    </div>
  )
}
