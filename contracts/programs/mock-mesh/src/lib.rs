use anchor_lang::prelude::*;

declare_id!("3ptgmaf1dWrn8WsmRsat641srbbY1vfBvhMwVwczpoU2");

#[program]
pub mod mock_mesh {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.initialized, MeshError::AlreadyInitialized);

        config.admin = ctx.accounts.authority.key();
        config.total_venues = 0;
        config.total_routings = 0;
        config.initialized = true;

        Ok(())
    }

    pub fn register_venue(
        ctx: Context<RegisterVenue>,
        venue_id: String,
        name: String,
        venue_type: VenueType,
        risk_tier: String,
        supported_assets: Vec<String>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_venues = config.total_venues.checked_add(1).unwrap();

        let venue = &mut ctx.accounts.venue;
        venue.venue_id = venue_id.clone();
        venue.name = name.clone();
        venue.venue_type = venue_type;
        venue.risk_tier = risk_tier;
        venue.supported_assets = supported_assets;
        venue.status = VenueStatus::Active;
        venue.registered_at = Clock::get()?.unix_timestamp;

        emit!(VenueRegistered {
            venue_id,
            name,
            timestamp: venue.registered_at,
        });

        Ok(())
    }

    pub fn check_eligibility(
        ctx: Context<CheckEligibility>,
        vault_id: String,
        allowed_strategies: Vec<String>,
    ) -> Result<()> {
        let venue = &ctx.accounts.venue;
        let eligible = allowed_strategies.contains(&venue.venue_id)
            && venue.status == VenueStatus::Active;

        emit!(EligibilityChecked {
            vault_id,
            venue_id: venue.venue_id.clone(),
            eligible,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn record_routing(
        ctx: Context<RecordRouting>,
        routing_id: String,
        vault_id: String,
        strategy_id: String,
        venue_id: String,
        amount: u64,
        eligible: bool,
        routing_reason: String,
        source_tx: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_routings = config.total_routings.checked_add(1).unwrap();

        let routing = &mut ctx.accounts.routing;
        routing.routing_id = routing_id.clone();
        routing.vault_id = vault_id.clone();
        routing.strategy_id = strategy_id;
        routing.venue_id = venue_id.clone();
        routing.amount = amount;
        routing.eligible = eligible;
        routing.routing_reason = routing_reason;
        routing.source_tx = source_tx;
        routing.routed_at = Clock::get()?.unix_timestamp;

        emit!(RoutingRecorded {
            routing_id,
            vault_id,
            venue_id,
            amount,
            eligible,
            timestamp: routing.routed_at,
        });

        Ok(())
    }

    pub fn suspend_venue(ctx: Context<SuspendVenue>) -> Result<()> {
        let venue = &mut ctx.accounts.venue;
        venue.status = VenueStatus::Suspended;

        emit!(VenueSuspended {
            venue_id: venue.venue_id.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ─── Account Structures ─────────────────────────────────────────

#[account]
pub struct MeshConfig {
    pub admin: Pubkey,
    pub total_venues: u64,
    pub total_routings: u64,
    pub initialized: bool,
}

#[account]
pub struct VenueEntry {
    pub venue_id: String,
    pub name: String,
    pub venue_type: VenueType,
    pub risk_tier: String,
    pub supported_assets: Vec<String>,
    pub status: VenueStatus,
    pub registered_at: i64,
}

#[account]
pub struct RoutingDecision {
    pub routing_id: String,
    pub vault_id: String,
    pub strategy_id: String,
    pub venue_id: String,
    pub amount: u64,
    pub eligible: bool,
    pub routing_reason: String,
    pub source_tx: String,
    pub routed_at: i64,
}

// ─── Enums ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VenueType {
    YieldVault,
    Exchange,
    LendingPool,
    StakingProvider,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VenueStatus {
    Active,
    Suspended,
    Maintenance,
}

// ─── Instruction Contexts ───────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [b"mesh_config"],
        bump,
    )]
    pub config: Account<'info, MeshConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(venue_id: String)]
pub struct RegisterVenue<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+24) + (4+48) + 1 + (4+8) + (4 + 4 * (4+8)) + 1 + 8 + 64,
        seeds = [b"venue", venue_id.as_bytes()],
        bump,
    )]
    pub venue: Account<'info, VenueEntry>,
    #[account(mut, seeds = [b"mesh_config"], bump)]
    pub config: Account<'info, MeshConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckEligibility<'info> {
    pub venue: Account<'info, VenueEntry>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(routing_id: String)]
pub struct RecordRouting<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+16) + (4+16) + (4+24) + (4+24) + 8 + 1 + (4+64) + (4+88) + 8 + 64,
        seeds = [b"routing", routing_id.as_bytes()],
        bump,
    )]
    pub routing: Account<'info, RoutingDecision>,
    #[account(mut, seeds = [b"mesh_config"], bump)]
    pub config: Account<'info, MeshConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SuspendVenue<'info> {
    #[account(mut)]
    pub venue: Account<'info, VenueEntry>,
    #[account(seeds = [b"mesh_config"], bump)]
    pub config: Account<'info, MeshConfig>,
    #[account(constraint = authority.key() == config.admin @ MeshError::Unauthorized)]
    pub authority: Signer<'info>,
}

// ─── Events ─────────────────────────────────────────────────────

#[event]
pub struct VenueRegistered {
    pub venue_id: String,
    pub name: String,
    pub timestamp: i64,
}

#[event]
pub struct EligibilityChecked {
    pub vault_id: String,
    pub venue_id: String,
    pub eligible: bool,
    pub timestamp: i64,
}

#[event]
pub struct RoutingRecorded {
    pub routing_id: String,
    pub vault_id: String,
    pub venue_id: String,
    pub amount: u64,
    pub eligible: bool,
    pub timestamp: i64,
}

#[event]
pub struct VenueSuspended {
    pub venue_id: String,
    pub timestamp: i64,
}

// ─── Errors ─────────────────────────────────────────────────────

#[error_code]
pub enum MeshError {
    #[msg("Mesh instance already initialized")]
    AlreadyInitialized,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
}
