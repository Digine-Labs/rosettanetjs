import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  StandardConnect,
  type StandardConnectMethod,
  StandardDisconnect,
  type StandardDisconnectMethod,
  StandardEvents,
  type StandardEventsOnMethod,
  type StandardEventsNames,
  type StandardEventsListeners,
} from '@wallet-standard/features';
import {
  StarknetWindowObject,
  RpcTypeToMessageMap,
  RpcMessage,
  RequestFnCall,
} from '@starknet-io/types-js';
import {
  EthereumWalletWithStarknetFeatures,
  StarknetFeatures,
  StarknetWalletApi,
} from './features';
import { EthereumChain } from '../../types';
import { validateCallParams } from '../../utils/validateCallParams';
import { createEthTxObject } from '../../utils/createEthTxObject';

const walletToEthereumRpcMap: Record<keyof RpcTypeToMessageMap, string | undefined> = {
  wallet_getPermissions: undefined,
  wallet_requestAccounts: 'eth_requestAccounts',
  wallet_watchAsset: 'wallet_watchAsset',
  wallet_addStarknetChain: undefined,
  wallet_switchStarknetChain: undefined,
  wallet_requestChainId: 'eth_chainId',
  wallet_deploymentData: undefined,
  wallet_addInvokeTransaction: 'eth_sendTransaction',
  wallet_addDeclareTransaction: undefined,
  wallet_signTypedData: 'personal_sign',
  wallet_supportedSpecs: undefined,
  wallet_supportedWalletApi: undefined,
};

/**
 * Implementation of the Wallet Standard for Ethereum/EVM wallets
 */
export class EthereumInjectedWallet implements EthereumWalletWithStarknetFeatures {
  #listeners: { [E in StandardEventsNames]?: StandardEventsListeners[E][] } = {};
  #account: { address: string; chain: EthereumChain } | null = null;

  constructor(private readonly injected: StarknetWindowObject) {
    this.injected.on('accountsChanged', this.#onAccountsChanged.bind(this));
    this.injected.on('networkChanged', this.#onNetworkChanged.bind(this));
  }

  get version() {
    return '1.0.0' as const;
  }

  get name() {
    return this.injected.name;
  }

  get icon() {
    return this.injected.icon as Wallet['icon'];
  }

  get features(): StarknetFeatures {
    return {
      [StandardConnect]: {
        version: '1.0.0' as const,
        connect: this.#connect.bind(this),
      },
      [StandardDisconnect]: {
        version: '1.0.0' as const,
        disconnect: this.#disconnect.bind(this),
      },
      [StandardEvents]: {
        version: '1.0.0' as const,
        on: this.#on.bind(this),
      },
      [StarknetWalletApi]: {
        version: '1.0.0' as const,
        request: this.#request.bind(this),
        walletVersion: this.injected.version,
      },
    };
  }

  get chains() {
    return [
      'eip155:1381192787', // Rosettanet Chain ID
    ] as EthereumChain[];
  }

  get accounts(): WalletAccount[] {
    if (this.#account) {
      return [
        {
          address: this.#account.address,
          publicKey: new Uint8Array(),
          chains: [this.#account.chain],
          features: [],
        },
      ];
    }

    return [];
  }

  #connect: StandardConnectMethod = async () => {
    if (!this.#account) {
      const accounts = await this.#request({
        type: 'wallet_requestAccounts',
      });

      // User rejected the request.
      if (accounts.length === 0) {
        return { accounts: [] };
      }

      await this.#updateAccount(accounts);
    }

    return { accounts: this.accounts };
  };

  #disconnect: StandardDisconnectMethod = async () => {
    // Most EVM wallets don't have a disconnect method
    // We'll just clear our internal state
    this.#disconnected();
    return;
  };

  #on: StandardEventsOnMethod = (event, listener) => {
    if (!this.#listeners[event]) {
      this.#listeners[event] = [];
    }

    this.#listeners[event].push(listener);

    return (): void => this.#off(event, listener);
  };

  #emit<E extends StandardEventsNames>(
    event: E,
    ...args: Parameters<StandardEventsListeners[E]>
  ): void {
    if (!this.#listeners[event]) return;

    for (const listener of this.#listeners[event]) {
      listener.apply(null, args);
    }
  }

  #off<E extends StandardEventsNames>(event: E, listener: StandardEventsListeners[E]): void {
    this.#listeners[event] = this.#listeners[event]?.filter(
      (existingListener) => listener !== existingListener
    );
  }

  #disconnected() {
    if (this.#account) {
      this.#account = null;
      this.#emit('change', { accounts: this.accounts });
    }
  }

  async #onAccountsChanged(accounts: string[] | undefined) {
    if (!accounts || accounts.length === 0) {
      this.#disconnected();
      return;
    }

    if (!this.#account) {
      return;
    }

    await this.#updateAccount(accounts);
  }

  #onNetworkChanged(chainIdHex: string | undefined) {
    if (!chainIdHex || !this.#account) {
      this.#disconnected();
      return;
    }

    // Convert hex chainId to decimal
    const chainId = Number.parseInt(chainIdHex, 16).toString();
    const chain = `eip155:${chainId}` as EthereumChain;

    // Check if this is a supported chain
    if (!this.chains.includes(chain)) {
      console.warn('Switched to unsupported chain:', chain);
    }

    this.#account.chain = chain;
    this.#emit('change', { accounts: this.accounts });
  }

  async #updateAccount(accounts: string[]) {
    if (accounts.length === 0) {
      return;
    }

    const [account] = accounts;

    if (this.#account?.chain) {
      // Only account changed, chain remains the same
      this.#account.address = account;
      this.#emit('change', { accounts: this.accounts });
    } else {
      // Need to get the chain ID too
      const chain = await this.#getEthereumChain();
      this.#account = { address: account, chain };
      this.#emit('change', { accounts: this.accounts });
    }
  }

  #request = async <T extends RpcMessage['type']>(
    call: RequestFnCall<T>
  ): Promise<RpcTypeToMessageMap[T]['result']> => {
    const mappedMethod = walletToEthereumRpcMap[call.type];

    if (!mappedMethod) {
      throw new Error(`Unsupported request type: ${call.type}`);
    }

    if (mappedMethod === 'eth_sendTransaction' && call.params) {
      if (validateCallParams(call.params) === false) {
        throw new Error(
          'Invalid call parameter. Expected an array of objects. Rosettanet only supports multicall.'
        );
      }

      const txObject = createEthTxObject(this.#account?.address, call.params);

      const ethPayload = {
        method: mappedMethod,
        params: [txObject],
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.injected.request as any)(ethPayload);
    }

    if (mappedMethod === 'personal_sign' && call.params) {
      const ethPayload = {
        method: mappedMethod,
        params: [this.#account?.address, call.params],
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.injected.request as any)(ethPayload);
    }

    if (mappedMethod === 'wallet_watchAsset' && call.params) {
      const ethPayload = {
        method: mappedMethod,
        params: call.params,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.injected.request as any)(ethPayload);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.injected.request as any)({
      method: mappedMethod,
      params: call.params ? [call.params] : [],
    });
  };

  async #getEthereumChain(): Promise<EthereumChain> {
    const chainIdHex = await this.#request({
      type: 'wallet_requestChainId',
    });
    // Convert hex to decimal
    const chainId = Number.parseInt(chainIdHex, 16).toString();
    const chain = `eip155:${chainId}` as EthereumChain;

    // Check if the chain is rosettanet chain
    if (chainId !== '1381192787') {
      throw new Error('Invalid Rosettanet chain');
    }

    return chain;
  }
}
