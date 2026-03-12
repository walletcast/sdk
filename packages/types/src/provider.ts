import type { IBroker } from './broker.js';

export interface WalletCastProviderConfig {
  broker: IBroker;
  rpcUrl: string;
  chainId: number;
  autoConnect?: boolean;
}

export type ReadMethod =
  | 'eth_call'
  | 'eth_getBalance'
  | 'eth_getTransactionCount'
  | 'eth_getBlockByNumber'
  | 'eth_getBlockByHash'
  | 'eth_blockNumber'
  | 'eth_chainId'
  | 'eth_gasPrice'
  | 'eth_estimateGas'
  | 'eth_getCode'
  | 'eth_getStorageAt'
  | 'eth_getTransactionByHash'
  | 'eth_getTransactionReceipt'
  | 'eth_getLogs'
  | 'net_version';

export type SigningMethod =
  | 'eth_sendTransaction'
  | 'eth_signTransaction'
  | 'eth_sign'
  | 'personal_sign'
  | 'eth_signTypedData_v4'
  | 'wallet_addEthereumChain'
  | 'wallet_switchEthereumChain'
  | 'eth_requestAccounts';

export const READ_METHODS: ReadMethod[] = [
  'eth_call',
  'eth_getBalance',
  'eth_getTransactionCount',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_blockNumber',
  'eth_chainId',
  'eth_gasPrice',
  'eth_estimateGas',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_getLogs',
  'net_version',
];

export const SIGNING_METHODS: SigningMethod[] = [
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData_v4',
  'wallet_addEthereumChain',
  'wallet_switchEthereumChain',
  'eth_requestAccounts',
];

export function isReadMethod(method: string): method is ReadMethod {
  return (READ_METHODS as string[]).includes(method);
}

export function isSigningMethod(method: string): method is SigningMethod {
  return (SIGNING_METHODS as string[]).includes(method);
}

export interface EIP1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}
