import { ProviderRpcError } from './errors.js';

export class RpcRouter {
  private nextId = 1;

  constructor(private rpcUrl: string) {}

  async sendToPublicRPC(method: string, params?: unknown[]): Promise<unknown> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method,
        params: params ?? [],
      }),
    });

    if (!response.ok) {
      throw new ProviderRpcError(
        -32603,
        `RPC request failed: ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as {
      result?: unknown;
      error?: { code: number; message: string };
    };

    if (json.error) {
      throw new ProviderRpcError(json.error.code, json.error.message);
    }

    return json.result;
  }
}
