import type { Wallet } from '@wallet-standard/base';
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardEventsFeature,
  type StandardDisconnectFeature,
  type StandardConnectFeature,
} from '@wallet-standard/features';
import { RequestFn } from '@starknet-io/types-js';
import { WalletWithFeatures } from '@wallet-standard/base';

export const StarknetWalletApi = 'starknet:walletApi';

export type StarknetWalletApiVersion = '1.0.0';

export type StarknetWalletRequestFeature = {
  readonly [StarknetWalletApi]: {
    readonly version: StarknetWalletApiVersion;
    readonly request: RequestFn;
    readonly walletVersion: string;
  };
};

export type StarknetFeatures = StarknetWalletRequestFeature &
  StandardConnectFeature &
  StandardDisconnectFeature &
  StandardEventsFeature;
export type EthereumWalletWithStarknetFeatures = WalletWithFeatures<StarknetFeatures>;

const RequiredStarknetFeatures = [
  StarknetWalletApi,
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
] as const satisfies (keyof StarknetFeatures)[];

export function isEVMWallet(wallet: Wallet): wallet is EthereumWalletWithStarknetFeatures {
  const result = RequiredStarknetFeatures.every((feature) => feature in wallet.features);
  return result;
}
