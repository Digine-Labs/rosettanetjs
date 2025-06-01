import { EncodableArray, EncodableTuple, ParameterDescription } from '../types';

export function padLeftTo32Bytes(input: Uint8Array): Uint8Array {
  const length = input.length % 32 ? input.length + 32 - (input.length % 32) : input.length;
  const result = new Uint8Array(length);
  result.set(input, result.length - input.length);
  return result;
}

export function padRightTo32Bytes(input: Uint8Array): Uint8Array {
  const length = input.length % 32 ? input.length + 32 - (input.length % 32) : input.length;
  const result = new Uint8Array(length);
  result.set(input, 0);
  return result;
}

export function concatenateBytes(source: ReadonlyArray<Uint8Array>): Uint8Array {
  return new Uint8Array(source.flatMap((x) => [...x]));
}

export function padAndLengthPrefix(source: Uint8Array): Uint8Array {
  const length = source.length;
  const padded = padRightTo32Bytes(source);
  return concatenateBytes([integerToBytes(length), padded]);
}

export function encodeDynamicData(
  encodedData: ReadonlyArray<{ isDynamic: boolean; bytes: Uint8Array }>
): Uint8Array {
  let staticBytesSize = 0;
  for (let encodedParameter of encodedData) {
    if (encodedParameter.isDynamic) staticBytesSize += 32;
    else staticBytesSize += encodedParameter.bytes.length;
  }
  const staticBytes: Array<Uint8Array> = [];
  const dynamicBytes: Array<Uint8Array> = [];
  for (let encodedParameter of encodedData) {
    if (encodedParameter.isDynamic) {
      const dynamicBytesAppendedSoFar = dynamicBytes.reduce(
        (total, bytes) => (total += bytes.length),
        0
      );
      staticBytes.push(integerToBytes(staticBytesSize + dynamicBytesAppendedSoFar));
      dynamicBytes.push(encodedParameter.bytes);
    } else {
      staticBytes.push(encodedParameter.bytes);
    }
  }
  return concatenateBytes([...staticBytes, ...dynamicBytes]);
}

export function anyIsDynamic(descriptions: ReadonlyArray<ParameterDescription>): boolean {
  for (let description of descriptions) {
    if (isDynamic(description)) return true;
  }
  return false;
}

export function isDynamic(description: ParameterDescription): boolean {
  if (description.type === 'string') return true;
  if (description.type === 'bytes') return true;
  if (description.type.endsWith('[]')) return true;
  const fixedArrayMatcher = /^(.*)\[(\d+)\]$/.exec(description.type);
  if (
    fixedArrayMatcher !== null &&
    isDynamic(Object.assign({}, description, { type: fixedArrayMatcher[1] }))
  )
    return true;
  if (description.type === 'tuple' && anyIsDynamic(description.components || [])) return true;
  return false;
}

export function isEncodableArray(maybe: EncodableArray | EncodableTuple): maybe is EncodableArray {
  return Array.isArray(maybe);
}

export function bytesToInteger(bytes: Uint8Array, signed = false): bigint {
  return signed ? bytesToSigned(bytes) : bytesToUnsigned(bytes);
}

export function integerToBytes(value: bigint | number, byteWidth = 32, signed = false): Uint8Array {
  return signed ? signedToBytes(value, byteWidth) : unsignedToBytes(value, byteWidth);
}

export function bytesToUnsigned(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return value;
}

export function bytesToSigned(bytes: Uint8Array): bigint {
  const unsignedValue = bytesToUnsigned(bytes);
  return twosComplement(unsignedValue, bytes.length * 8);
}

export function unsignedToBytes(value: bigint | number, byteWidth: number = 32): Uint8Array {
  if (typeof value === 'number') value = BigInt(value);
  const bits = byteWidth * 8;
  if (value >= 2n ** BigInt(bits) || value < 0n)
    throw new Error(`Cannot fit ${value} into a ${bits}-bit unsigned integer.`);
  const result = new Uint8Array(byteWidth);
  for (let i = 0; i < byteWidth; ++i) {
    result[i] = Number((value >> BigInt(bits - i * 8 - 8)) & 0xffn);
  }
  return result;
}

export function signedToBytes(value: bigint | number, byteWidth: number = 32): Uint8Array {
  if (typeof value === 'number') value = BigInt(value);
  const bits = byteWidth * 8;
  if (value >= 2n ** (BigInt(bits) - 1n) || value < -(2n ** (BigInt(bits) - 1n)))
    throw new Error(`Cannot fit ${value} into a ${bits}-bit signed integer.`);
  const unsignedValue = twosComplement(value, bits);
  return unsignedToBytes(unsignedValue);
}

export function twosComplement(value: bigint, numberOfBits: number): bigint {
  const mask = 2n ** (BigInt(numberOfBits) - 1n) - 1n;
  return (value & mask) - (value & ~mask);
}
