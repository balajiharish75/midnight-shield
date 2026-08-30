declare module '@midnight-ntwrk/midnight-js-sdk' {
  export class MidnightClient {
    constructor(opts: any);
    getAddress(): Promise<string>;
    getPrivateKey(): Promise<Uint8Array>;
    submitTransaction(method: string, args: any[]): Promise<TransactionResult>;
    callContractView(method: string, args: any[]): Promise<any>;
    getEvents(event: string, filter: any): Promise<any[]>;
    onEvent(event: string, cb: (e:any)=>void): () => void;
    executeCircuit<T>(name: string, args: any): Promise<{ proof: ZKProof; publicOutput: any } & T>;
    connect(): Promise<void>;
  }
  export interface ZKProof { proof: Uint8Array }
  export interface TransactionResult { hash: string }
  export type CircuitInput = any;
  export type CircuitOutput = any;
}
