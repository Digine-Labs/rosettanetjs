import { encodeParameters, parseSignature } from "./calldata";
import { Call } from "./types";

export function prepareMulticallCalldata(calls: Call[]): string {
    const functionDesc = parseSignature('multicall((uint256,uint256,uint256[])[])');

    const encodedParams = wireEncodeByteArray(encodeParameters(functionDesc.inputs, [calls.map(call => [BigInt(call.contract_address), BigInt(call.entry_point), [...call.calldata.map(cd => BigInt(cd))]])]));

    return encodedParams.replace('0x','0x76971d7f')
}

function wireEncodeByteArray(bytes: ArrayLike<number>): string {
	let result = ''
	for (let i = 0; i < bytes.length; ++i) {
		result += ('0' + bytes[i].toString(16)).slice(-2)
	}
	return `0x${result}`
}