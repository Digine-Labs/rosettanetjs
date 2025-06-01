import { RpcProvider, Contract } from 'starknet';

export async function getStarknetAddress(
  EthAddress: string,
  nodeUrl: string,
  rosettanetAddress: string
): Promise<string> {
  if (!EthAddress || !/^0x[a-fA-F0-9]{40}$/.test(EthAddress)) {
    throw new Error('EthAddress is required');
  }

  if (!nodeUrl) {
    throw new Error('nodeUrl is required');
  }

  if (!rosettanetAddress) {
    throw new Error('rosettanetAddress is required');
  }

  const starknetProvider = new RpcProvider({
    nodeUrl: nodeUrl,
  });

  const rosettanetContractAddress = rosettanetAddress;

  const { abi: rosettanetContractAbi } =
    await starknetProvider.getClassAt(rosettanetContractAddress);
  if (rosettanetContractAbi === undefined) {
    throw new Error('no contract abi, check contract address');
  }
  const rosettanetContract = new Contract(
    rosettanetContractAbi,
    rosettanetContractAddress,
    starknetProvider
  );

  const starknetAddress = await rosettanetContract.get_starknet_address_with_fallback(EthAddress);
  return '0x' + starknetAddress.toString(16);
}
