/**
 * MidnightShield Auction SDK - Circuit Wrappers
 * TypeScript bindings for Midnight ZK circuits
 */

import { MidnightClient, ZKProof, CircuitInput, CircuitOutput } from '@midnight-ntwrk/midnight-js-sdk';

// ══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════

export interface BidInput {
    bidder: string;
    amount: bigint;
    valid: boolean;
    commitment: string;
}

export interface RevealInput {
    commitment: string;
    amount: bigint;
    salt: Uint8Array;
    bidder: string;
    signature: Uint8Array;
}

export interface RefundOutput {
    bidder: string;
    amount: bigint;
}

export interface AuctionConfig {
    auctionId: string;
    nftContract: string;
    nftTokenId: bigint;
    seller: string;
    minBid: bigint;
    reservePriceCommitment: string;
    reserveSalt: Uint8Array;
    durationSeconds: bigint;
    antiSnipingSeconds: bigint;
    auctionType: number; // 0 = first-price, 1 = vickrey
    bidderEligibilityRoot: string;
    createdAt: bigint;
    settled: boolean;
    extended: boolean;
}

export interface BidCommitment {
    bidder: string;
    amountCommitment: string;
    amountSalt: Uint8Array;
    nftContract: string;
    nftTokenId: bigint;
    deadline: bigint;
    revealed: boolean;
    bidAmount: bigint;
    zkFundsProof: Uint8Array;
    eligibilityProof: Uint8Array;
}

export interface AuctionResult {
    winner: string;
    winningBid: bigint;
    secondHighestBid: bigint;
    reserveMet: boolean;
    totalBids: number;
    settledAt: bigint;
}

export interface BalanceProof {
    proof: Uint8Array;
    publicInputs: {
        minAmount: bigint;
    };
}

export interface EligibilityProof {
    proof: Uint8Array;
    merkleRoot: string;
    merkleProof: Uint8Array[];
}

export interface CommitBidResult {
    commitment: string;
    proof: ZKProof;
    valid: boolean;
}

export interface RevealBidResult {
    valid: boolean;
    bidAmount: bigint;
}

export interface SettleAuctionResult {
    winner: string;
    winningBid: bigint;
    secondHighestBid: bigint;
    reserveMet: boolean;
    totalValidBids: number;
}

export interface VerifyReserveResult {
    reserveMet: boolean;
}

export interface ProcessRefundsResult {
    refunds: RefundOutput[];
}

export interface VerifyAuctionResult {
    valid: boolean;
    errors: string[];
}

// ══════════════════════════════════════════════════════════════════════════════
// CIRCUIT WRAPPER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class AuctionCircuits {
    constructor(private midnight: MidnightClient) {}

    // ────────────────────────────────────────────────────────────────────────────
    // Circuit: commit_bid
    // Proves bidder has sufficient funds without revealing balance
    // ────────────────────────────────────────────────────────────────────────────
    async commitBid(params: {
        bidAmount: bigint;
        amountSalt: Uint8Array;
        bidderBalance: bigint;
        balanceProof: BalanceProof;
        nftContract: string;
        nftTokenId: bigint;
        deadline: bigint;
        auctionId: string;
        eligibilityProof?: EligibilityProof;
    }): Promise<CommitBidResult> {
        const { proof, publicOutput } = await this.midnight.executeCircuit<CircuitOutput>('commit_bid', {
            bid_amount: params.bidAmount,
            amount_salt: params.amountSalt,
            bidder_balance: params.bidderBalance,
            bidder_balance_proof: params.balanceProof,
            nft_contract: params.nftContract,
            nft_token_id: params.nftTokenId,
            deadline: params.deadline,
            auction_id: params.auctionId,
            eligibility_proof: params.eligibilityProof?.proof || new Uint8Array(),
            eligibility_root: params.eligibilityProof?.merkleRoot || '0x0',
        } as CircuitInput);

        return {
            commitment: publicOutput.commitment as string,
            proof,
            valid: publicOutput.valid as boolean,
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Circuit: reveal_bid
    // Verifies commitment matches revealed amount
    // ────────────────────────────────────────────────────────────────────────────
    async revealBid(params: {
        bidAmount: bigint;
        amountSalt: Uint8Array;
        signature: Uint8Array;
        commitment: string;
        auctionId: string;
        deadline: bigint;
        currentTime: bigint;
    }): Promise<RevealBidResult> {
        const { publicOutput } = await this.midnight.executeCircuit<CircuitOutput>('reveal_bid', {
            bid_amount: params.bidAmount,
            amount_salt: params.amountSalt,
            bidder_signature: params.signature,
            commitment: params.commitment,
            auction_id: params.auctionId,
            deadline: params.deadline,
            current_time: params.currentTime,
        } as CircuitInput);

        return {
            valid: publicOutput.valid as boolean,
            bidAmount: publicOutput.bid_amount_out as bigint,
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Circuit: verify_reserve
    // Proves winning bid >= reserve without revealing reserve
    // ────────────────────────────────────────────────────────────────────────────
    async verifyReserve(params: {
        reservePrice: bigint;
        reserveSalt: Uint8Array;
        reserveCommitment: string;
        winningBid: bigint;
    }): Promise<VerifyReserveResult> {
        const { publicOutput } = await this.midnight.executeCircuit<CircuitOutput>('verify_reserve', {
            reserve_price: params.reservePrice,
            reserve_salt: params.reserveSalt,
            reserve_commitment: params.reserveCommitment,
            winning_bid: params.winningBid,
        } as CircuitInput);

        return {
            reserveMet: publicOutput.reserve_met as boolean,
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Circuit: settle_auction
    // Computes winner and payment amount in ZK (first-price or Vickrey)
    // ────────────────────────────────────────────────────────────────────────────
    async settleAuction(params: {
        bids: BidInput[];
        auctionId: string;
        minBid: bigint;
        auctionType: number;
        reserveCommitment: string;
        reserveSalt: Uint8Array;
    }): Promise<SettleAuctionResult> {
        const { publicOutput } = await this.midnight.executeCircuit<CircuitOutput>('settle_auction', {
            bids: params.bids,
            auction_id: params.auctionId,
            min_bid: params.minBid,
            auction_type: params.auctionType,
            reserve_commitment: params.reserveCommitment,
            reserve_salt: params.reserveSalt,
        } as CircuitInput);

        return {
            winner: publicOutput.winner as string,
            winningBid: publicOutput.winning_bid as bigint,
            secondHighestBid: publicOutput.second_highest_bid as bigint,
            reserveMet: publicOutput.reserve_met as boolean,
            totalValidBids: publicOutput.total_valid_bids as number,
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Circuit: process_refunds
    // Automatic private refunds for losing bidders
    // ────────────────────────────────────────────────────────────────────────────
    async processRefunds(params: {
        bids: BidInput[];
        winner: string;
        winningBid: bigint;
        auctionId: string;
    }): Promise<ProcessRefundsResult> {
        const { publicOutput } = await this.midnight.executeCircuit<CircuitOutput>('process_refunds', {
            bids: params.bids,
            winner: params.winner,
            winning_bid: params.winningBid,
            auction_id: params.auctionId,
        } as CircuitInput);

        return {
            refunds: publicOutput.refunds as RefundOutput[],
        };
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Circuit: verify_auction
    // Public verification that auction was conducted fairly
    // ────────────────────────────────────────────────────────────────────────────
    async verifyAuction(params: {
        auctionId: string;
        allCommitments: string[];
        allReveals: RevealInput[];
        winner: string;
        winningBid: bigint;
        secondHighestBid: bigint;
        reserveCommitment: string;
        reserveSalt: Uint8Array;
        reservePrice: bigint;
        minBid: bigint;
        auctionType: number;
    }): Promise<VerifyAuctionResult> {
        const { publicOutput } = await this.midnight.executeCircuit<CircuitOutput>('verify_auction', {
            auction_id: params.auctionId,
            all_commitments: params.allCommitments,
            all_reveals: params.allReveals,
            winner: params.winner,
            winning_bid: params.winningBid,
            second_highest_bid: params.secondHighestBid,
            reserve_commitment: params.reserveCommitment,
            reserve_salt: params.reserveSalt,
            reserve_price: params.reservePrice,
            min_bid: params.minBid,
            auction_type: params.auctionType,
        } as CircuitInput);

        return {
            valid: publicOutput.valid as boolean,
            errors: publicOutput.errors as string[],
        };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

export function generateSalt(): Uint8Array {
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
    return salt;
}

export function computeCommitment(
    amount: bigint,
    salt: Uint8Array,
    nftContract: string,
    nftTokenId: bigint,
    deadline: bigint
): string {
    // In production, this uses Midnight's hash function
    // Here we simulate with a placeholder
    const data = new Uint8Array(
        8 + 32 + nftContract.length + 8 + 8
    );
    let offset = 0;

    // amount (8 bytes, little-endian)
    new DataView(data.buffer).setBigUint64(offset, amount, true);
    offset += 8;

    // salt (32 bytes)
    data.set(salt, offset);
    offset += 32;

    // nftContract
    const contractBytes = new TextEncoder().encode(nftContract);
    data.set(contractBytes, offset);
    offset += contractBytes.length;

    // nftTokenId (8 bytes)
    new DataView(data.buffer).setBigUint64(offset, nftTokenId, true);
    offset += 8;

    // deadline (8 bytes)
    new DataView(data.buffer).setBigUint64(offset, deadline, true);

    // Hash (placeholder - use blake3 in production)
    return '0x' + Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 64);
}

export function signRevealMessage(
    auctionId: string,
    commitment: string,
    amount: bigint,
    privateKey: Uint8Array
): Uint8Array {
    const message = new TextEncoder().encode(
        `reveal:${auctionId}:${commitment}:${amount.toString()}`
    );
    // In production, use secp256k1 signing
    // This is a placeholder
    return new Uint8Array(65);
}

export function createBalanceProof(
    actualBalance: bigint,
    minimumAmount: bigint
): BalanceProof {
    // In production, this generates a real ZK proof
    // Placeholder structure
    return {
        proof: new Uint8Array(192), // Groth16 proof size
        publicInputs: { minAmount: minimumAmount },
    };
}

export function createEligibilityProof(
    merkleRoot: string,
    merkleProof: Uint8Array[],
    leafData: Uint8Array
): EligibilityProof {
    // In production, this generates a Merkle proof circuit proof
    return {
        proof: new Uint8Array(192),
        merkleRoot,
        merkleProof,
    };
}