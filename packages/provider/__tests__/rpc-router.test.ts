import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RpcRouter } from '../src/rpc-router.js';
import { ProviderRpcError } from '../src/errors.js';

describe('RpcRouter', () => {
  const RPC_URL = 'https://rpc.example.com';
  let router: RpcRouter;

  beforeEach(() => {
    router = new RpcRouter(RPC_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should send a JSON-RPC request and return the result', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result: '0x1' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const result = await router.sendToPublicRPC('eth_blockNumber');

    expect(result).toBe('0x1');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: [],
      }),
    });
  });

  it('should pass params correctly', async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({ jsonrpc: '2.0', id: 1, result: '0x100' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    const params = ['0xabc123', 'latest'];
    await router.sendToPublicRPC('eth_getBalance', params);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.params).toEqual(params);
  });

  it('should increment request IDs', async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({ jsonrpc: '2.0', id: 1, result: null }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await router.sendToPublicRPC('eth_blockNumber');
    await router.sendToPublicRPC('eth_blockNumber');

    const firstBody = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]!.body as string,
    );
    const secondBody = JSON.parse(
      vi.mocked(fetch).mock.calls[1][1]!.body as string,
    );

    expect(firstBody.id).toBe(1);
    expect(secondBody.id).toBe(2);
  });

  it('should throw ProviderRpcError on HTTP error', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await expect(router.sendToPublicRPC('eth_blockNumber')).rejects.toThrow(
      ProviderRpcError,
    );
    await expect(router.sendToPublicRPC('eth_blockNumber')).rejects.toThrow(
      /500/,
    );
  });

  it('should throw ProviderRpcError on JSON-RPC error response', async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32601, message: 'Method not found' },
        }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await expect(router.sendToPublicRPC('invalid_method')).rejects.toThrow(
      ProviderRpcError,
    );

    try {
      await router.sendToPublicRPC('invalid_method');
    } catch (e) {
      const err = e as ProviderRpcError;
      expect(err.code).toBe(-32601);
      expect(err.message).toBe('Method not found');
    }
  });

  it('should default params to empty array when undefined', async () => {
    const mockResponse = {
      ok: true,
      json: () =>
        Promise.resolve({ jsonrpc: '2.0', id: 1, result: '0x1' }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

    await router.sendToPublicRPC('eth_blockNumber');

    const body = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]!.body as string,
    );
    expect(body.params).toEqual([]);
  });
});
