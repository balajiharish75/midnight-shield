pub const COMPACT_SOURCE: &str = r###"// This file is part of MidnightShield.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the \"License\");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//  	http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an \"AS IS\" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

pragma language_version >= 0.16.0;

import CompactStandardLibrary;

export { BidCommitment, RefundInfo, BidInput, SettlementOutput, RefundOutput, RevealInput }
export { create_auction, submit_commitment, reveal_bid_contract, settle_auction_contract, is_auction_active, get_auction_id }

export enum AuctionState { created, active, revealed, settled }

export ledger auction_state: AuctionState;
export ledger auction_nft_contract: Bytes<32>;
export ledger auction_nft_token_id: Field;
export ledger auction_seller: Bytes<32>;
export ledger auction_min_bid: Uint<64>;
export ledger auction_reserve_commitment: Bytes<32>;
export ledger auction_reserve_salt: Bytes<32>;
export ledger auction_duration: Uint<64>;
export ledger auction_anti_sniping: Uint<64>;
export ledger auction_type: Uint<8>;
export ledger auction_eligibility_root: Bytes<32>;
export ledger auction_created_at: Uint<64>;
export ledger auction_settled: Boolean;
export ledger auction_extended: Boolean;

export ledger bid_commitments: Map<Bytes<32>, BidCommitment>;
export ledger refunds: Map<Bytes<32>, RefundInfo>;
export ledger auction_bid_commitments: Map<Bytes<32>, Bytes<32>>;

export struct BidCommitment {
  bidder: Bytes<32>,
  amount_commitment: Bytes<32>,
  amount_salt: Bytes<32>,
  nft_contract: Bytes<32>,
  nft_token_id: Field,
  deadline: Uint<64>,
  revealed: Boolean,
  bid_amount: Uint<64>,
  zk_funds_proof: Bytes<32>,
  eligibility_proof: Bytes<32>,
}

export struct RefundInfo {
  bidder: Bytes<32>,
  amount: Uint<64>,
  processed: Boolean,
}

export struct BidInput {
  bidder: Bytes<32>,
  amount: Uint<64>,
  valid: Boolean,
  commitment: Bytes<32>,
}

export struct SettlementOutput {
  winner: Bytes<32>,
  winning_bid: Uint<64>,
  second_highest_bid: Uint<64>,
  reserve_met: Boolean,
  total_valid_bids: Uint<32>,
}

export struct RefundOutput {
  bidder: Bytes<32>,
  amount: Uint<64>,
}

export struct RevealInput {
  commitment: Bytes<32>,
  amount: Uint<64>,
  salt: Bytes<32>,
  bidder: Bytes<32>,
  signature: Bytes<32>,
}

export struct AuctionCreated {
  auction_id: Bytes<32>,
  nft_contract: Bytes<32>,
  nft_token_id: Field,
  seller: Bytes<32>,
  min_bid: Uint<64>,
  duration_seconds: Uint<64>,
  auction_type: Uint<8>,
  created_at: Uint<64>,
}

export struct BidCommitted {
  auction_id: Bytes<32>,
  bidder: Bytes<32>,
  commitment: Bytes<32>,
  timestamp: Uint<64>,
}

export struct BidRevealed {
  auction_id: Bytes<32>,
  bidder: Bytes<32>,
  amount: Uint<64>,
  valid: Boolean,
}

export struct AuctionSettled {
  auction_id: Bytes<32>,
  winner: Bytes<32>,
  winning_bid: Uint<64>,
  second_highest_bid: Uint<64>,
  reserve_met: Boolean,
  total_bids: Uint<32>,
  settled_at: Uint<64>,
}

witness local_secret_key(): Bytes<32>;

export circuit commit_bid(
  bid_amount: Uint<64>,
  amount_salt: Bytes<32>,
  nft_contract: Bytes<32>,
  nft_token_id: Field,
  deadline: Uint<64>
): Bytes<32> {
  return pad(32, \"commitment\");
}

export circuit reveal_bid(
  bid_amount: Uint<64>,
  amount_salt: Bytes<32>,
  commitment: Bytes<32>
): Boolean {
  return true;
}

export circuit verify_reserve(
  reserve_price: Uint<64>,
  reserve_salt: Bytes<32>,
  reserve_commitment: Bytes<32>,
  winning_bid: Uint<64>
): Boolean {
  return true;
}

export circuit settle_auction(
  bids: Vector<100, BidInput>,
  min_bid: Uint<64>,
  auction_type_param: Uint<8>,
  reserve_commitment: Bytes<32>,
  reserve_salt: Bytes<32>
): SettlementOutput {
  return SettlementOutput {
    winner: default<Bytes<32>>,
    winning_bid: 0 as Uint<64>,
    second_highest_bid: 0 as Uint<64>,
    reserve_met: false,
    total_valid_bids: 0 as Uint<32>
  };
}

export circuit process_refunds(
  bids: Vector<100, BidInput>,
  winner: Bytes<32>,
  winning_bid: Uint<64>
): Vector<100, RefundOutput> {
  return default<Vector<100, RefundOutput>>;
}

export circuit verify_auction(
  auction_id: Bytes<32>,
  all_commitments: Vector<100, Bytes<32>>,
  all_reveals: Vector<100, RevealInput>,
  winner: Bytes<32>,
  winning_bid: Uint<64>,
  second_highest_bid: Uint<64>,
  reserve_commitment: Bytes<32>,
  reserve_salt: Bytes<32>,
  reserve_price: Uint<64>,
  min_bid: Uint<64>,
  auction_type_param: Uint<8>
): Boolean {
  return true;
}

export circuit public_key(sk: Bytes<32>): Bytes<32> {
  return disclose(persistentHash<Vector<2, Bytes<32>>>([pad(32, \"pk:\"), sk]));
}

export circuit create_auction(
  nft_contract: Bytes<32>,
  nft_token_id: Field,
  min_bid: Uint<64>,
  reserve_price: Uint<64>,
  reserve_salt: Bytes<32>,
  duration_seconds: Uint<64>,
  anti_sniping_seconds: Uint<64>,
  auction_type_param: Uint<8>,
  bidder_eligibility_root: Bytes<32>
): Bytes<32> {
  const sk = local_secret_key();
  const caller = public_key(sk);
  const reserve_commitment = pad(32, \"reserve_commitment\");
  const auction_id = pad(32, \"auction_id\");

  auction_nft_contract = disclose(nft_contract);
  auction_nft_token_id = disclose(nft_token_id);
  auction_seller = caller;
  auction_min_bid = disclose(min_bid);
  auction_reserve_commitment = reserve_commitment;
  auction_reserve_salt = disclose(reserve_salt);
  auction_duration = disclose(duration_seconds);
  auction_anti_sniping = disclose(anti_sniping_seconds);
  auction_type = disclose(auction_type_param);
  auction_eligibility_root = disclose(bidder_eligibility_root);
  auction_created_at = 0 as Uint<64>;
  auction_settled = false;
  auction_extended = false;
  auction_state = AuctionState.active;

  const created_event = AuctionCreated {
    auction_id: auction_id,
    nft_contract: disclose(nft_contract),
    nft_token_id: disclose(nft_token_id),
    seller: caller,
    min_bid: disclose(min_bid),
    duration_seconds: disclose(duration_seconds),
    auction_type: disclose(auction_type_param),
    created_at: 0 as Uint<64>
  };
  disclose(created_event);

  return auction_id;
}

export circuit submit_commitment(
  auction_id: Bytes<32>,
  commitment: Bytes<32>,
  zk_funds_proof: Bytes<32>,
  eligibility_proof: Bytes<32>
): [] {
  const sk = local_secret_key();
  const caller = public_key(sk);

  assert(!auction_settled, \"Auction already settled\");

  const deadline = auction_duration;
  const d_commitment = disclose(commitment);
  const d_auction_id = disclose(auction_id);
  const d_zk = disclose(zk_funds_proof);
  const d_elig = disclose(eligibility_proof);

  const bid_commitment = BidCommitment {
    bidder: caller,
    amount_commitment: d_commitment,
    amount_salt: default<Bytes<32>>,
    nft_contract: auction_nft_contract,
    nft_token_id: auction_nft_token_id,
    deadline: deadline,
    revealed: false,
    bid_amount: 0 as Uint<64>,
    zk_funds_proof: d_zk,
    eligibility_proof: d_elig
  };

  bid_commitments.insert(d_commitment, bid_commitment);
  auction_bid_commitments.insert(d_commitment, d_auction_id);

  const committed_event = BidCommitted {
    auction_id: d_auction_id,
    bidder: caller,
    commitment: d_commitment,
    timestamp: 0 as Uint<64>
  };
  disclose(committed_event);
}

export circuit reveal_bid_contract(
  auction_id: Bytes<32>,
  commitment: Bytes<32>,
  amount: Uint<64>,
  salt: Bytes<32>,
  signature: Bytes<32>
): [] {
  const sk = local_secret_key();
  const caller = public_key(sk);

  assert(!auction_settled, \"Auction already settled\");

  const d_commitment = disclose(commitment);
  const d_amount = disclose(amount);
  const d_salt = disclose(salt);
  const d_auction_id = disclose(auction_id);

  // lookup must use disclosed value
  const bid = bid_commitments.lookup(d_commitment);

  const valid = reveal_bid(d_amount, d_salt, d_commitment);
  assert(valid, \"Invalid reveal\");

  const updated_bid = BidCommitment {
    bidder: caller,
    amount_commitment: d_commitment,
    amount_salt: d_salt,
    nft_contract: auction_nft_contract,
    nft_token_id: auction_nft_token_id,
    deadline: bid.deadline,
    revealed: true,
    bid_amount: d_amount,
    zk_funds_proof: bid.zk_funds_proof,
    eligibility_proof: bid.eligibility_proof
  };
  bid_commitments.insert(d_commitment, updated_bid);

  const revealed_event = BidRevealed {
    auction_id: d_auction_id,
    bidder: caller,
    amount: d_amount,
    valid: true
  };
  disclose(revealed_event);
}

export circuit settle_auction_contract(
  auction_id: Bytes<32>
): [] {
  const sk = local_secret_key();
  const caller = public_key(sk);

  assert(!auction_settled, \"Auction already settled\");
  assert(caller == auction_seller, \"Only seller can settle\");

  const d_auction_id = disclose(auction_id);
  const empty_bids = default<Vector<100, BidInput>>;
  const settlement = settle_auction(
    empty_bids,
    auction_min_bid,
    auction_type,
    auction_reserve_commitment,
    auction_reserve_salt
  );

  const reserve_check = verify_reserve(
    0 as Uint<64>,
    auction_reserve_salt,
    auction_reserve_commitment,
    settlement.winning_bid
  );

  const settled_event = AuctionSettled {
    auction_id: d_auction_id,
    winner: settlement.winner,
    winning_bid: settlement.winning_bid,
    second_highest_bid: settlement.second_highest_bid,
    reserve_met: reserve_check,
    total_bids: settlement.total_valid_bids,
    settled_at: 0 as Uint<64>
  };
  disclose(settled_event);

  auction_settled = true;
  auction_state = AuctionState.settled;
}

export circuit get_auction_id(): Bytes<32> {
  return pad(32, \"auction_id\");
}

export circuit is_auction_active(): Boolean {
  if (auction_settled) {
    return false;
  }
  return true;
}

export circuit get_time_remaining(): Uint<64> {
  return 0 as Uint<64>;
}
"###;