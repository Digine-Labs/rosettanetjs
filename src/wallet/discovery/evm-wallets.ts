import { StarknetWindowObject } from '@starknet-io/types-js';
import { createStore } from 'mipd';
import { EthereumProvider } from '../../types';
import { EthereumInjectedWallet } from '../wallet-standard/evm-injected-wallet';

export async function EvmWalletsWithStarknetFeatures() {
  let Wallets = [];

  const store = createStore();

  const providers = store.getProviders();

  for (const wallet of providers) {
    if (wallet.info.rdns === 'com.bitget.web3') {
      wallet.info.name = 'Bitget Wallet via Rosettanet';
    } else if (wallet.info.rdns === 'com.okex.wallet') {
      wallet.info.name = 'OKX Wallet via Rosettanet';
    }

    const walletWithStarknetKeys = {
      ...wallet.provider,
      id: wallet.info.name,
      name: wallet.info.name,
      icon: wallet.info.icon,
      version: '1.0.0',
      on: wallet.provider.on,
      off: wallet.provider.removeListener,
    } as StarknetWindowObject;

    Wallets.push(new EthereumInjectedWallet(walletWithStarknetKeys));
  }

  return Wallets;
}

const ETHEREUM_WALLET_KEYS = ['sendAsync', 'send', 'request'];

export function isEthereumWindowObject(wallet: unknown): wallet is EthereumProvider {
  if (typeof wallet !== 'object' || wallet === null) return false;
  return ETHEREUM_WALLET_KEYS.every((key) => key in wallet);
}
