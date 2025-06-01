interface CallObject {
  contractAddress: string;
  entrypoint: string;
  calldata: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const validateCallParams = (value: any): value is CallObject[] => {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        'contractAddress' in item &&
        'entrypoint' in item &&
        'calldata' in item
    )
  );
};
