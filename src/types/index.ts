export type Trial = {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
};

export interface MulticallElement {
  readonly target: string;
  readonly entrypoint: string;
  readonly calldata: string[];
}

export interface MulticallProps {
  calls: MulticallElement[];
}

export interface EVMFunction {
  readonly type: 'function';
  readonly name: string;
  readonly inputs: ReadonlyArray<ParameterDescription>;
  readonly outputs?: ReadonlyArray<ParameterDescription>;
  readonly stateMutability?: 'pure' | 'view' | 'nonpayable' | 'payable';
}

export interface ParameterDescription {
  readonly name: string;
  readonly type: string;
  readonly internalType?: string;
  readonly components?: ReadonlyArray<ParameterDescription>;
}

export type Encodable = EncodablePrimitive | EncodableTuple | EncodableArray;
export type EncodablePrimitive = Uint8Array | string | boolean | bigint;
export interface EncodableTuple {
  [x: string]: Encodable;
}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EncodableArray extends ReadonlyArray<Encodable> {}

export interface Call {
  entry_point: string;
  contract_address: string;
  calldata: string[]
}
