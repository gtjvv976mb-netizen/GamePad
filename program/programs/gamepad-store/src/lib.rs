//! GamePad store on Solana.
//!
//! Studios publish games. A license (a copy of a game) is a count kept by this program for each owner and
//! game, so a copy can only change hands through the store's own market, and every resale pays the studio its
//! royalty. Primary sales pay the studio and the platform fee straight from the buyer in the same transaction;
//! resales pay the royalty to the studio, the fee to the treasury and the rest to the seller.
//!
//! Accounts (all PDAs of this program):
//! - `Store`   ["store"]                         fee, treasury, counters
//! - `Game`    ["game", id u64 le]               studio, price, royalty, metadata uri
//! - `License` ["license", game id u64 le, owner] copies this owner holds of this game
//! - `Listing` ["listing", id u64 le]            one escrowed copy for sale; closed when sold or cancelled

use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("9xNeviToGk1PGUhbwCHNXoxYGwQn9x2oggtJzXhdoT9u");

/// Resale royalty a studio can set, at most 15%.
pub const MAX_ROYALTY_BPS: u16 = 1500;
/// Platform fee, at most 15%.
pub const MAX_FEE_BPS: u16 = 1500;
pub const BPS: u64 = 10_000;
/// Metadata uri bytes (a small data: URI or an https/ipfs link).
pub const MAX_URI: usize = 200;

#[program]
pub mod gamepad_store {
    use super::*;

    /// One-time setup by whoever deploys: the platform fee and where it goes.
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16, treasury: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, StoreError::FeeTooHigh);
        let store = &mut ctx.accounts.store;
        store.authority = ctx.accounts.authority.key();
        store.treasury = treasury;
        store.fee_bps = fee_bps;
        store.game_count = 0;
        store.listing_count = 0;
        store.bump = ctx.bumps.store;
        Ok(())
    }

    /// The store authority can change the fee (still capped) and the treasury.
    pub fn set_fee(ctx: Context<SetFee>, fee_bps: u16, treasury: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, StoreError::FeeTooHigh);
        let store = &mut ctx.accounts.store;
        store.fee_bps = fee_bps;
        store.treasury = treasury;
        Ok(())
    }

    /// Anyone can publish a game; the signer becomes its studio. Ids count up from 1.
    pub fn publish_game(ctx: Context<PublishGame>, price: u64, royalty_bps: u16, uri: String) -> Result<()> {
        require!(royalty_bps <= MAX_ROYALTY_BPS, StoreError::RoyaltyTooHigh);
        require!(uri.len() <= MAX_URI, StoreError::UriTooLong);
        let store = &mut ctx.accounts.store;
        store.game_count = store.game_count.checked_add(1).ok_or(StoreError::Overflow)?;
        let game = &mut ctx.accounts.game;
        game.id = store.game_count;
        game.studio = ctx.accounts.studio.key();
        game.price = price;
        game.royalty_bps = royalty_bps;
        game.active = true;
        game.bump = ctx.bumps.game;
        game.uri = uri;
        emit!(GamePublished { id: game.id, studio: game.studio, price, royalty_bps });
        Ok(())
    }

    /// The studio can change the price and open or close primary sales. The royalty is fixed at publish.
    pub fn update_game(ctx: Context<UpdateGame>, game_id: u64, price: u64, active: bool) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require_eq!(game.id, game_id);
        game.price = price;
        game.active = active;
        emit!(GameUpdated { id: game.id, price, active });
        Ok(())
    }

    /// Buy a new copy. `expected_price` guards against the studio changing the price under the buyer.
    pub fn buy(ctx: Context<Buy>, game_id: u64, expected_price: u64) -> Result<()> {
        let game = &ctx.accounts.game;
        require!(game.active, StoreError::GameNotActive);
        require!(game.price == expected_price, StoreError::PriceChanged);
        let price = game.price;
        if price > 0 {
            let fee = share(price, ctx.accounts.store.fee_bps)?;
            let sys = ctx.accounts.system_program.to_account_info();
            let buyer = ctx.accounts.buyer.to_account_info();
            pay(&sys, &buyer, &ctx.accounts.treasury.to_account_info(), fee)?;
            pay(&sys, &buyer, &ctx.accounts.studio.to_account_info(), price - fee)?;
        }
        let license = &mut ctx.accounts.license;
        claim(license, ctx.accounts.buyer.key(), game_id, ctx.bumps.license);
        license.count = license.count.checked_add(1).ok_or(StoreError::Overflow)?;
        emit!(Purchased { game_id, buyer: ctx.accounts.buyer.key(), price });
        Ok(())
    }

    /// Put one copy up for resale at `price`. The copy leaves the seller's license into the listing (escrow).
    pub fn list(ctx: Context<List>, game_id: u64, price: u64) -> Result<()> {
        let license = &mut ctx.accounts.license;
        require!(license.count > 0, StoreError::NoCopy);
        license.count -= 1;
        let store = &mut ctx.accounts.store;
        store.listing_count = store.listing_count.checked_add(1).ok_or(StoreError::Overflow)?;
        let listing = &mut ctx.accounts.listing;
        listing.id = store.listing_count;
        listing.seller = ctx.accounts.seller.key();
        listing.game_id = game_id;
        listing.price = price;
        listing.bump = ctx.bumps.listing;
        emit!(Listed { listing_id: listing.id, game_id, seller: listing.seller, price });
        Ok(())
    }

    /// Take a listing down: the copy goes back to the seller, and so does the listing's rent.
    pub fn cancel(ctx: Context<Cancel>, listing_id: u64) -> Result<()> {
        let license = &mut ctx.accounts.license;
        license.count = license.count.checked_add(1).ok_or(StoreError::Overflow)?;
        emit!(Cancelled { listing_id });
        Ok(())
    }

    /// Buy a used copy: the royalty goes to the studio, the fee to the treasury, the rest to the seller.
    pub fn buy_listing(ctx: Context<BuyListing>, listing_id: u64) -> Result<()> {
        let listing = &ctx.accounts.listing;
        let (price, game_id, seller) = (listing.price, listing.game_id, listing.seller);
        let royalty = share(price, ctx.accounts.game.royalty_bps)?;
        let fee = share(price, ctx.accounts.store.fee_bps)?;
        // royalty and fee are each at most 15%, so this cannot underflow
        let rest = price - royalty - fee;
        let sys = ctx.accounts.system_program.to_account_info();
        let buyer = ctx.accounts.buyer.to_account_info();
        pay(&sys, &buyer, &ctx.accounts.studio.to_account_info(), royalty)?;
        pay(&sys, &buyer, &ctx.accounts.treasury.to_account_info(), fee)?;
        pay(&sys, &buyer, &ctx.accounts.seller.to_account_info(), rest)?;
        let license = &mut ctx.accounts.buyer_license;
        claim(license, ctx.accounts.buyer.key(), game_id, ctx.bumps.buyer_license);
        license.count = license.count.checked_add(1).ok_or(StoreError::Overflow)?;
        emit!(Sold { listing_id, game_id, seller, buyer: ctx.accounts.buyer.key(), price, royalty, fee });
        Ok(())
    }
}

/// `bps` of `amount`, rounded down.
fn share(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128) * (bps as u128) / (BPS as u128);
    u64::try_from(v).map_err(|_| error!(StoreError::Overflow))
}

fn pay<'info>(sys: &AccountInfo<'info>, from: &AccountInfo<'info>, to: &AccountInfo<'info>, lamports: u64) -> Result<()> {
    if lamports == 0 {
        return Ok(());
    }
    transfer(CpiContext::new(sys.clone(), Transfer { from: from.clone(), to: to.clone() }), lamports)
}

/// A license account made by `init_if_needed` starts zeroed; give it its owner the first time.
fn claim(license: &mut License, owner: Pubkey, game_id: u64, bump: u8) {
    if license.owner == Pubkey::default() {
        license.owner = owner;
        license.game_id = game_id;
        license.bump = bump;
    }
}

// ───────────────────────── accounts ─────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Store {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub game_count: u64,
    pub listing_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Game {
    pub id: u64,
    pub studio: Pubkey,
    /// lamports; 0 = free
    pub price: u64,
    pub royalty_bps: u16,
    pub active: bool,
    pub bump: u8,
    #[max_len(200)]
    pub uri: String,
}

#[account]
#[derive(InitSpace)]
pub struct License {
    /// first, so a wallet's licenses can be found with one memcmp at offset 8
    pub owner: Pubkey,
    pub game_id: u64,
    pub count: u32,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub id: u64,
    pub seller: Pubkey,
    pub game_id: u64,
    /// lamports
    pub price: u64,
    pub bump: u8,
}

// ───────────────────────── instruction accounts ─────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + Store::INIT_SPACE, seeds = [b"store"], bump)]
    pub store: Account<'info, Store>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetFee<'info> {
    #[account(mut, seeds = [b"store"], bump = store.bump, has_one = authority)]
    pub store: Account<'info, Store>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct PublishGame<'info> {
    #[account(mut, seeds = [b"store"], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(init, payer = studio, space = 8 + Game::INIT_SPACE,
        seeds = [b"game", (store.game_count + 1).to_le_bytes().as_ref()], bump)]
    pub game: Account<'info, Game>,
    #[account(mut)]
    pub studio: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct UpdateGame<'info> {
    #[account(mut, seeds = [b"game", game_id.to_le_bytes().as_ref()], bump = game.bump, has_one = studio)]
    pub game: Account<'info, Game>,
    pub studio: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct Buy<'info> {
    #[account(seeds = [b"store"], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(seeds = [b"game", game_id.to_le_bytes().as_ref()], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(init_if_needed, payer = buyer, space = 8 + License::INIT_SPACE,
        seeds = [b"license", game_id.to_le_bytes().as_ref(), buyer.key().as_ref()], bump)]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: receives lamports; must be the game's studio
    #[account(mut, address = game.studio @ StoreError::WrongStudio)]
    pub studio: UncheckedAccount<'info>,
    /// CHECK: receives lamports; must be the store's treasury
    #[account(mut, address = store.treasury @ StoreError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: u64)]
pub struct List<'info> {
    #[account(mut, seeds = [b"store"], bump = store.bump)]
    pub store: Account<'info, Store>,
    /// the seeds tie the license to the seller, so only its owner can list from it
    #[account(mut, seeds = [b"license", game_id.to_le_bytes().as_ref(), seller.key().as_ref()], bump = license.bump)]
    pub license: Account<'info, License>,
    #[account(init, payer = seller, space = 8 + Listing::INIT_SPACE,
        seeds = [b"listing", (store.listing_count + 1).to_le_bytes().as_ref()], bump)]
    pub listing: Account<'info, Listing>,
    #[account(mut)]
    pub seller: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct Cancel<'info> {
    #[account(mut, close = seller, seeds = [b"listing", listing_id.to_le_bytes().as_ref()], bump = listing.bump,
        has_one = seller @ StoreError::NotSeller)]
    pub listing: Account<'info, Listing>,
    #[account(mut, seeds = [b"license", listing.game_id.to_le_bytes().as_ref(), seller.key().as_ref()], bump = license.bump)]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub seller: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(listing_id: u64)]
pub struct BuyListing<'info> {
    #[account(seeds = [b"store"], bump = store.bump)]
    pub store: Account<'info, Store>,
    #[account(mut, close = seller, seeds = [b"listing", listing_id.to_le_bytes().as_ref()], bump = listing.bump,
        has_one = seller @ StoreError::WrongSeller)]
    pub listing: Account<'info, Listing>,
    #[account(seeds = [b"game", listing.game_id.to_le_bytes().as_ref()], bump = game.bump)]
    pub game: Account<'info, Game>,
    #[account(init_if_needed, payer = buyer, space = 8 + License::INIT_SPACE,
        seeds = [b"license", listing.game_id.to_le_bytes().as_ref(), buyer.key().as_ref()], bump)]
    pub buyer_license: Account<'info, License>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: receives the rest of the price and the listing's rent; must be the listing's seller
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: receives the royalty; must be the game's studio
    #[account(mut, address = game.studio @ StoreError::WrongStudio)]
    pub studio: UncheckedAccount<'info>,
    /// CHECK: receives the fee; must be the store's treasury
    #[account(mut, address = store.treasury @ StoreError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// ───────────────────────── events and errors ─────────────────────────

#[event]
pub struct GamePublished { pub id: u64, pub studio: Pubkey, pub price: u64, pub royalty_bps: u16 }
#[event]
pub struct GameUpdated { pub id: u64, pub price: u64, pub active: bool }
#[event]
pub struct Purchased { pub game_id: u64, pub buyer: Pubkey, pub price: u64 }
#[event]
pub struct Listed { pub listing_id: u64, pub game_id: u64, pub seller: Pubkey, pub price: u64 }
#[event]
pub struct Cancelled { pub listing_id: u64 }
#[event]
pub struct Sold { pub listing_id: u64, pub game_id: u64, pub seller: Pubkey, pub buyer: Pubkey, pub price: u64, pub royalty: u64, pub fee: u64 }

#[error_code]
pub enum StoreError {
    #[msg("Royalty can be at most 15%")]
    RoyaltyTooHigh,
    #[msg("Fee can be at most 15%")]
    FeeTooHigh,
    #[msg("Metadata uri is too long")]
    UriTooLong,
    #[msg("This game isn't on sale")]
    GameNotActive,
    #[msg("The price changed; check it and try again")]
    PriceChanged,
    #[msg("You don't own a copy of this game")]
    NoCopy,
    #[msg("Only the seller can do that")]
    NotSeller,
    #[msg("That isn't this listing's seller")]
    WrongSeller,
    #[msg("That isn't this game's studio")]
    WrongStudio,
    #[msg("That isn't the store's treasury")]
    WrongTreasury,
    #[msg("Number too large")]
    Overflow,
}
