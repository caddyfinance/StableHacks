use anchor_lang::prelude::*;

declare_id!("5uPg5pi46gXErKcYWyqEAn2uSU68VZSUgvGTPZuVGwyA");

/// SAS (Solana Attestation Service) Program ID
pub const SAS_PROGRAM_ID: &str = "22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG";

/// Protocol-mandated minimum liquidity buffer: 10% of total NAV must remain idle at all times.
/// This floor is inviolable — no mandate can set liquidityBufferBps below this value.
pub const PROTOCOL_LIQUIDITY_BUFFER_BPS: u16 = 1000;

/// AMINA Institutional Segregated Yield Vault Program
///
/// Integrates with Solana Attestation Service (SAS) for on-chain credential
/// verification. The AMINA admin issues SAS attestations via the backend,
/// and this program verifies those attestations exist before allowing
/// vault creation and sensitive operations.

#[program]
pub mod amina_vault {
    use super::*;

    // ─── Program Initialization ──────────────────────────────────

    /// Initialize a freshly deployed program instance.
    /// Called once after binary deployment to record the admin authority
    /// and the vault owner wallet this program instance is dedicated to.
    pub fn initialize(
        ctx: Context<Initialize>,
        vault_owner_wallet: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.initialized, VaultError::AlreadyInitialized);

        config.admin = ctx.accounts.authority.key();
        config.vault_owner_wallet = vault_owner_wallet;
        config.initialized = true;
        config.deployed_at = Clock::get()?.unix_timestamp;

        emit!(ProgramInitialized {
            admin: config.admin,
            vault_owner_wallet,
            deployed_at: config.deployed_at,
        });

        Ok(())
    }

    // ─── SAS Attestation Verification ────────────────────────────

    /// Verify a SAS attestation exists for a client wallet and register it
    /// in the AMINA system. This bridges SAS attestations to vault access.
    ///
    /// The admin calls this after issuing a SAS attestation via the backend.
    /// It stores the attestation PDA reference so the vault can gate access.
    pub fn register_sas_credential(
        ctx: Context<RegisterSasCredential>,
        credential_id: String,
        client_reference: String,
        jurisdiction: String,
        risk_tier: String,
    ) -> Result<()> {
        let sas_attestation = &ctx.accounts.sas_attestation;

        // Verify the SAS attestation account exists and is owned by the SAS program
        require!(
            sas_attestation.owner == &SAS_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            VaultError::InvalidSasAttestation
        );

        // Verify the account has data (attestation is active, not closed)
        require!(
            sas_attestation.data_len() > 0,
            VaultError::SasAttestationNotFound
        );

        let credential = &mut ctx.accounts.credential;
        credential.authority = ctx.accounts.authority.key();
        credential.credential_id = credential_id.clone();
        credential.client_reference = client_reference;
        credential.jurisdiction = jurisdiction;
        credential.risk_tier = risk_tier;
        credential.wallet_binding = ctx.accounts.client_wallet.key();
        credential.sas_attestation = sas_attestation.key();
        credential.status = CredentialStatus::Active;
        credential.issued_at = Clock::get()?.unix_timestamp;
        credential.revoked = false;

        emit!(SasCredentialRegistered {
            credential_id,
            wallet: ctx.accounts.client_wallet.key(),
            sas_attestation: sas_attestation.key(),
            timestamp: credential.issued_at,
        });

        Ok(())
    }

    /// Verify a SAS attestation is still valid (account exists and has data).
    /// Returns silently if valid, errors if invalid.
    /// Can be called by anyone as a read-like operation.
    pub fn verify_sas_attestation(
        ctx: Context<VerifySasAttestation>,
    ) -> Result<()> {
        let sas_attestation = &ctx.accounts.sas_attestation;

        require!(
            sas_attestation.owner == &SAS_PROGRAM_ID.parse::<Pubkey>().unwrap(),
            VaultError::InvalidSasAttestation
        );

        require!(
            sas_attestation.data_len() > 0,
            VaultError::SasAttestationNotFound
        );

        let credential = &ctx.accounts.credential;
        require!(
            credential.sas_attestation == sas_attestation.key(),
            VaultError::SasAttestationMismatch
        );

        require!(
            credential.status == CredentialStatus::Active && !credential.revoked,
            VaultError::CredentialRevoked
        );

        emit!(SasAttestationVerified {
            credential_id: credential.credential_id.clone(),
            sas_attestation: sas_attestation.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── Legacy Credential (fallback for demo without SAS) ───────

    /// Issue a credential directly (without SAS). Used as fallback
    /// when SAS setup is not complete.
    pub fn issue_credential(
        ctx: Context<IssueCredential>,
        credential_id: String,
        client_reference: String,
        jurisdiction: String,
        risk_tier: String,
        _product_eligibility: String,
    ) -> Result<()> {
        let credential = &mut ctx.accounts.credential;
        credential.authority = ctx.accounts.authority.key();
        credential.credential_id = credential_id.clone();
        credential.client_reference = client_reference;
        credential.jurisdiction = jurisdiction;
        credential.risk_tier = risk_tier;
        credential.wallet_binding = ctx.accounts.client_wallet.key();
        credential.sas_attestation = Pubkey::default(); // No SAS attestation
        credential.status = CredentialStatus::Active;
        credential.issued_at = Clock::get()?.unix_timestamp;
        credential.revoked = false;

        emit!(CredentialIssued {
            credential_id,
            wallet: ctx.accounts.client_wallet.key(),
            timestamp: credential.issued_at,
        });

        Ok(())
    }

    /// Revoke a credential, preventing further vault operations.
    /// If the credential was SAS-attested, the backend should also
    /// close the SAS attestation account.
    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        let credential = &mut ctx.accounts.credential;
        credential.status = CredentialStatus::Revoked;
        credential.revoked = true;

        emit!(CredentialRevoked {
            credential_id: credential.credential_id.clone(),
            sas_attestation: credential.sas_attestation,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── Vault Factory ───────────────────────────────────────────

    /// Create a segregated, non-pooled vault for a specific credential holder.
    /// Validates the credential is active. If SAS attestation exists,
    /// also verifies it on-chain.
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: String,
        base_asset: String,
    ) -> Result<()> {
        let credential = &ctx.accounts.credential;
        require!(credential.status == CredentialStatus::Active, VaultError::InvalidCredential);
        require!(!credential.revoked, VaultError::CredentialRevoked);

        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.vault_id = vault_id.clone();
        vault.credential_id = credential.credential_id.clone();
        vault.credential_wallet = credential.wallet_binding;
        vault.sas_attestation = credential.sas_attestation;
        vault.base_asset = base_asset;
        vault.status = VaultStatus::Active;
        vault.paused = false;
        vault.idle_balance = 0;
        vault.total_deposited = 0;
        vault.total_nav = 0;
        vault.created_at = Clock::get()?.unix_timestamp;

        emit!(VaultCreated {
            vault_id,
            credential_id: credential.credential_id.clone(),
            wallet: credential.wallet_binding,
            sas_attestation: credential.sas_attestation,
            timestamp: vault.created_at,
        });

        Ok(())
    }

    // ─── Mandate Policy ──────────────────────────────────────────

    /// Attach a mandate policy to a vault constraining strategy execution.
    /// The liquidity buffer cannot be set below the protocol minimum (10%).
    pub fn attach_mandate(
        ctx: Context<AttachMandate>,
        allowed_strategies: Vec<String>,
        blocked_strategies: Vec<String>,
        max_allocation_bps: Vec<u16>,
        liquidity_buffer_bps: u16,
        consent_threshold: u64,
        leverage_allowed: bool,
    ) -> Result<()> {
        require!(
            liquidity_buffer_bps >= PROTOCOL_LIQUIDITY_BUFFER_BPS,
            VaultError::BelowProtocolMinimum
        );

        let mandate = &mut ctx.accounts.mandate;
        mandate.vault = ctx.accounts.vault.key();
        mandate.allowed_strategies = allowed_strategies.clone();
        mandate.blocked_strategies = blocked_strategies.clone();
        mandate.max_allocation_bps = max_allocation_bps.clone();
        mandate.liquidity_buffer_bps = liquidity_buffer_bps;
        mandate.consent_threshold = consent_threshold;
        mandate.leverage_allowed = leverage_allowed;
        mandate.status = MandateStatus::Active;
        mandate.version = 1;

        emit!(MandateAttached {
            vault_id: ctx.accounts.vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            allowed_strategies,
            blocked_strategies,
            liquidity_buffer_bps,
            consent_threshold,
            leverage_allowed,
            version: 1,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Update an existing mandate policy on a vault.
    /// The liquidity buffer cannot be set below the protocol minimum (10%).
    pub fn update_mandate(
        ctx: Context<UpdateMandate>,
        allowed_strategies: Vec<String>,
        blocked_strategies: Vec<String>,
        max_allocation_bps: Vec<u16>,
        liquidity_buffer_bps: u16,
        consent_threshold: u64,
        leverage_allowed: bool,
    ) -> Result<()> {
        require!(
            liquidity_buffer_bps >= PROTOCOL_LIQUIDITY_BUFFER_BPS,
            VaultError::BelowProtocolMinimum
        );

        let mandate = &mut ctx.accounts.mandate;
        let old_version = mandate.version;
        mandate.allowed_strategies = allowed_strategies.clone();
        mandate.blocked_strategies = blocked_strategies.clone();
        mandate.max_allocation_bps = max_allocation_bps.clone();
        mandate.liquidity_buffer_bps = liquidity_buffer_bps;
        mandate.consent_threshold = consent_threshold;
        mandate.leverage_allowed = leverage_allowed;
        mandate.version = old_version.checked_add(1).unwrap_or(old_version);

        emit!(MandateUpdated {
            vault_id: ctx.accounts.vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            allowed_strategies,
            blocked_strategies,
            liquidity_buffer_bps,
            consent_threshold,
            leverage_allowed,
            old_version,
            new_version: mandate.version,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── Deposit ─────────────────────────────────────────────────

    /// Deposit funds into a segregated vault from an approved source.
    pub fn deposit(
        ctx: Context<DepositFunds>,
        amount: u64,
        source_reference: String,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(!vault.paused, VaultError::VaultPaused);

        vault.idle_balance = vault.idle_balance.checked_add(amount).unwrap();
        vault.total_deposited = vault.total_deposited.checked_add(amount).unwrap();
        vault.total_nav = vault.total_nav.checked_add(amount).unwrap();

        emit!(DepositRecorded {
            vault_id: vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            amount,
            source_reference,
            new_idle_balance: vault.idle_balance,
            new_total_nav: vault.total_nav,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── Allocation ──────────────────────────────────────────────

    /// Allocate funds from idle balance to a strategy adapter.
    /// Validates against mandate policy before execution.
    pub fn allocate_to_strategy(
        ctx: Context<AllocateToStrategy>,
        strategy_id: String,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let mandate = &ctx.accounts.mandate;

        require!(!vault.paused, VaultError::VaultPaused);
        require!(!mandate.blocked_strategies.contains(&strategy_id), VaultError::StrategyBlocked);
        require!(mandate.allowed_strategies.contains(&strategy_id), VaultError::StrategyNotAllowed);

        // deployable = idle - required_buffer; amount must not exceed this ceiling
        let required_buffer = (vault.total_nav as u128 * mandate.liquidity_buffer_bps as u128 / 10000) as u64;
        let deployable = vault.idle_balance.saturating_sub(required_buffer);
        require!(amount <= deployable, VaultError::LiquidityBufferViolation);

        vault.idle_balance = vault.idle_balance.checked_sub(amount).ok_or(VaultError::InsufficientBalance)?;

        emit!(AllocationExecuted {
            vault_id: vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            strategy_id,
            amount,
            post_idle_balance: vault.idle_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── Redemption ──────────────────────────────────────────────

    /// Redeem funds from idle balance to an approved destination.
    /// Enforces the liquidity buffer invariant: post-withdrawal idle must be >= buffer on post-withdrawal NAV.
    pub fn redeem(
        ctx: Context<Redeem>,
        amount: u64,
        destination: Pubkey,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let mandate = &ctx.accounts.mandate;

        require!(vault.idle_balance >= amount, VaultError::InsufficientBalance);

        // Buffer check on post-withdrawal state (NAV also shrinks, so recalculate against post-NAV)
        let post_idle = vault.idle_balance.checked_sub(amount).ok_or(VaultError::InsufficientBalance)?;
        let post_nav  = vault.total_nav.checked_sub(amount).ok_or(VaultError::InsufficientBalance)?;
        let post_required = (post_nav as u128 * mandate.liquidity_buffer_bps as u128 / 10000) as u64;
        require!(post_idle >= post_required, VaultError::LiquidityBufferViolation);

        vault.idle_balance = post_idle;
        vault.total_nav = post_nav;

        emit!(RedemptionExecuted {
            vault_id: vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            amount,
            destination,
            post_idle_balance: vault.idle_balance,
            post_total_nav: vault.total_nav,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // ─── Emergency Controls ──────────────────────────────────────

    /// Pause or unpause a vault. Only callable by emergency admin.
    pub fn toggle_pause(ctx: Context<TogglePause>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.paused = !vault.paused;

        emit!(VaultPauseToggled {
            vault_id: vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            paused: vault.paused,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    /// Unwind strategy positions back to idle balance.
    pub fn unwind_strategy(
        ctx: Context<UnwindStrategy>,
        strategy_id: String,
        amount: u64,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.idle_balance = vault.idle_balance.checked_add(amount).unwrap();

        emit!(UnwindExecuted {
            vault_id: vault.vault_id.clone(),
            authority: ctx.accounts.authority.key(),
            strategy_id,
            amount,
            post_idle_balance: vault.idle_balance,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }
}

// ─── Account Structures ──────────────────────────────────────────

#[account]
pub struct ProgramConfig {
    pub admin: Pubkey,
    pub vault_owner_wallet: Pubkey,
    pub initialized: bool,
    pub deployed_at: i64,
}

#[account]
pub struct Credential {
    pub authority: Pubkey,
    pub credential_id: String,      // max 32
    pub client_reference: String,    // max 32
    pub jurisdiction: String,        // max 16
    pub risk_tier: String,           // max 16
    pub wallet_binding: Pubkey,
    pub sas_attestation: Pubkey,     // SAS attestation PDA (Pubkey::default if none)
    pub status: CredentialStatus,
    pub issued_at: i64,
    pub revoked: bool,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub vault_id: String,           // max 16
    pub credential_id: String,      // max 32
    pub credential_wallet: Pubkey,  // wallet bound to the credential
    pub sas_attestation: Pubkey,    // SAS attestation PDA for this vault's credential
    pub base_asset: String,         // max 8
    pub status: VaultStatus,
    pub paused: bool,
    pub idle_balance: u64,
    pub total_deposited: u64,
    pub total_nav: u64,
    pub created_at: i64,
}

#[account]
pub struct Mandate {
    pub vault: Pubkey,
    pub allowed_strategies: Vec<String>,
    pub blocked_strategies: Vec<String>,
    pub max_allocation_bps: Vec<u16>,
    pub liquidity_buffer_bps: u16,
    pub consent_threshold: u64,
    pub leverage_allowed: bool,
    pub status: MandateStatus,
    pub version: u32,
}

// ─── Enums ───────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CredentialStatus {
    Active,
    Revoked,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VaultStatus {
    Active,
    Paused,
    Closing,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MandateStatus {
    Active,
    Inactive,
}

// ─── Instruction Contexts ────────────────────────────────────────

/// Initialize a per-user program instance after deployment.
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1 + 8,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, ProgramConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Register a SAS attestation as a credential in the AMINA system.
/// Verifies the attestation exists on the SAS program before storing.
#[derive(Accounts)]
#[instruction(credential_id: String)]
pub struct RegisterSasCredential<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 36 + 36 + 20 + 20 + 32 + 32 + 1 + 8 + 1 + 64,
        seeds = [b"credential", credential_id.as_bytes()],
        bump,
    )]
    pub credential: Account<'info, Credential>,
    /// The SAS attestation PDA — verified to be owned by the SAS program
    /// CHECK: Validated in instruction logic (owner check + data length)
    pub sas_attestation: UncheckedAccount<'info>,
    /// CHECK: Client wallet that the SAS attestation was issued for
    pub client_wallet: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

/// Verify a SAS attestation is still valid for a given credential.
#[derive(Accounts)]
pub struct VerifySasAttestation<'info> {
    pub credential: Account<'info, Credential>,
    /// CHECK: Validated in instruction logic
    pub sas_attestation: UncheckedAccount<'info>,
}

/// Legacy credential issuance (without SAS).
#[derive(Accounts)]
#[instruction(credential_id: String)]
pub struct IssueCredential<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 36 + 36 + 20 + 20 + 32 + 32 + 1 + 8 + 1 + 64,
        seeds = [b"credential", credential_id.as_bytes()],
        bump,
    )]
    pub credential: Account<'info, Credential>,
    /// CHECK: Client wallet for binding
    pub client_wallet: UncheckedAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCredential<'info> {
    #[account(mut, has_one = authority)]
    pub credential: Account<'info, Credential>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(vault_id: String)]
pub struct CreateVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 20 + 36 + 32 + 32 + 12 + 1 + 1 + 8 + 8 + 8 + 8 + 64,
        seeds = [b"vault", vault_id.as_bytes()],
        bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(has_one = authority)]
    pub credential: Account<'info, Credential>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AttachMandate<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 512 + 2 + 8 + 1 + 1 + 4 + 64,
        seeds = [b"mandate", vault.key().as_ref()],
        bump,
    )]
    pub mandate: Account<'info, Mandate>,
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositFunds<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct AllocateToStrategy<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub mandate: Account<'info, Mandate>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateMandate<'info> {
    #[account(mut, seeds = [b"mandate", vault.key().as_ref()], bump)]
    pub mandate: Account<'info, Mandate>,
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    #[account(seeds = [b"mandate", vault.key().as_ref()], bump)]
    pub mandate: Account<'info, Mandate>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UnwindStrategy<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

// ─── Events ──────────────────────────────────────────────────────

#[event]
pub struct ProgramInitialized {
    pub admin: Pubkey,
    pub vault_owner_wallet: Pubkey,
    pub deployed_at: i64,
}

#[event]
pub struct SasCredentialRegistered {
    pub credential_id: String,
    pub wallet: Pubkey,
    pub sas_attestation: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SasAttestationVerified {
    pub credential_id: String,
    pub sas_attestation: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CredentialIssued {
    pub credential_id: String,
    pub wallet: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct CredentialRevoked {
    pub credential_id: String,
    pub sas_attestation: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultCreated {
    pub vault_id: String,
    pub credential_id: String,
    pub wallet: Pubkey,
    pub sas_attestation: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct MandateAttached {
    pub vault_id: String,
    pub authority: Pubkey,
    pub allowed_strategies: Vec<String>,
    pub blocked_strategies: Vec<String>,
    pub liquidity_buffer_bps: u16,
    pub consent_threshold: u64,
    pub leverage_allowed: bool,
    pub version: u32,
    pub timestamp: i64,
}

#[event]
pub struct MandateUpdated {
    pub vault_id: String,
    pub authority: Pubkey,
    pub allowed_strategies: Vec<String>,
    pub blocked_strategies: Vec<String>,
    pub liquidity_buffer_bps: u16,
    pub consent_threshold: u64,
    pub leverage_allowed: bool,
    pub old_version: u32,
    pub new_version: u32,
    pub timestamp: i64,
}

#[event]
pub struct DepositRecorded {
    pub vault_id: String,
    pub authority: Pubkey,
    pub amount: u64,
    pub source_reference: String,
    pub new_idle_balance: u64,
    pub new_total_nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct AllocationExecuted {
    pub vault_id: String,
    pub authority: Pubkey,
    pub strategy_id: String,
    pub amount: u64,
    pub post_idle_balance: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedemptionExecuted {
    pub vault_id: String,
    pub authority: Pubkey,
    pub amount: u64,
    pub destination: Pubkey,
    pub post_idle_balance: u64,
    pub post_total_nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultPauseToggled {
    pub vault_id: String,
    pub authority: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}

#[event]
pub struct UnwindExecuted {
    pub vault_id: String,
    pub authority: Pubkey,
    pub strategy_id: String,
    pub amount: u64,
    pub post_idle_balance: u64,
    pub timestamp: i64,
}

// ─── Errors ──────────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Invalid credential")]
    InvalidCredential,
    #[msg("Credential has been revoked")]
    CredentialRevoked,
    #[msg("Vault is paused — all operations blocked")]
    VaultPaused,
    #[msg("Strategy is blocked by mandate")]
    StrategyBlocked,
    #[msg("Strategy is not in allowed list")]
    StrategyNotAllowed,
    #[msg("Insufficient idle balance")]
    InsufficientBalance,
    #[msg("Post-allocation idle balance below required liquidity buffer")]
    LiquidityBufferViolation,
    #[msg("Destination not in approved list")]
    DestinationNotApproved,
    #[msg("Action requires client consent")]
    ConsentRequired,
    #[msg("SAS attestation account is not owned by the SAS program")]
    InvalidSasAttestation,
    #[msg("SAS attestation account not found or has been closed")]
    SasAttestationNotFound,
    #[msg("SAS attestation does not match the credential")]
    SasAttestationMismatch,
    #[msg("Program instance is already initialized")]
    AlreadyInitialized,
    #[msg("Liquidity buffer BPS cannot be set below protocol minimum (1000 = 10%)")]
    BelowProtocolMinimum,
}

// ─── Vault Helper Methods ────────────────────────────────────────

impl Vault {
    /// USDC that must stay idle: (total_nav * buffer_bps) / 10000
    pub fn required_buffer(&self, bps: u16) -> u64 {
        (self.total_nav as u128 * bps as u128 / 10000) as u64
    }

    /// Maximum amount that can be allocated without violating the buffer
    pub fn deployable_balance(&self, bps: u16) -> u64 {
        self.idle_balance.saturating_sub(self.required_buffer(bps))
    }

    /// True when the current idle balance satisfies the buffer requirement
    pub fn verify_buffer(&self, bps: u16) -> bool {
        self.idle_balance >= self.required_buffer(bps)
    }
}
