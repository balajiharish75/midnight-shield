/**
 * MidnightShield — Full Sealed-Bid Auction UI Component
 * Displays auction state, bidding form, reveal phase, and settlement results
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useSealedBidAuction, UseSealedBidAuctionReturn } from '../hooks/useSealedBidAuction';
import { MidnightAuctionSDK, AuctionState, BidCommitment } from '@midnight-shield/auction-sdk';

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface SealedBidAuctionProps {
    sdk: MidnightAuctionSDK;
    auctionId: string;
    currentUserAddress: string;
    isNftSeller?: boolean;
    onAuctionSettled?: (winner: string, finalPrice: bigint) => void;
}

interface BidFormData {
    amount: bigint;
    salt: string;
}

interface AuctionConfigForm {
    nftContractAddress: string;
    nftTokenId: string;
    reservePrice: bigint;
    durationSeconds: number;
    antiSnipingSeconds: number;
    bidIncrement: bigint;
    vickreyMode: boolean;
    eligibilityTreeRoot: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export function SealedBidAuctionUI({
    sdk,
    auctionId,
    currentUserAddress,
    isNftSeller = false,
    onAuctionSettled,
}: SealedBidAuctionProps) {
    const {
        auctionState,
        loading,
        error,
        myBidStatus,
        createAuction,
        placeBid,
        revealBid,
        settleAuction,
        verifyAuction,
        refreshState,
        timeRemainingFormatted,
        isRevealPhase,
        isAntiSnipingZone,
        currentPhase,
    } = useSealedBidAuction(sdk, auctionId);

    // Local UI state
    const [activeTab, setActiveTab] = useState<'bid' | 'reveal' | 'settle' | 'verify'>('bid');
    const [bidAmount, setBidAmount] = useState<string>('');
    const [sellerReservePrice, setSellerReservePrice] = useState<string>('');
    const [verificationResult, setVerificationResult] = useState<{
        valid: boolean;
        errors: string[];
    } | null>(null);
    const [settlementResult, setSettlementResult] = useState<{
        winner: string;
        finalPrice: bigint;
    } | null>(null);
    const [showBidHistory, setShowBidHistory] = useState(false);
    const [errorModal, setErrorModal] = useState<string | null>(null);

    // ────────────────────────────────────────────────────────────────────────────
    // BIDDER FLOW: Place a sealed bid
    // ────────────────────────────────────────────────────────────────────────────

    const handlePlaceBid = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bidAmount) return;

        try {
            const amountWei = BigInt(bidAmount) * 10n ** 18n;
            await placeBid({
                auctionId,
                nftContractAddress: auctionState?.config.nftContractAddress || '',
                nftTokenId: auctionState?.config.nftTokenId || '',
                amount: amountWei,
            });
            setBidAmount('');
            setActiveTab('reveal');
        } catch (err) {
            setErrorModal(err instanceof Error ? err.message : 'Failed to place bid');
        }
    }, [bidAmount, auctionId, auctionState, placeBid]);

    // ────────────────────────────────────────────────────────────────────────────
    // BIDDER FLOW: Reveal the bid
    // ────────────────────────────────────────────────────────────────────────────

    const handleRevealBid = useCallback(async () => {
        try {
            await revealBid({
                auctionId,
                amount: BigInt(bidAmount) * 10n ** 18n,
                salt: '', // salt managed by SDK internally
                signature: '',
            });
            setActiveTab('settle');
        } catch (err) {
            setErrorModal(err instanceof Error ? err.message : 'Failed to reveal bid');
        }
    }, [bidAmount, auctionId, revealBid]);

    // ────────────────────────────────────────────────────────────────────────────
    // SELLER FLOW: Settle the auction
    // ────────────────────────────────────────────────────────────────────────────

    const handleSettleAuction = useCallback(async () => {
        try {
            await settleAuction();
            const result = await verifyAuction(BigInt(sellerReservePrice || '0'));
            setVerificationResult(result);

            if (onAuctionSettled && auctionState?.result) {
                onAuctionSettled(
                    auctionState.result.winnerAddress,
                    auctionState.result.winningBid
                );
            }
        } catch (err) {
            setErrorModal(err instanceof Error ? err.message : 'Failed to settle auction');
        }
    }, [settleAuction, verifyAuction, sellerReservePrice, auctionState, onAuctionSettled]);

    // ────────────────────────────────────────────────────────────────────────────
    // VERIFICATION FLOW
    // ────────────────────────────────────────────────────────────────────────────

    const handleVerifyAuction = useCallback(async () => {
        try {
            const result = await verifyAuction(BigInt(sellerReservePrice || '0'));
            setVerificationResult(result);
        } catch (err) {
            setErrorModal(err instanceof Error ? err.message : 'Failed to verify auction');
        }
    }, [verifyAuction, sellerReservePrice]);

    // ────────────────────────────────────────────────────────────────────────────
    // COMPUTED VALUES
    // ══════════════════════════════════════════════════════════════════════════════

    const formatEth = (wei: bigint) => {
        const eth = Number(wei) / 1e18;
        return eth.toFixed(4);
    };

    const isBiddingPhase = auctionState?.isActive && currentPhase === 'bidding';
    const isRevealPhaseActive = !auctionState?.isActive && !auctionState?.config?.settled;
    const isSettled = auctionState?.config?.settled;
    const isWinner = auctionState?.result?.winnerAddress === currentUserAddress;
    const isHighestBidder = auctionState?.result?.winningBid === myBidStatus?.amount;

    // ────────────────────────────────────────────────────────────────────────────
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════════

    if (!auctionState) {
        return (
            <div className="midnight-shield-loading">
                <div className="loading-spinner" />
                <p>Loading auction state...</p>
            </div>
        );
    }

    return (
        <div className="midnight-shield-auction" data-testid="sealed-bid-auction">
            {/* ── HEADER ─────────────────────────────────────────────────────────── */}
            <header className="auction-header">
                <div className="auction-title">
                    <span className="shield-icon">🛡️</span>
                    <h2>Sealed Bid Auction</h2>
                    <span className={`phase-badge ${currentPhase}`}>
                        {currentPhase.charAt(0).toUpperCase() + currentPhase.slice(1)}
                    </span>
                </div>
                <div className="auction-timer">
                    <span className="timer-label">Time Remaining</span>
                    <span className={`timer-value ${isAntiSnipingZone ? 'anti-sniping' : ''}`}>
                        {timeRemainingFormatted}
                    </span>
                    {isAntiSnipingZone && (
                        <span className="anti-sniping-badge">⚠️ Anti-Sniping Active</span>
                    )}
                </div>
            </header>

            {/* ── NFT PREVIEW ──────────────────────────────────────────────────────── */}
            <section className="nft-preview">
                <div className="nft-image">
                    <img
                        src={`https://nft.example.com/${auctionState.config.nftContractAddress}/${auctionState.config.nftTokenId}.png`}
                        alt="NFT Token"
                    />
                </div>
                <div className="nft-info">
                    <span className="token-id">#{auctionState.config.nftTokenId}</span>
                    <span className="contract-address">
                        {auctionState.config.nftContractAddress.slice(0, 10)}...{auctionState.config.nftContractAddress.slice(-6)}
                    </span>
                </div>
            </section>

            {/* ── AUCTION INFO ──────────────────────────────────────────────────────── */}
            <section className="auction-info-grid">
                <InfoCard
                    label="Total Bids"
                    value={auctionState.totalBids.toString()}
                    icon="🔒"
                />
                <InfoCard
                    label="Highest Bid"
                    value={auctionState.result?.winningBid
                        ? `${formatEth(auctionState.result.winningBid)} ETH`
                        : 'No bids yet'}
                    icon="💰"
                />
                <InfoCard
                    label="Reserve Price"
                    value={auctionState.config.reservePrice
                        ? `${formatEth(auctionState.config.reservePrice)} ETH`
                        : 'None'}
                    icon="📊"
                />
                <InfoCard
                    label="Winner Address"
                    value={auctionState.result?.winnerAddress || 'TBD'}
                    icon="🏆"
                />
            </section>

            {/* ── STATUS MESSAGE ─────────────────────────────────────────────────────── */}
            {errorModal && (
                <div className="error-banner">
                    <span className="error-icon">❌</span>
                    <p>{errorModal}</p>
                    <button onClick={() => setErrorModal(null)} className="dismiss-btn">Dismiss</button>
                </div>
            )}

            {isAntiSnipingZone && (
                <div className="warning-banner">
                    <span className="warning-icon">⏰</span>
                    <p>Anti-sniping extension active! Auction has been extended to prevent last-second bidding.</p>
                </div>
            )}

            {/* ── TAB NAVIGATION ──────────────────────────────────────────────────── */}
            <nav className="auction-tabs">
                <button
                    className={`tab ${activeTab === 'bid' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bid')}
                    disabled={currentPhase !== 'bidding'}
                >
                    🔒 Place Bid
                </button>
                <button
                    className={`tab ${activeTab === 'reveal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reveal')}
                    disabled={currentPhase !== 'reveal'}
                >
                    🔄 Reveal Bid
                </button>
                <button
                    className={`tab ${activeTab === 'settle' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settle')}
                    disabled={currentPhase !== 'settled' && currentPhase !== 'reveal'}
                >
                    ⚡ Settle Auction
                </button>
                <button
                    className={`tab ${activeTab === 'verify' ? 'active' : ''}`}
                    onClick={() => setActiveTab('verify')}
                >
                    ✅ Verify Proof
                </button>
            </nav>

            {/* ── TAB CONTENT ─────────────────────────────────────────────────────── */}
            <div className="tab-content">
                {/* ── BID TAB ─────────────────────────────────────────────────────────── */}
                {activeTab === 'bid' && (
                    <form onSubmit={handlePlaceBid} className="bid-form">
                        <h3>Place Your Sealed Bid</h3>
                        <p className="bid-instructions">
                            Enter your maximum bid amount in ETH. Your bid will be encrypted and
                            submitted as a zero-knowledge commitment. No one can see your bid
                            until the reveal phase.
                        </p>

                        <div className="form-group">
                            <label htmlFor="bidAmount">Bid Amount (ETH)</label>
                            <input
                                type="number"
                                id="bidAmount"
                                value={bidAmount}
                                onChange={(e) => setBidAmount(e.target.value)}
                                placeholder="0.00"
                                step="0.001"
                                min="0.001"
                                required
                                disabled={!isBiddingPhase || myBidStatus?.hasBid}
                            />
                        </div>

                        <div className="form-actions">
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={!isBiddingPhase || myBidStatus?.hasBid || loading}
                            >
                                {loading ? 'Encrypting & Submitting...' : '🔐 Place Sealed Bid'}
                            </button>
                        </div>

                        {myBidStatus?.hasBid && (
                            <div className="success-banner">
                                <span className="success-icon">✅</span>
                                <p>You have already placed a sealed bid. Wait for the reveal phase to submit your bid publicly.</p>
                            </div>
                        )}

                        <div className="bid-features">
                            <div className="feature">
                                <span className="feature-icon">🔒</span>
                                <div>
                                    <h4>Zero-Knowledge Privacy</h4>
                                    <p>Your bid amount is cryptographically hidden until you reveal it.</p>
                                </div>
                            </div>
                            <div className="feature">
                                <span className="feature-icon">🛡️</span>
                                <div>
                                    <h4>Fraud-Proof</h4>
                                    <p>ZK proofs ensure you can only bid funds you actually possess.</p>
                                </div>
                            </div>
                            <div className="feature">
                                <span className="feature-icon">🔄</span>
                                <div>
                                    <h4>Automatic Refunds</h4>
                                    <p>Losing bids are automatically refunded after settlement.</p>
                                </div>
                            </div>
                        </div>
                    </form>
                )}

                {/* ── REVEAL TAB ──────────────────────────────────────────────────────── */}
                {activeTab === 'reveal' && (
                    <div className="reveal-phase">
                        <h3>Reveal Your Bid</h3>
                        <p className="reveal-instructions">
                            The bidding phase has ended. Submit your bid amount publicly to
                            enter the settlement phase. This generates a ZK proof that
                            validates your commitment without revealing additional information.
                        </p>

                        <div className="reveal-status">
                            <div className="status-item">
                                <span className="status-label">Your Sealed Bid:</span>
                                <span className="status-value">🔒 Encrypted</span>
                            </div>
                            <div className="status-item">
                                <span className="status-label">Status:</span>
                                <span className="status-value">
                                    {myBidStatus?.revealed ? '✅ Revealed' : '⏳ Awaiting Reveal'}
                                </span>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button
                                onClick={handleRevealBid}
                                className="btn btn-primary"
                                disabled={!isRevealPhase || myBidStatus?.revealed || loading}
                            >
                                {loading ? 'Generating ZK Proof...' : '🔓 Reveal My Bid'}
                            </button>
                        </div>

                        {myBidStatus?.revealed && (
                            <div className="success-banner">
                                <span className="success-icon">✅</span>
                                <p>Your bid has been revealed and validated with a zero-knowledge proof.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── SETTLE TAB ──────────────────────────────────────────────────────── */}
                {activeTab === 'settle' && (
                    <div className="settle-phase">
                        <h3>Auction Settlement</h3>
                        <p className="settle-instructions">
                            {isNftSeller
                                ? 'The auction has ended. As the seller, you can now settle the auction to transfer the NFT to the winner and release funds.'
                                : 'The auction has ended. Settlement transfers the NFT to the highest bidder and releases funds to the seller.'}
                        </p>

                        <div className="settle-details">
                            <div className="detail-item">
                                <span className="detail-label">Winner:</span>
                                <span className="detail-value">
                                    {auctionState.result?.winnerAddress || 'No winner'}
                                </span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Winning Bid:</span>
                                <span className="detail-value">
                                    {auctionState.result?.winningBid
                                        ? `${formatEth(auctionState.result.winningBid)} ETH`
                                        : 'No winning bid'}
                                </span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Settlement Status:</span>
                                <span className={`detail-value ${isSettled ? 'success' : 'pending'}`}>
                                    {isSettled ? '✅ Completed' : '⏳ Pending Settlement'}
                                </span>
                            </div>
                        </div>

                        {isNftSeller && !isSettled && (
                            <div className="form-actions">
                                <button
                                    onClick={handleSettleAuction}
                                    className="btn btn-primary"
                                    disabled={loading}
                                >
                                    {loading ? 'Processing Settlement...' : '⚡ Settle Auction Now'}
                                </button>
                            </div>
                        )}

                        {verificationResult && (
                            <div className={`verification-result ${verificationResult.valid ? 'valid' : 'invalid'}`}>
                                <h4>Verification Result</h4>
                                <p>{verificationResult.valid ? '✅ All proofs verified successfully' : '❌ Verification failed'}</p>
                                {verificationResult.errors.length > 0 && (
                                    <ul className="error-list">
                                        {verificationResult.errors.map((err, idx) => (
                                            <li key={idx} className="error-item">{err}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {isWinner && isSettled && (
                            <div className="success-banner winner-banner">
                                <span className="success-icon">🏆</span>
                                <h4>Congratulations! You won this auction!</h4>
                                <p>The NFT has been transferred to your wallet. Check your NFT collection.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── VERIFY TAB ──────────────────────────────────────────────────────── */}
                {activeTab === 'verify' && (
                    <div className="verify-phase">
                        <h3>Verify Auction Integrity</h3>
                        <p className="verify-instructions">
                            Publicly verify the auction was conducted fairly. This checks all
                            bid commitments, ZK proofs, and settlement logic.
                        </p>

                        <div className="verify-features">
                            <div className="verify-feature">
                                <span className="verify-icon">🔍</span>
                                <div>
                                    <h4>Commitment Verification</h4>
                                    <p>Check all bid commitments are valid ZK proofs</p>
                                </div>
                            </div>
                            <div className="verify-feature">
                                <span className="verify-icon">🎯</span>
                                <div>
                                    <h4>Winner Selection</h4>
                                    <p>Verify the highest bid was correctly selected</p>
                                </div>
                            </div>
                            <div className="verify-feature">
                                <span className="verify-icon">💸</span>
                                <div>
                                    <h4>Fund Distribution</h4>
                                    <p>Confirm funds are properly allocated</p>
                                </div>
                            </div>
                        </div>

                        <div className="form-actions">
                            <button
                                onClick={handleVerifyAuction}
                                className="btn btn-primary"
                                disabled={loading}
                            >
                                {loading ? 'Verifying...' : '✅ Verify Auction Proof'}
                            </button>
                        </div>

                        {verificationResult && (
                            <div className={`verification-result ${verificationResult.valid ? 'valid' : 'invalid'}`}>
                                <h4>Verification Result</h4>
                                <p>{verificationResult.valid ? '✅ All proofs verified successfully' : '❌ Verification failed'}</p>
                                {verificationResult.errors.length > 0 && (
                                    <ul className="error-list">
                                        {verificationResult.errors.map((err, idx) => (
                                            <li key={idx} className="error-item">{err}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── FOOTER ─────────────────────────────────────────────────────────────── */}
            <footer className="auction-footer">
                <div className="footer-info">
                    <span className="shield-icon">🛡️</span>
                    <span>Powered by MidnightShield — ZK Privacy Protocol</span>
                </div>
                <div className="footer-links">
                    <a href="#faq" className="footer-link">FAQ</a>
                    <a href="#docs" className="footer-link">Documentation</a>
                    <a href="#verify" className="footer-link">Verify on-chain</a>
                </div>
            </footer>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function InfoCard({ label, value, icon }: { label: string; value: string; icon: string }) {
    return (
        <div className="info-card">
            <span className="info-icon">{icon}</span>
            <span className="info-label">{label}</span>
            <span className="info-value">{value}</span>
        </div>
    );
}