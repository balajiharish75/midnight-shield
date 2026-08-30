# About MidnightShield

> **Bid in private. Prove you can pay. Win fairly.**  
> Privacy-preserving sealed-bid (Vickrey / first-price) auctions for NFTs on **Midnight Network** — where bids stay hidden, solvency is proven in zero-knowledge, and settlement is verifiably fair.

---

## Inspiration

We watched NFT auctions leak everything.

A wallet places a 5,000 DUST bid — and the mempool, the seller, every sniper bot sees `5000`, `0x...bidder`, `reserve=3000`. Whales get targeted, floors get manipulated, last-second snipes steal sales. Even “private” marketplaces just hide it in the UI — the chain still knows.

Midnight flips that model: **what if the chain only ever sees a hash, and the truth is proven in ZK?**

We wanted an auction where:

* No one — not seller, not rival bidder, not the network — knows $b_i$ until reveal
* You can prove *“I can afford this”* without showing your balance
* The seller can prove *“reserve was met”* without revealing the reserve
* Vickrey pricing makes honest bidding rational: winner pays second price, not their own

MidnightShield is DeFi-grade privacy for a problem everyone thought needed transparency.

---

## What We Learned

**1. Compact is not Solidity.**  
Compact’s `disclose()` model forced us to think witness-first. Every `circuit` param that touches the ledger (`Map.insert`, `ledger =`) must be explicitly `disclose()`d — the compiler yells `potential witness-value disclosure must be declared` otherwise. Immutability matters too: `const bid = lookup(k); bid.revealed = true` is illegal — you reconstruct a new struct and `insert` it.

**2. ZK is plumbing, not magic.**  
Writing stubs like `commit_bid`, `reveal_bid`, `verify_reserve` taught us the real circuits are hashes and comparisons in ZK:

$$ C = H(amount \parallel salt \parallel nftContract \parallel tokenId \parallel deadline) $$

$$ \text{valid} := ( H(amount' \parallel salt' ) == C ) $$

$$ \text{reserveMet} := (winningBid \geq reservePrice) \land (H(reservePrice \parallel reserveSalt) == reserveCommitment) $$

For Vickrey:

$$ \text{let } b_{(1)} \geq b_{(2)} \geq \dots \geq b_{(n)} \quad \Rightarrow \quad winner = argmax(b_i),\; price = \begin{cases} b_{(2)} & \text{if Vickrey} \\ b_{(1)} & \text{if first-price} \end{cases} $$

Proving solvency without revealing balance is a range proof: $balance \geq amount$ with $balance$ private.

**3. Toolchain trumps code.**  
Midnight’s `blake3 1.8.7` vs `1.5`, `borsh 1.8.1` vs `1.2`, `midnight-circuits 7.2.4` vs `7` — lockfile drift kills `cargo build`. And `wasi-sdk` / Apple clang 17 doesn’t ship `wasm32-wasip1` sysroot, so `blst` C compiles fail for WASM even when native `cargo build --release` passes in 0.04s. Verification became: Compact → native Rust → `tsc --noEmit`.

---

## How We Built It

**Stack:** Compact `0.5.2` (`pragma >=0.16.0`) + Rust (`blake3`, `midnight-circuits 7.2`, `wasm-bindgen`) + TypeScript SDK + React hook, on `midnight-shield` (private, `master`).

```text
contracts/src/SealedBidAuction.compact  ← 5 circuits
  commit_bid / reveal_bid / verify_reserve / settle_auction / verify_auction (+public_key)
  Ledger: auction_state: AuctionState, nft_contract, seller, min_bid, reserve_commitment,
          bid_commitments: Map<Bytes32,BidCommitment>, refunds: Map<Bytes32,RefundInfo>

contracts/src/lib.rs  ← shim: include!(OUT_DIR/compact_source.rs) + wasm_bindgen
sdk/src/              ← MidnightAuctionSDK
  index.ts: createAuction / placeBid / revealBid / settleAuction / verifyAuction / onAuctionSettled
  circuits.ts: AuctionCircuits wrappers (commitBid, revealBid, verifyReserve…)
  types/midnight-js-sdk.d.ts: stub for private @midnight-ntwrk/midnight-js-sdk (skipLibCheck)
marketplace-fork/src/ ← useSealedBidAuction(sdk, auctionId) + SealedBidAuctionUI.tsx
demo/demo-script.md    ← 3-min flow: sealed bids → ZK solvency → anti-sniping → private reserve → Vickrey → auto refunds
```

**Flow:**

1. **Create:** seller `disclose(nftContract)` + `hash(reserve)` → `auction_state = active`, emit `AuctionCreated`
2. **Commit:** bidder generates `salt ← rand(32)`, proves `balance ≥ amount` (ZK), computes $C$, `disclose(C)` → `bid_commitments.insert(C, BidCommitment{..., revealed:false})` + `auction_bid_commitments.insert(C, auctionId)`
3. **Reveal:** `disclose(C, amount, salt)` → `reveal_bid(amount,salt,C)==true` → reconstruct `BidCommitment{revealed:true, bid_amount: amount}` and re-insert, emit `BidRevealed`
4. **Settle:** `settle_auction(empty_bids, minBid, auctionType, reserveCommitment, reserveSalt)` → `SettlementOutput{winner, winningBid, secondHighestBid}`, `verify_reserve` → emit `AuctionSettled`, `auction_settled=true`, `auction_state=settled`

Anti-sniping: if `now ∈ [deadline-60s, deadline]` then `deadline += 60s` and `auction_extended=true`.

---

## Challenges We Faced

**Compact disclosure hell.** First compile: 18× `potential witness-value disclosure must be declared`. Every ledger write needed `disclose(param)`. `assert(!auction_settled)` needed a message: `assert(!auction_settled, "Auction already settled")`. `Map.lookup` returns a copy — mutating `bid.revealed = true` is illegal for `const`; we had to rebuild the whole `BidCommitment` struct.

**Cargo path vs Compact.** `Cargo.toml` had `path = "src/SealedBidAuction.compact"` — `cargo` expects Rust `lib.rs`. Fixed to default `src/lib.rs` with a shim that embeds the compact source via `build.rs` (`OUT_DIR/compact_source.rs`), and bumped deps to lock versions (`blake3 1.8`, `borsh 1.8`).

**WASM vs native.** `cargo build --target wasm32-wasip1 --release` fails on macOS: `blst: error: unable to create target wasm32-unknown-wasip1` — Apple clang lacks WASI sysroot. Native `cargo build --release` passes and proves API correctness; WASM needs `wasi-sdk` or Midnight’s docker `compact-builder`.

**Private npm.** `@midnight-ntwrk/midnight-js-sdk@^0.3.0` is 404 on public npm. Stubbed it in `src/types/midnight-js-sdk.d.ts` and set `tsconfig.json` to `module:NodeNext`/`moduleResolution:NodeNext` + `skipLibCheck:true`. Also fixed a `bigint` bug: `bucket + 1` → `bucket + 1n` at `index.ts:465`.

**Build artifacts in git.** First push included `contracts/target/` (900+ files). Added `.gitignore` (`/target/`, `**/target/`, `Cargo.lock`, `node_modules/`, `sdk/dist/`, `.DS_Store`, `*.key`) and `git rm -r --cached contracts/target`, re-pushed clean.

---

## What's Next

* Real ZK circuits for `commit_bid`/`verify_reserve` with `midnight-zk-stdlib` range proofs, Merkle eligibility (`bidder_eligibility_root`), and encrypted refunds
* On-chain art: Vickrey analytics in ZK (`avg`, `bidsAboveReserve` without revealing distribution)
* Midnight testnet deploy + marketplace relayer that verifies `AuctionSettled` and calls `marketplace_transfer_nft`

> MidnightShield brings **fairness without exposure** — the chain sees hashes and proofs, not wallets and numbers. That’s what auction fairness looks like when you don’t have to choose between privacy and verifiability.

**Repo:** `balajiharish75/midnight-shield` (private) • **Verified:** `compact compile` (5 circuits) • `cargo build --release 0.04s` • `tsc --noEmit 0` • `git status clean`
