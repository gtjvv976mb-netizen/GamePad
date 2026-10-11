//! The store end to end, run natively with solana-program-test: publish, buy, list, cancel, buy used, and
//! every split of the money down to the lamport.

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use gamepad_store::{accounts as acc, instruction as ix, Game, License, Listing, Store, StoreError, BOOTSTRAP_GAMES};
use solana_program_test::{processor, BanksClient, ProgramTest};
use solana_sdk::{
    compute_budget::ComputeBudgetInstruction, account::Account, bpf_loader_upgradeable::{self, UpgradeableLoaderState},
    account_info::AccountInfo, entrypoint::ProgramResult, instruction::Instruction, native_token::LAMPORTS_PER_SOL,
    pubkey::Pubkey, signature::Keypair, signer::Signer, system_instruction, system_program, transaction::Transaction,
};

// Anchor's entry wants one lifetime for the slice and its accounts; solana-program-test hands over two.
fn process(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let accounts = Box::leak(Box::new(accounts.to_vec()));
    gamepad_store::entry(program_id, accounts, data)
}

const SOL: u64 = LAMPORTS_PER_SOL;

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &gamepad_store::ID).0
}
fn store_pda() -> Pubkey { pda(&[b"store"]) }
fn game_pda(id: u64) -> Pubkey { pda(&[b"game", &id.to_le_bytes()]) }
fn license_pda(id: u64, owner: &Pubkey) -> Pubkey { pda(&[b"license", &id.to_le_bytes(), owner.as_ref()]) }
fn listing_pda(id: u64) -> Pubkey { pda(&[b"listing", &id.to_le_bytes()]) }
fn program_data_pda() -> Pubkey {
    Pubkey::find_program_address(&[gamepad_store::ID.as_ref()], &bpf_loader_upgradeable::ID).0
}
fn unrelated_program_data() -> Pubkey { Pubkey::new_from_array([99; 32]) }

struct World {
    banks: BanksClient,
    payer: Keypair,
    treasury: Keypair,
    studio: Keypair,
    alice: Keypair,
    bob: Keypair,
    /// bumped per transaction so repeating the same instruction is a new transaction, not a duplicate
    sent: u32,
}

impl World {
    async fn new() -> Self {
        let mut w = Self::uninitialized().await;
        let payer = w.payer.insecure_clone();
        w.send(w.initialize_ix(payer.pubkey(), program_data_pda()), &payer).await.unwrap();
        w
    }

    async fn uninitialized() -> Self {
        Self::uninitialized_with_proof(true, true).await
    }

    async fn uninitialized_with_proof(loader_owned: bool, upgradeable: bool) -> Self {
        let payer = Keypair::new();
        let (treasury, studio, alice, bob) = (Keypair::new(), Keypair::new(), Keypair::new(), Keypair::new());
        let mut pt = ProgramTest::new("gamepad_store", gamepad_store::ID, processor!(process));
        // Native program-test uses a builtin processor. Model the real loader-owned authority proof separately.
        for (address, authority) in [(program_data_pda(), payer.pubkey()), (unrelated_program_data(), bob.pubkey())] {
            let state = UpgradeableLoaderState::ProgramData { slot: 0, upgrade_authority_address: upgradeable.then_some(authority) };
            let owner = if loader_owned { bpf_loader_upgradeable::ID } else { system_program::ID };
            pt.add_account(address, Account::new_data(SOL, &state, &owner).unwrap());
        }
        let (banks, funder, _) = pt.start().await;
        // everyone starts with some SOL; the treasury too, so small fees never leave it below rent
        let fund: Vec<Instruction> = [&payer, &treasury, &studio, &alice, &bob].iter()
            .map(|k| system_instruction::transfer(&funder.pubkey(), &k.pubkey(), 10 * SOL)).collect();
        let bh = banks.get_latest_blockhash().await.unwrap();
        banks.process_transaction(Transaction::new_signed_with_payer(&fund, Some(&funder.pubkey()), &[&funder], bh)).await.unwrap();
        World { banks, payer, treasury, studio, alice, bob, sent: 0 }
    }

    fn initialize_ix(&self, authority: Pubkey, program_data: Pubkey) -> Instruction {
        Instruction {
            program_id: gamepad_store::ID,
            accounts: acc::Initialize { store: store_pda(), authority, system_program: system_program::ID, program_data }.to_account_metas(None),
            data: ix::Initialize { fee_bps: 1000, treasury: self.treasury.pubkey() }.data(),
        }
    }

    async fn send(&mut self, i: Instruction, signer: &Keypair) -> Result<(), String> {
        let bh = self.banks.get_latest_blockhash().await.unwrap();
        self.sent += 1;
        let unique = ComputeBudgetInstruction::set_compute_unit_limit(400_000 + self.sent);
        let mut signers = vec![signer];
        if signer.pubkey() != self.payer.pubkey() && i.accounts.iter().any(|m| m.is_signer && m.pubkey == self.payer.pubkey()) {
            signers.push(&self.payer);
        }
        let tx = Transaction::new_signed_with_payer(&[unique, i], Some(&signer.pubkey()), &signers, bh);
        self.banks.process_transaction(tx).await.map_err(|e| format!("{e:?}"))
    }

    async fn balance(&mut self, k: &Pubkey) -> u64 { self.banks.get_balance(*k).await.unwrap() }

    async fn read<T: AccountDeserialize>(&mut self, k: Pubkey) -> Option<T> {
        let a = self.banks.get_account(k).await.unwrap()?;
        Some(T::try_deserialize(&mut a.data.as_slice()).unwrap())
    }

    async fn copies(&mut self, game: u64, owner: &Pubkey) -> u32 {
        self.read::<License>(license_pda(game, owner)).await.map(|l| l.count).unwrap_or(0)
    }

    fn publish_ix(&self, next_id: u64, studio: &Pubkey, price: u64, royalty_bps: u16) -> Instruction {
        let authority = (next_id <= BOOTSTRAP_GAMES).then_some(self.payer.pubkey());
        self.publish_with_authority_ix(next_id, studio, price, royalty_bps, authority)
    }

    fn publish_with_authority_ix(&self, next_id: u64, studio: &Pubkey, price: u64, royalty_bps: u16, bootstrap_authority: Option<Pubkey>) -> Instruction {
        Instruction {
            program_id: gamepad_store::ID,
            accounts: acc::PublishGame { store: store_pda(), game: game_pda(next_id), studio: *studio, system_program: system_program::ID, bootstrap_authority }.to_account_metas(None),
            data: ix::PublishGame { price, royalty_bps, uri: "data:application/json;base64,eyJuYW1lIjoiSG9sbG93IENyb3duIn0=".into() }.data(),
        }
    }

    fn buy_ix(&self, game: u64, buyer: &Pubkey, studio: &Pubkey, expected_price: u64) -> Instruction {
        Instruction {
            program_id: gamepad_store::ID,
            accounts: acc::Buy {
                store: store_pda(), game: game_pda(game), license: license_pda(game, buyer), buyer: *buyer,
                studio: *studio, treasury: self.treasury.pubkey(), system_program: system_program::ID,
            }.to_account_metas(None),
            data: ix::Buy { game_id: game, expected_price }.data(),
        }
    }

    fn list_ix(&self, game: u64, listing_id: u64, seller: &Pubkey, price: u64) -> Instruction {
        Instruction {
            program_id: gamepad_store::ID,
            accounts: acc::List { store: store_pda(), license: license_pda(game, seller), listing: listing_pda(listing_id), seller: *seller, system_program: system_program::ID }.to_account_metas(None),
            data: ix::List { game_id: game, price }.data(),
        }
    }

    fn cancel_ix(&self, listing_id: u64, game: u64, seller: &Pubkey) -> Instruction {
        Instruction {
            program_id: gamepad_store::ID,
            accounts: acc::Cancel { listing: listing_pda(listing_id), license: license_pda(game, seller), seller: *seller }.to_account_metas(None),
            data: ix::Cancel { listing_id }.data(),
        }
    }

    fn buy_listing_ix(&self, listing_id: u64, game: u64, buyer: &Pubkey, seller: &Pubkey) -> Instruction {
        Instruction {
            program_id: gamepad_store::ID,
            accounts: acc::BuyListing {
                store: store_pda(), listing: listing_pda(listing_id), game: game_pda(game), buyer_license: license_pda(game, buyer),
                buyer: *buyer, seller: *seller, studio: self.studio.pubkey(), treasury: self.treasury.pubkey(), system_program: system_program::ID,
            }.to_account_metas(None),
            data: ix::BuyListing { listing_id }.data(),
        }
    }
}

#[tokio::test]
async fn only_the_program_upgrade_authority_can_initialize() {
    let mut w = World::uninitialized().await;
    let attacker = w.bob.insecure_clone();
    let error = w.send(w.initialize_ix(attacker.pubkey(), program_data_pda()), &attacker).await.unwrap_err();
    assert!(error.contains(&format!("Custom({})", u32::from(StoreError::UnauthorizedInitialize))), "unexpected rejection: {error}");
    assert!(w.read::<Store>(store_pda()).await.is_none(), "rejected initialization leaves no store");
    assert!(w.send(w.initialize_ix(attacker.pubkey(), unrelated_program_data()), &attacker).await.is_err(), "another program's authority proof cannot be substituted");
    assert!(w.read::<Store>(store_pda()).await.is_none());

    let authority = w.payer.insecure_clone();
    w.send(w.initialize_ix(authority.pubkey(), program_data_pda()), &authority).await.unwrap();
    let store = w.read::<Store>(store_pda()).await.unwrap();
    assert_eq!((store.authority, store.treasury, store.fee_bps), (authority.pubkey(), w.treasury.pubkey(), 1000));
    assert!(w.send(w.initialize_ix(authority.pubkey(), program_data_pda()), &authority).await.is_err(), "initialization is one-time");
}

#[tokio::test]
async fn initialization_requires_a_loader_owned_upgradeable_authority_proof() {
    for (loader_owned, upgradeable) in [(false, true), (true, false)] {
        let mut w = World::uninitialized_with_proof(loader_owned, upgradeable).await;
        let authority = w.payer.insecure_clone();
        assert!(w.send(w.initialize_ix(authority.pubkey(), program_data_pda()), &authority).await.is_err(), "proof must be loader-owned and retain an upgrade authority");
        assert!(w.read::<Store>(store_pda()).await.is_none());
    }
}

#[tokio::test]
async fn seed_slots_need_authority_and_later_publishing_is_permissionless() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    let attacker = w.bob.insecure_clone();
    for approval in [None, Some(attacker.pubkey())] {
        let error = w.send(w.publish_with_authority_ix(1, &attacker.pubkey(), SOL, 500, approval), &attacker).await.unwrap_err();
        assert!(error.contains(&format!("Custom({})", u32::from(StoreError::BootstrapAuthorityRequired))), "unexpected rejection: {error}");
    }
    assert_eq!(w.read::<Store>(store_pda()).await.unwrap().game_count, 0);
    assert!(w.read::<Game>(game_pda(1)).await.is_none());
    for id in 1..=BOOTSTRAP_GAMES {
        w.send(w.publish_ix(id, &studio.pubkey(), SOL, 500), &studio).await.unwrap();
    }
    assert_eq!(w.read::<Game>(game_pda(BOOTSTRAP_GAMES)).await.unwrap().studio, studio.pubkey(), "the approved studio remains the payout recipient");
    w.send(w.publish_with_authority_ix(BOOTSTRAP_GAMES + 1, &attacker.pubkey(), SOL, 500, None), &attacker).await.unwrap();
    assert_eq!(w.read::<Game>(game_pda(BOOTSTRAP_GAMES + 1)).await.unwrap().studio, attacker.pubkey());
}

#[tokio::test]
async fn publish_buy_and_split() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    let alice = w.alice.insecure_clone();

    let price = SOL / 4; // 0.25 SOL
    w.send(w.publish_ix(1, &studio.pubkey(), price, 800), &studio).await.unwrap();
    let game: Game = w.read(game_pda(1)).await.unwrap();
    assert_eq!((game.id, game.studio, game.price, game.royalty_bps, game.active), (1, studio.pubkey(), price, 800, true));
    assert_eq!(w.read::<Store>(store_pda()).await.unwrap().game_count, 1);

    let (s0, t0) = (w.balance(&studio.pubkey()).await, w.balance(&w.treasury.pubkey()).await);
    w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), price), &alice).await.unwrap();
    assert_eq!(w.copies(1, &alice.pubkey()).await, 1);
    assert_eq!(w.balance(&w.treasury.pubkey()).await - t0, price / 10, "10% fee to the treasury");
    assert_eq!(w.balance(&studio.pubkey()).await - s0, price - price / 10, "the rest to the studio");

    // a second copy adds to the same license
    w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), price), &alice).await.unwrap();
    assert_eq!(w.copies(1, &alice.pubkey()).await, 2);
}

#[tokio::test]
async fn buying_checks_price_studio_and_sale() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    let alice = w.alice.insecure_clone();
    let bob = w.bob.insecure_clone();
    w.send(w.publish_ix(1, &studio.pubkey(), SOL / 10, 500), &studio).await.unwrap();

    assert!(w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), SOL / 20), &alice).await.is_err(), "price changed");
    assert!(w.send(w.buy_ix(1, &alice.pubkey(), &bob.pubkey(), SOL / 10), &alice).await.is_err(), "wrong studio");

    // only the studio can update the game; a closed game can't be bought
    let close = |studio: Pubkey| Instruction {
        program_id: gamepad_store::ID,
        accounts: acc::UpdateGame { game: game_pda(1), studio }.to_account_metas(None),
        data: ix::UpdateGame { game_id: 1, price: SOL / 10, active: false }.data(),
    };
    assert!(w.send(close(bob.pubkey()), &bob).await.is_err(), "not the studio");
    w.send(close(studio.pubkey()), &studio).await.unwrap();
    assert!(w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), SOL / 10), &alice).await.is_err(), "not on sale");
    assert_eq!(w.copies(1, &alice.pubkey()).await, 0);
}

#[tokio::test]
async fn royalty_and_fee_caps() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    assert!(w.send(w.publish_ix(1, &studio.pubkey(), SOL, 1501), &studio).await.is_err(), "royalty over 15%");
    w.send(w.publish_ix(1, &studio.pubkey(), SOL, 1500), &studio).await.unwrap();
    let payer = w.payer.insecure_clone();
    let set_fee = |fee_bps: u16, authority: Pubkey, treasury: Pubkey| Instruction {
        program_id: gamepad_store::ID,
        accounts: acc::SetFee { store: store_pda(), authority }.to_account_metas(None),
        data: ix::SetFee { fee_bps, treasury }.data(),
    };
    assert!(w.send(set_fee(1501, payer.pubkey(), w.treasury.pubkey()), &payer).await.is_err(), "fee over 15%");
    assert!(w.send(set_fee(500, studio.pubkey(), studio.pubkey()), &studio).await.is_err(), "only the authority");
    w.send(set_fee(500, payer.pubkey(), w.treasury.pubkey()), &payer).await.unwrap();
    assert_eq!(w.read::<Store>(store_pda()).await.unwrap().fee_bps, 500);
}

#[tokio::test]
async fn free_games_cost_nothing_but_the_license_rent() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    let alice = w.alice.insecure_clone();
    w.send(w.publish_ix(1, &studio.pubkey(), 0, 0), &studio).await.unwrap();
    let s0 = w.balance(&studio.pubkey()).await;
    w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), 0), &alice).await.unwrap();
    assert_eq!(w.copies(1, &alice.pubkey()).await, 1);
    assert_eq!(w.balance(&studio.pubkey()).await, s0);
}

#[tokio::test]
async fn resale_pays_royalty_fee_and_seller() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    let alice = w.alice.insecure_clone();
    let bob = w.bob.insecure_clone();
    let price = SOL / 4;
    w.send(w.publish_ix(1, &studio.pubkey(), price, 800), &studio).await.unwrap();
    w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), price), &alice).await.unwrap();

    // listing escrows the copy
    let ask = SOL / 5; // 0.2 SOL
    w.send(w.list_ix(1, 1, &alice.pubkey(), ask), &alice).await.unwrap();
    assert_eq!(w.copies(1, &alice.pubkey()).await, 0);
    let l: Listing = w.read(listing_pda(1)).await.unwrap();
    assert_eq!((l.id, l.seller, l.game_id, l.price), (1, alice.pubkey(), 1, ask));
    assert!(w.send(w.list_ix(1, 2, &alice.pubkey(), ask), &alice).await.is_err(), "no copy left to list");

    let (s0, t0, a0) = (w.balance(&studio.pubkey()).await, w.balance(&w.treasury.pubkey()).await, w.balance(&alice.pubkey()).await);
    let rent = w.balance(&listing_pda(1)).await;
    w.send(w.buy_listing_ix(1, 1, &bob.pubkey(), &alice.pubkey()), &bob).await.unwrap();
    let (royalty, fee) = (ask * 800 / 10_000, ask / 10);
    assert_eq!(w.balance(&studio.pubkey()).await - s0, royalty, "8% royalty to the studio");
    assert_eq!(w.balance(&w.treasury.pubkey()).await - t0, fee, "10% fee to the treasury");
    assert_eq!(w.balance(&alice.pubkey()).await - a0, ask - royalty - fee + rent, "the rest and the listing's rent to the seller");
    assert_eq!(w.copies(1, &bob.pubkey()).await, 1);
    assert!(w.read::<Listing>(listing_pda(1)).await.is_none(), "listing closed");
    assert!(w.send(w.buy_listing_ix(1, 1, &bob.pubkey(), &alice.pubkey()), &bob).await.is_err(), "sold already");
}

#[tokio::test]
async fn cancel_returns_the_copy_to_the_seller_only() {
    let mut w = World::new().await;
    let studio = w.studio.insecure_clone();
    let alice = w.alice.insecure_clone();
    let bob = w.bob.insecure_clone();
    w.send(w.publish_ix(1, &studio.pubkey(), SOL / 10, 500), &studio).await.unwrap();
    w.send(w.buy_ix(1, &alice.pubkey(), &studio.pubkey(), SOL / 10), &alice).await.unwrap();
    w.send(w.list_ix(1, 1, &alice.pubkey(), SOL / 20), &alice).await.unwrap();

    w.send(w.buy_ix(1, &bob.pubkey(), &studio.pubkey(), SOL / 10), &bob).await.unwrap();
    assert!(w.send(w.cancel_ix(1, 1, &bob.pubkey()), &bob).await.is_err(), "only the seller cancels");
    assert!(w.send(w.buy_listing_ix(1, 1, &bob.pubkey(), &bob.pubkey()), &bob).await.is_err(), "the seller must be the listing's");

    w.send(w.cancel_ix(1, 1, &alice.pubkey()), &alice).await.unwrap();
    assert_eq!(w.copies(1, &alice.pubkey()).await, 1);
    assert!(w.read::<Listing>(listing_pda(1)).await.is_none());
    // the next listing gets the next id
    w.send(w.list_ix(1, 2, &alice.pubkey(), SOL / 20), &alice).await.unwrap();
    assert_eq!(w.read::<Store>(store_pda()).await.unwrap().listing_count, 2);
}
