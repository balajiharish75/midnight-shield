# MidnightShield Demo Script

**Duration:** 3 minutes  
**Platform:** VS Code with browser preview + terminal

---

## 0:00-0:15 — Hook (Problem Statement)

*[Show marketplace UI with auction listing]*

"Traditional NFT auctions expose everything: bid amounts, bidder identities, reserve prices. Bidders get sniped, whales get targeted, and sellers lose leverage. MidnightShield fixes this with zero-knowledge privacy."

---

## 0:15-0:45 — Feature 1: Private Sealed Bids (P0)

*[Open terminal, run SDK example]*

```typescript
// Bidder commits encrypted bid — nobody sees the amount
const commitment = await auction.placeBid({
  nftId: 1,
  amount: 5000,           // Private!
  bidderIdentity: wallet,
});
console.log("Commitment:", commitment);
```

*[Show commitment hash in terminal]*

"The bid is cryptographically sealed. The blockchain sees only a hash. No one—not the seller, not other bidders, not even the network—knows what you bid."

---

## 0:45-1:15 — Feature 2: ZK Funds Proof (P0)

*[Show commitment with proof]*

```typescript
// ZK proof: "I have ≥5000 DUST without revealing my balance"
const fundsProof = await proveBalanceRange(5000, wallet.balance);
console.log("Proof valid:", verifyRangeProof(fundsProof));
```

"This is the magic. I prove I can afford my bid WITHOUT exposing my wallet balance. Privacy-preserved solvency—only the proof matters, not the number."

---

## 1:15-1:45 — Feature 3: Anti-Sniping Protection (P1)

*[Switch to seller view, show timer]*

"Watch what happens when someone bids in the final minute."

```typescript
// Automatic extension triggered
// Timer: 00:47 → 01:47 (extended by 60s)
```

"Anti-sniping kicks in automatically. Last-second snipes are impossible. Fair auctions, guaranteed."

---

## 1:45-2:15 — Feature 4: Private Reserve Price (P1)

*[Show seller flow]*

```typescript
// Seller sets reserve privately
const auction = await createAuction({
  nftId: 1,
  reservePrice: 3000,  // Hidden until met
  revealMode: 'vickrey', // Second-price
});
```

"Sellers protect their minimum. Bidders never know the reserve—only whether it's met. And we're in Vickrey mode: winner pays second-highest bid, not their own. Bidding your true value is now rational."

---

## 2:15-2:45 — Feature 5: Automatic Refunds (P0)

*[Show bidder view after auction ends]*

```typescript
// Losing bidders get refunds automatically
const refund = await auction.claimRefund(nftId);
console.log("Refunded:", refund.amount, "DUST");
```

"Losing bids are returned instantly. No manual claims, no forgotten refunds. The contract handles everything trustlessly."

---

## 2:45-3:00 — Closing (Impact)

*[Show all features in one screen]*

"MidnightShield brings DeFi-grade privacy to NFT auctions. Sealed bids, ZK solvency, Vickrey pricing, anti-sniping, automatic refunds—all on Midnight Network. This is what auction fairness looks like when you don't have to choose between privacy and verifiability."

*[End with Midnight branding]*

**— Demo Complete —**

---

## Technical Notes

- **SDK:** `sdk/src/index.ts` — MidnightAuctionSDK class
- **Contract:** `contracts/src/SealedBidAuction.compact` — 6 ZK circuits
- **React Hook:** `marketplace-fork/src/hooks/useSealedBidAuction.ts` — Real-time state
- **UI:** `marketplace-fork/src/components/SealedBidAuctionUI.tsx` — Full auction flow

## P0 Features Covered
✅ Private sealed bids  
✅ ZK funds proof  
✅ Commitment/reveal phases  
✅ Winner verification  
✅ NFT + fund settlement  

## P1 Features Covered
✅ Private reserve price  
✅ Automatic refunds  
✅ Anti-sniping extension  
✅ Vickrey/second-price mode  
