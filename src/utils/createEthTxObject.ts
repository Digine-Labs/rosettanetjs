import { CallObject } from '../types';
import { type Calldata, type RawArgs, hash } from 'starknet';
import { prepareMulticallCalldata } from '../calldata';

export function createEthTxObject(address: string | undefined, calls: CallObject[]) {
  const arrayCalls: [string, string, Calldata | RawArgs | undefined][] = calls.map((item) => [
    item.contractAddress,
    item.entrypoint,
    item.calldata,
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txCalls = [].concat(arrayCalls as any).map((it) => {
    const entryPointValue = it[1] as string;
    const entryPoint = entryPointValue.startsWith('0x')
      ? entryPointValue
      : hash.getSelectorFromName(entryPointValue);

    return {
      contract_address: it[0],
      entry_point: entryPoint,
      calldata: it[2],
    };
  });

  const params = {
    calls: txCalls,
  };

  const txData = prepareMulticallCalldata(params.calls);

  const txObject = {
    from: address,
    to: '0x0000000000000000000000004645415455524553',
    data: txData,
    value: '0x0',
  };

  return txObject;
}
