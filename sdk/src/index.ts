/**
 * MidnightShield Auction SDK - Main Entry Point
 * Complete bidder/seller/marketplace flows for privacy-preserving auctions
 */

import { MidnightClient, ZKProof, TransactionResult } from '@midnight-ntwrk/midnight-js-sdk';
import {
    AuctionCircuits,
    AuctionConfig,
    BidCommitment,
    AuctionResult,
    BidInput,
    RevealInput,
    RefundOutput,
    CommitBidResult,
    BalanceProof,
    EligibilityProof,
    generateSalt,
    computeCommitment,
    signRevealMessage,
    createBalanceProof,
    createEligibilityProof,
} from './circuits';

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SDK CLASS
// ══════════════════════════════════════════════════════════════════════════════

export interface AuctionCreationParams {
    nftContract: string;
    nftTokenId: bigint;
    minBid: bigint;
    reservePrice: bigint;
    durationSeconds: number;
    antiSnipingSeconds?: number;
    auctionType?: 'first-price' | 'vickrey';
    bidderEligibilityRoot?: string;
}

export interface BidParams {
    auctionId: string;
    amount: bigint;
    // Optional: custom salt (auto-generated if not provided)
    salt?: Uint8Array;
    // Optional: eligibility proof for restricted auctions
    eligibilityProof?: EligibilityProof;
}

export interface RevealParams {
    auctionId: string;
    commitment: string;
    amount: bigint;
    salt: Uint8Array;
}

export interface AuctionState {
    config: AuctionConfig;
    bids: BidCommitment[];
    timeRemaining: bigint;
    isActive: boolean;
    isExtended: boolean;
    result?: AuctionResult;
}

export type AuctionType = 'first-price' | 'vickrey';

export class MidnightAuctionSDK {
    private circuits: AuctionCircuits;
    private contractAddress: string;

    constructor(
        private midnight: MidnightClient,
        contractAddress: string
    ) {
        this.contractAddress = contractAddress;
        this.circuits = new AuctionCircuits(midnight);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SELLER / MARKETPLACE FLOWS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Create a new privacy-preserving auction
     * Returns auction ID for tracking
     */
    async createAuction(params: AuctionCreationParams): Promise<string> {
        const caller = await this.midnight.getAddress();
        const now = BigInt(Math.floor(Date.now() / 1000));

        // Generate reserve salt and commitment
        const reserveSalt = generateSalt();
        const reserveCommitment = computeCommitment(
            params.reservePrice,
            reserveSalt,
            '', // nftContract not needed for reserve commitment
            0n,
            0n
        );

        // Submit transaction to create auction
        const tx = await this.midnight.submitTransaction('create_auction', [
            params.nftContract,
            params.nftTokenId,
            params.minBid,
            params.reservePrice,
            reserveSalt,
            BigInt(params.durationSeconds),
            BigInt(params.antiSnipingSeconds || 120),
            params.auctionType === 'vickrey' ? 1 : 0,
            params.bidderEligibilityRoot || '0x0',
        ]);

        // Extract auction ID from transaction events
        const auctionId = await this.extractAuctionIdFromTx(tx);
        return auctionId;
    }

    /**
     * Settle auction and process automatic refunds
     * Can be called by seller after deadline, or by anyone after deadline passes
     */
    async settleAuction(auctionId: string): Promise<AuctionResult> {
        const tx = await this.midnight.submitTransaction('settle_auction', [auctionId]);
        return this.waitForSettlement(auctionId);
    }

    /**
     * Get full auction state including bids and timing
     */
    async getAuctionState(auctionId: string): Promise<AuctionState> {
        const [config, bids, timeRemaining, isActive] = await Promise.all([
            this.getAuctionConfig(auctionId),
            this.getAuctionBids(auctionId),
            this.getTimeRemaining(auctionId),
            this.isAuctionActive(auctionId),
        ]);

        let result: AuctionResult | undefined;
        if (!isActive && config.settled) {
            result = await this.getAuctionResult(auctionId);
        }

        return {
            config,
            bids,
            timeRemaining,
            isActive,
            isExtended: config.extended,
            result,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BIDDER FLOWS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Place a sealed bid with ZK proof of sufficient funds
     * Funds are locked in escrow until settlement
     */
    async placeBid(params: BidParams): Promise<{ commitment: string; proof: ZKProof }> {
        const caller = await this.midnight.getAddress();
        const salt = params.salt || generateSalt();
        const auction = await this.getAuctionConfig(params.auctionId);

        // 1. Generate ZK proof of sufficient funds (without revealing balance)
        const balanceProof = await this.generateFundsProof(caller, params.amount);

        // 2. Compute commitment locally
        const deadline = auction.createdAt + auction.durationSeconds +
            (auction.extended ? auction.antiSnipingSeconds : 0n);
        const commitment = computeCommitment(
            params.amount,
            salt,
            auction.nftContract,
            auction.nftTokenId,
            deadline
        );

        // 3. Execute commit_bid circuit
        const commitResult = await this.circuits.commitBid({
            bidAmount: params.amount,
            amountSalt: salt,
            bidderBalance: 0n, // Private - not sent to circuit
            balanceProof,
            nftContract: auction.nftContract,
            nftTokenId: auction.nftTokenId,
            deadline,
            auctionId: params.auctionId,
            eligibilityProof: params.eligibilityProof,
        });

        // 4. Submit commitment to Midnight ledger (locks funds in escrow)
        await this.midnight.submitTransaction('submit_commitment', [
            params.auctionId,
            commitResult.commitment,
            commitResult.proof,
            params.eligibilityProof?.proof || new Uint8Array(),
        ]);

        // 5. Store salt locally for reveal phase (CRITICAL - never share!)
        this.storeBidSecret(params.auctionId, commitment, {
            amount: params.amount,
            salt,
        });

        return { commitment: commitResult.commitment, proof: commitResult.proof };
    }

    /**
     * Reveal bid during reveal phase
     * Must be called after auction deadline
     */
    async revealBid(params: RevealParams): Promise<void> {
        const caller = await this.midnight.getAddress();
        const auction = await this.getAuctionConfig(params.auctionId);

        // 1. Sign reveal message
        const signature = signRevealMessage(
            params.auctionId,
            params.commitment,
            params.amount,
            await this.midnight.getPrivateKey()
        );

        // 2. Submit reveal transaction
        await this.midnight.submitTransaction('reveal_bid', [
            params.auctionId,
            params.commitment,
            params.amount,
            params.salt,
            signature,
        ]);

        // 3. Clear local secret
        this.clearBidSecret(params.auctionId, params.commitment);
    }

    /**
     * Get user's bid status for an auction
     */
    async getMyBidStatus(auctionId: string): Promise<{
        hasBid: boolean;
        committed: boolean;
        revealed: boolean;
        amount?: bigint;
        commitment?: string;
    }> {
        const caller = await this.midnight.getAddress();
        const bids = await this.getAuctionBids(auctionId);

        const myBid = bids.find(b => b.bidder === caller);
        if (!myBid) return { hasBid: false, committed: false, revealed: false };

        const secret = this.getBidSecret(auctionId, myBid.amountCommitment);
        return {
            hasBid: true,
            committed: true,
            revealed: myBid.revealed,
            amount: myBid.revealed ? myBid.bidAmount : (secret?.amount),
            commitment: myBid.amountCommitment,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PUBLIC VERIFICATION
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Verify auction integrity publicly
     * Anyone can call this to prove auction was fair
     */
    async verifyAuction(
        auctionId: string,
        revealedReservePrice: bigint
    ): Promise<{ valid: boolean; errors: string[] }> {
        const config = await this.getAuctionConfig(auctionId);
        const bids = await this.getAuctionBids(auctionId);

        // Collect all commitments and reveals
        const allCommitments = bids.map(b => b.amountCommitment);
        const allReveals: RevealInput[] = bids
            .filter(b => b.revealed)
            .map(b => ({
                commitment: b.amountCommitment,
                amount: b.bidAmount,
                salt: b.amountSalt,
                bidder: b.bidder,
                signature: new Uint8Array(), // Would be recovered from events
            }));

        // Get settlement result from events
        const result = await this.getAuctionResult(auctionId);

        return this.circuits.verifyAuction({
            auctionId,
            allCommitments,
            allReveals,
            winner: result.winner,
            winningBid: result.winningBid,
            secondHighestBid: result.secondHighestBid,
            reserveCommitment: config.reservePriceCommitment,
            reserveSalt: config.reserveSalt,
            reservePrice: revealedReservePrice,
            minBid: config.minBid,
            auctionType: config.auctionType,
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MARKETPLACE INTEGRATION HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Event listener for marketplace relayer
     * Listens for AuctionSettled events to execute NFT transfers
     */
    onAuctionSettled(callback: (result: AuctionResult) => void): () => void {
        return this.midnight.onEvent('AuctionSettled', (event) => {
            callback({
                winner: event.winner,
                winningBid: event.winning_bid,
                secondHighestBid: event.second_highest_bid,
                reserveMet: event.reserve_met,
                totalBids: event.total_bids,
                settledAt: event.settled_at,
            });
        });
    }

    /**
     * Execute NFT transfer after settlement (called by marketplace relayer)
     */
    async executeNftTransfer(
        auctionId: string,
        winner: string,
        marketplaceContract: string
    ): Promise<TransactionResult> {
        // This calls the marketplace contract to transfer NFT
        // The marketplace contract should verify the AuctionSettled event
        return this.midnight.submitTransaction(
            'marketplace_transfer_nft',
            [auctionId, winner, marketplaceContract]
        );
    }

    /**
     * Get analytics without revealing individual bids
     * Privacy-preserving aggregate statistics
     */
    async getAuctionAnalytics(auctionId: string): Promise<{
        totalEligibleBidders: number;
        totalBidsReceived: number;
        uniqueBidders: number;
        bidsAboveReserve: number;
        averageBidAboveReserve: bigint;
        bidDistribution: { range: string; count: number }[];
    }> {
        const bids = await this.getAuctionBids(auctionId);
        const config = await this.getAuctionConfig(auctionId);

        const revealedBids = bids.filter(b => b.revealed);
        const validBids = revealedBids.filter(b => b.bidAmount >= config.minBid);

        // In production, this would use a ZK analytics circuit
        // Here we compute locally (only for demo - real version uses ZK)
        return {
            totalEligibleBidders: 0, // Would come from eligibility merkle tree
            totalBidsReceived: bids.length,
            uniqueBidders: new Set(bids.map(b => b.bidder)).size,
            bidsAboveReserve: validBids.length,
            averageBidAboveReserve: validBids.length > 0
                ? validBids.reduce((sum, b) => sum + b.bidAmount, 0n) / BigInt(validBids.length)
                : 0n,
            bidDistribution: this.computeBidDistribution(validBids),
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    private async getAuctionConfig(auctionId: string): Promise<AuctionConfig> {
        return this.midnight.callContractView('get_auction', [auctionId]);
    }

    private async getAuctionBids(auctionId: string): Promise<BidCommitment[]> {
        return this.midnight.callContractView('get_auction_bids', [auctionId]);
    }

    private async getTimeRemaining(auctionId: string): Promise<bigint> {
        return this.midnight.callContractView('get_time_remaining', [auctionId]);
    }

    private async isAuctionActive(auctionId: string): Promise<boolean> {
        return this.midnight.callContractView('is_auction_active', [auctionId]);
    }

    private async getAuctionResult(auctionId: string): Promise<AuctionResult> {
        // Read from AuctionSettled event
        const events = await this.midnight.getEvents('AuctionSettled', { auction_id: auctionId });
        const event = events[0];
        return {
            winner: event.winner,
            winningBid: event.winning_bid,
            secondHighestBid: event.second_highest_bid,
            reserveMet: event.reserve_met,
            totalBids: event.total_bids,
            settledAt: event.settled_at,
        };
    }

    private async extractAuctionIdFromTx(tx: TransactionResult): Promise<string> {
        const events = await this.midnight.getEvents('AuctionCreated', { tx_hash: tx.hash });
        return events[0]?.auction_id || '';
    }

    private async generateFundsProof(address: string, amount: bigint): Promise<BalanceProof> {
        // In production: query actual balance, generate ZK proof
        // For demo: return mock proof
        return createBalanceProof(0n, amount);
    }

    // Local storage for bid secrets (in production, use secure enclave)
    private bidSecrets: Map<string, Map<string, { amount: bigint; salt: Uint8Array }>> = new Map();

    private storeBidSecret(auctionId: string, commitment: string, secret: { amount: bigint; salt: Uint8Array }): void {
        if (!this.bidSecrets.has(auctionId)) {
            this.bidSecrets.set(auctionId, new Map());
        }
        this.bidSecrets.get(auctionId)!.set(commitment, secret);
    }

    private getBidSecret(auctionId: string, commitment: string): { amount: bigint; salt: Uint8Array } | undefined {
        return this.bidSecrets.get(auctionId)?.get(commitment);
    }

    private clearBidSecret(auctionId: string, commitment: string): void {
        this.bidSecrets.get(auctionId)?.delete(commitment);
    }

    private waitForSettlement(auctionId: string): Promise<AuctionResult> {
        return new Promise((resolve) => {
            const cleanup = this.onAuctionSettled((result) => {
                if (result.winner !== '0x0' || result.winningBid === 0n) {
                    cleanup();
                    resolve(result);
                }
            });
        });
    }

    private computeBidDistribution(bids: BidCommitment[]): { range: string; count: number }[] {
        if (bids.length === 0) return [];

        const amounts = bids.map(b => b.bidAmount).sort((a, b) => Number(a - b));
        const min = amounts[0];
        const max = amounts[amounts.length - 1];
        const range = (max - min) / 5n || 1n;

        const buckets = new Map<string, number>();
        for (const amount of amounts) {
            const bucket = (amount - min) / range;
            const key = `${min + bucket * range} - ${min + (bucket + 1n) * range}`;
            buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        return Array.from(buckets.entries()).map(([range, count]) => ({ range, count }));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

export async function createMidnightAuctionSDK(
    midnightRpcUrl: string,
    contractAddress: string
): Promise<MidnightAuctionSDK> {
    const midnight = new MidnightClient({ rpcUrl: midnightRpcUrl });
    await midnight.connect();
    return new MidnightAuctionSDK(midnight, contractAddress);
}

// ══════════════════════════════════════════════════════════════════════════════
// REACT HOOK (for marketplace-fork)
// ══════════════════════════════════════════════════════════════════════════════

export function createAuctionSDKHook() {
    let sdkInstance: MidnightAuctionSDK | null = null;

    return {
        async initialize(midnightRpcUrl: string, contractAddress: string) {
            sdkInstance = await createMidnightAuctionSDK(midnightRpcUrl, contractAddress);
            return sdkInstance;
        },
        getSDK(): MidnightAuctionSDK | null {
            return sdkInstance;
        },
    };
}