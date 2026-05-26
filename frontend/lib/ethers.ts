import {
  BrowserProvider,
  Contract,
  type Eip1193Provider,
  type InterfaceAbi
} from "ethers";

type EthereumWindow = Window & {
  ethereum?: Eip1193Provider;
};

export async function getSigner() {
  if (typeof window === "undefined") {
    throw new Error("Wallet access is only available in the browser");
  }

  const ethereum = (window as EthereumWindow).ethereum;
  if (!ethereum) {
    throw new Error("No injected wallet found");
  }

  const provider = new BrowserProvider(ethereum);
  return provider.getSigner();
}

export async function getContractWithSigner(
  contractAddress: string,
  abi: InterfaceAbi
) {
  const signer = await getSigner();
  return new Contract(contractAddress, abi, signer);
}

export function getFrontendContractAddress() {
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!address) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS is not configured");
  }
  return address;
}
