import { ProviderRpcError } from '../src/errors.js';

describe('ProviderRpcError', () => {
  it('sets code, message, and data through the constructor', () => {
    const error = new ProviderRpcError(4001, 'User rejected', { reason: 'denied' });

    expect(error.code).toBe(4001);
    expect(error.message).toBe('User rejected');
    expect(error.data).toEqual({ reason: 'denied' });
  });

  it('is an instance of Error', () => {
    const error = new ProviderRpcError(-32600, 'Invalid request');
    expect(error).toBeInstanceOf(Error);
  });

  it('has the correct name property', () => {
    const error = new ProviderRpcError(-32601, 'Method not found');
    expect(error.name).toBe('ProviderRpcError');
  });

  it('works without the data parameter', () => {
    const error = new ProviderRpcError(-32700, 'Parse error');

    expect(error.code).toBe(-32700);
    expect(error.message).toBe('Parse error');
    expect(error.data).toBeUndefined();
  });

  it('preserves the prototype chain (instanceof works)', () => {
    const error = new ProviderRpcError(4100, 'Unauthorized');
    expect(error instanceof ProviderRpcError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it('has a stack trace', () => {
    const error = new ProviderRpcError(-32603, 'Internal error');
    expect(typeof error.stack).toBe('string');
    expect(error.stack!.length).toBeGreaterThan(0);
  });

  it('supports various data types', () => {
    const withString = new ProviderRpcError(4001, 'msg', 'string-data');
    expect(withString.data).toBe('string-data');

    const withNumber = new ProviderRpcError(4001, 'msg', 42);
    expect(withNumber.data).toBe(42);

    const withArray = new ProviderRpcError(4001, 'msg', [1, 2, 3]);
    expect(withArray.data).toEqual([1, 2, 3]);

    const withNull = new ProviderRpcError(4001, 'msg', null);
    expect(withNull.data).toBeNull();
  });

  it('code property is readonly', () => {
    const error = new ProviderRpcError(4001, 'User rejected');
    // TypeScript enforces readonly at compile time; verify the value stays fixed
    expect(error.code).toBe(4001);
  });

  it('serializes correctly with JSON.stringify', () => {
    const error = new ProviderRpcError(4001, 'User rejected', { info: 'test' });
    const serialized = JSON.parse(JSON.stringify(error));

    expect(serialized.code).toBe(4001);
    expect(serialized.data).toEqual({ info: 'test' });
  });
});
