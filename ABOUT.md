# MidnightShield — Privacy-Preserving Sealed-Bid Auction on Midnight Network

## Inspiration

Traditional NFT auctions leak everything. A wallet places a `5,000 DUST` bid — and the mempool, the seller, every sniper bot sees the amount, the bidder address, even the seller's reserve. Whales get targeted, floors get manipulated, and last-second snipes steal sales. Even so-called “private” marketplaces just hide it in the UI — the chain still knows.

Midnight flips that model. What if the chain only ever sees a hash, and the truth is proven in zero-knowledge?

We wanted an auction where:

- No one — not the seller, not rival bidders, not the network — knows $b_i$ until reveal
- You can prove *“I can afford this”* without showing your balance
- The seller can prove *“reserve was met”* without revealing the reserve
- Vickrey pricing makes honest bidding rational: winner pays the second price, not their own

MidnightShield is DeFi-grade privacy for a problem everyone thought needed transparency.

## What I Learned

**Compact is not Solidity.** Compact’s `disclose()` model forced witness-first thinking. Every `circuit` parameter that touches the ledger (`Map.insert`, `ledger =`) must be explicitly `disclose()`d — otherwise the compiler throws `potential witness-value disclosure must be declared`. Immutability matters too: `const bid = lookup(k); bid.revealed = true` is illegal — you must reconstruct a new struct and `insert` it.

**ZK is plumbing, not magic.** Writing stubs for `commit_bid`, `reveal_bid`, and `verify_reserve` taught us the real circuits are just hashes and comparisons in ZK:

$$ C = H(amount \parallel salt \parallel nftContract \parallel tokenId \parallel deadline) $$

$$ \text{valid} := (H(amount' \parallel salt') == C) $$

$$ \text{reserveMet} := (winningBid \geq reservePrice) \land (H(reservePrice \parallel reserveSalt) == reserveCommitment) $$

For Vickrey pricing:

$$ \text{let } b_{(1)} \geq b_{(2)} \geq \dots \geq b_{(n)} \Rightarrow winner = argmax(b_i),\; price = \begin{cases} b_{(2)} & \text{if Vickrey} \\ b_{(1)} & \text{if first-price} \end{cases} $$

Proving solvency without revealing balance is a range proof: $balance \geq amount$ where $balance$ stays private.

**Toolchain matters more than code.** Midnight’s `blake3 1.8.7` vs `1.5`, `borsh 1.8.1` vs `1.2`, and `midnight-circuits 7.2.4` vs `7` — tiny lockfile drifts break `cargo build`. And `wasi-sdk` / Apple clang 17 doesn’t ship a `wasm32-wasip1` sysroot, so `blst` C files fail for WASM even when native `cargo build --release` passes in 0.04s. We learned to verify via `Compact → native Rust → tsc --noEmit`.

## How I Built the Project

I built MidnightShield as a full-stack privacy auction:

- **Contracts:** `contracts/src/SealedBidAuction.compact` with 5 circuits (`commit_bid`, `reveal_bid`, `verify_reserve`, `settle_auction`, `verify_auction` + `public_key`) and ledger state (`auction_state: AuctionState`, `bid_commitments: Map<Bytes32,BidCommitment>`, `refunds: Map<Bytes32,RefundInfo>`)
- **Rust shim:** `contracts/src/lib.rs` embeds the compact source via `build.rs` (`OUT_DIR/compact_source.rs`) and exposes it with `wasm-bindgen`
- **SDK:** `sdk/src/index.ts` (`MidnightAuctionSDK` with `createAuction`, `placeBid`, `revealBid`, `settleAuction`, `verifyAuction`, `onAuctionSettled`) and `sdk/src/circuits.ts` wrappers
- **Frontend:** `marketplace-fork/src/hooks/useSealedBidAuction.ts` and `marketplace-fork/src/components/SealedBidAuctionUI.tsx`
- **Demo:** `demo/demo-script.md` — a 3-minute flow from sealed bids to ZK solvency to anti-sniping to private reserve to Vickrey to auto refunds

Build flow:

1. **Create:** seller calls `disclose(nftContract)` and stores `hash(reserve)`, sets `auction_state = active`, emits `AuctionCreated`
2. **Commit:** bidder generates `salt \leftarrow rand(32)`, proves `balance \geq amount` in ZK, computes $C$, then `disclose(C)` and inserts `BidCommitment{revealed:false}` 
3. **Reveal:** bidder discloses $C, amount, salt$; circuit checks $H(amount' \parallel salt') == C$, then the contract rebuilds `BidCommitment{revealed:true, bid_amount:amount}` 
4. **Settle:** `settle_auction` computes `SettlementOutput{winner, winningBid, secondHighestBid}`, `verify_reserve` checks the reserve, emits `AuctionSettled`, sets `auction_settled=true`

Anti-sniping: if a bid lands in $[deadline-60s, deadline]$ then $deadline += 60s$ and `auction_extended=true`.

## Challenges I Faced

**Compact disclosure hell.** The first compile threw 18× `potential witness-value disclosure must be declared`. Every ledger write needed `disclose(param)`, every `assert` needed a message (`assert(!auction_settled, "Auction already settled")`), and `Map.lookup` returns a copy — mutating `bid.revealed = true` is illegal for `const`, so I had to rebuild the whole struct.

**Cargo vs Compact.** `Cargo.toml` had `path = "src/SealedBidAuction.compact"` — Cargo expects Rust `lib.rs`. I fixed it to the default `src/lib.rs` shim and bumped dependencies to match the lockfile (`blake3 1.8`, `borsh 1.8`, `midnight-circuits 7.2`).

**WASM on macOS.** `cargo build --target wasm32-wasip1 --release` fails with `blst: error: unable to create target wasm32-unknown-wasip1` because Apple clang lacks the WASI sysroot. Native `cargo build --release` still passes and proves the API is correct; WASM needs `wasi-sdk` or Midnight’s docker builder.

**Private npm.** `@midnight-ntwrk/midnight-js-sdk@^0.3.0` returns 404 on the public registry. I stubbed it in `src/types/midnight-js-sdk.d.ts` and set `tsconfig.json` to `module:NodeNext` / `moduleResolution:NodeNext` with `skipLibCheck:true`, and fixed a `bigint` bug (`bucket + 1` → `bucket + 1n`).

**Git hygiene.** The first push included `contracts/target/` with 900+ files. I added `.gitignore` for `/target/`, `node_modules`, `sdk/dist`, `.DS_Store`, and `*.key`, then ran `git rm -r --cached contracts/target` for a clean history.

## What's Next

- Replace stubs with real `midnight-zk-stdlib` range and Merkle proofs for eligibility (`bidder_eligibility_root`) and encrypted refunds
- Add ZK analytics for Vickrey stats (`avg`, `bidsAboveReserve`) without revealing the distribution
- Deploy to Midnight testnet and wire the marketplace relayer to verify `AuctionSettled` and call `marketplace_transfer_nft`

> MidnightShield brings fairness without exposure — the chain sees only hashes and proofs, not wallets and numbers. That is what auction fairness looks like when you don’t have to choose between privacy and verifiability.

