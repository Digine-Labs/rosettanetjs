import { add } from '../src/index';

describe('index', () => {
  it('should return 1', () => {
    let result = add(1, 0);
    expect(result).toBe(1);
  });
});
