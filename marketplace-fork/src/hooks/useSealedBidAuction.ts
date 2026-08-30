/**
 * React Hook for MidnightShield Auction State Management
 * Handles real-time auction state, bidding, revealing, and settlement
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    MidnightAuctionSDK,
    AuctionState,
    AuctionConfig,
    BidCommitment,
    AuctionResult,
    AuctionCreationParams,
    BidParams,
    RevealParams,
} from '@midnight-shield/auction-sdk';

export interface UseSealedBidAuctionReturn {
    // State
    auctionState: AuctionState | null;
    loading: boolean;
    error: string | null;
    myBidStatus: {
        hasBid: boolean;
        committed: boolean;
        revealed: boolean;
        amount?: bigint;
    } | null;

    // Actions
    createAuction: (params: AuctionCreationParams) => Promise<string>;
    placeBid: (params: BidParams) => Promise<void>;
    revealBid: (params: RevealParams) => Promise<void>;
    settleAuction: () => Promise<void>;
    verifyAuction: (reservePrice: bigint) => Promise<{ valid: boolean; errors: string[] }>;
    refreshState: () => Promise<void>;

    // Computed
    timeRemainingFormatted: string;
    isRevealPhase: boolean;
    isAntiSnipingZone: boolean;
    currentPhase: 'upcoming' | 'bidding' | 'reveal' | 'settled';
}

export function useSealedBidAuction(
    sdk: MidnightAuctionSDK | null,
    auctionId: string | null
): UseSealedBidAuctionReturn {
    const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [myBidStatus, setMyBidStatus] = useState<UseSealedBidAuctionReturn['myBidStatus']>(null);
    const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const sdkRef = useRef(sdk);
    const auctionIdRef = useRef(auctionId);

    // Keep refs updated
    useEffect(() => { sdkRef.current = sdk; }, [sdk]);
    useEffect(() => { auctionIdRef.current = auctionId; }, [auctionId]);

    // ────────────────────────────────────────────────────────────────────────────
    // STATE REFRESH
    // ────────────────────────────────────────────────────────────────────────────

    const refreshState = useCallback(async () => {
        const currentSdk = sdkRef.current;
        const currentAuctionId = auctionIdRef.current;

        if (!currentSdk || !currentAuctionId) return;

        try {
            setLoading(true);
            setError(null);

            const [state, bidStatus] = await Promise.all([
                currentSdk.getAuctionState(currentAuctionId),
                currentSdk.getMyBidStatus(currentAuctionId),
            ]);

            setAuctionState(state);
            setMyBidStatus(bidStatus);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to refresh auction state');
        } finally {
            setLoading(false);
        }
    }, []);

    // ────────────────────────────────────────────────────────────────────────────
    // AUTO-REFRESH
    // ══════════════════════════════════════════════════════════════════════════════

    useEffect(() => {
        if (!auctionIdRef.current || !sdkRef.current) return;

        // Initial fetch
        refreshState();

        // Set up interval (every 10 seconds during active auction)
        const interval = setInterval(() => {
            if (auctionState?.isActive) {
                refreshState();
            }
        }, 10000);

        refreshIntervalRef.current = interval;

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, [auctionId, auctionState?.isActive, refreshState]);

    // ────────────────────────────────────────────────────────────────────────────
    // AUCTION ACTIONS
    // ══════════════════════════════════════════════════════════════════════════════

    const createAuction = useCallback(async (params: AuctionCreationParams): Promise<string> => {
        const currentSdk = sdkRef.current;
        if (!currentSdk) throw new Error('SDK not initialized');

        setLoading(true);
        setError(null);

        try {
            const newAuctionId = await currentSdk.createAuction(params);
            auctionIdRef.current = newAuctionId;
            await refreshState();
            return newAuctionId;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create auction';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [refreshState]);

    const placeBid = useCallback(async (params: BidParams): Promise<void> => {
        const currentSdk = sdkRef.current;
        if (!currentSdk) throw new Error('SDK not initialized');

        setLoading(true);
        setError(null);

        try {
            await currentSdk.placeBid(params);
            await refreshState();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to place bid';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [refreshState]);

    const revealBid = useCallback(async (params: RevealParams): Promise<void> => {
        const currentSdk = sdkRef.current;
        if (!currentSdk) throw new Error('SDK not initialized');

        setLoading(true);
        setError(null);

        try {
            await currentSdk.revealBid(params);
            await refreshState();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to reveal bid';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [refreshState]);

    const settleAuction = useCallback(async (): Promise<void> => {
        const currentSdk = sdkRef.current;
        const currentAuctionId = auctionIdRef.current;
        if (!currentSdk || !currentAuctionId) throw new Error('No auction to settle');

        setLoading(true);
        setError(null);

        try {
            await currentSdk.settleAuction(currentAuctionId);
            await refreshState();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to settle auction';
            setError(msg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [refreshState]);

    const verifyAuction = useCallback(async (reservePrice: bigint) => {
        const currentSdk = sdkRef.current;
        const currentAuctionId = auctionIdRef.current;
        if (!currentSdk || !currentAuctionId) throw new Error('No auction to verify');

        return currentSdk.verifyAuction(currentAuctionId, reservePrice);
    }, []);

    // ────────────────────────────────────────────────────────────────────────────
    // COMPUTED VALUES
    // ══════════════════════════════════════════════════════════════════════════════

    const timeRemainingFormatted = auctionState
        ? formatTimeRemaining(auctionState.timeRemaining)
        : '--:--:--';

    const isRevealPhase = auctionState
        ? !auctionState.isActive && !auctionState.config.settled
        : false;

    const isAntiSnipingZone = auctionState
        ? auctionState.isActive &&
          auctionState.timeRemaining <= auctionState.config.antiSnipingSeconds &&
          !auctionState.isExtended
        : false;

    const currentPhase = auctionState
        ? (auctionState.config.settled ? 'settled'
            : !auctionState.isActive ? 'reveal'
            : auctionState.timeRemaining > 0 ? 'bidding'
            : 'upcoming')
        : 'upcoming';

    return {
        // State
        auctionState,
        loading,
        error,
        myBidStatus,

        // Actions
        createAuction,
        placeBid,
        revealBid,
        settleAuction,
        verifyAuction,
        refreshState,

        // Computed
        timeRemainingFormatted,
        isRevealPhase,
        isAntiSnipingZone,
        currentPhase,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function formatTimeRemaining(seconds: bigint): string {
    const secs = Number(seconds);
    if (secs <= 0) return 'Ended';

    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${remainingSecs}s`;
    if (minutes > 0) return `${minutes}m ${remainingSecs}s`;
    return `${remainingSecs}s`;
}

function formatEth(wei: bigint): string {
    const eth = Number(wei) / 1e18;
    return eth.toFixed(4);
}