use anchor_lang::prelude::*;

declare_id!("FZ5EaUHqohNGBdsvjr4LYnK181xoBWNhZiUg1iTaf9f7");

#[program]
pub mod mock_notabene {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(!config.initialized, NotabeneError::AlreadyInitialized);

        config.admin = ctx.accounts.authority.key();
        config.total_checks = 0;
        config.total_vasps = 0;
        config.initialized = true;

        Ok(())
    }

    pub fn register_vasp(
        ctx: Context<RegisterVASP>,
        vasp_id: String,
        name: String,
        jurisdiction: String,
        lei: String,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_vasps = config.total_vasps.checked_add(1).unwrap();

        let vasp = &mut ctx.accounts.vasp;
        vasp.vasp_id = vasp_id.clone();
        vasp.name = name.clone();
        vasp.jurisdiction = jurisdiction.clone();
        vasp.lei = lei;
        vasp.status = VASPStatus::Active;
        vasp.registered_at = Clock::get()?.unix_timestamp;

        emit!(VASPRegistered {
            vasp_id,
            name,
            jurisdiction,
            timestamp: vasp.registered_at,
        });

        Ok(())
    }

    pub fn evaluate_transfer(
        ctx: Context<EvaluateTransfer>,
        check_id: String,
        originator_vasp: String,
        beneficiary_vasp: String,
        originator_wallet: Pubkey,
        beneficiary_wallet: Pubkey,
        amount: u64,
        currency: String,
        originator_jurisdiction: String,
        beneficiary_jurisdiction: String,
        threshold: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.total_checks = config.total_checks.checked_add(1).unwrap();

        let status = if originator_jurisdiction == beneficiary_jurisdiction {
            TravelRuleStatus::Exempt
        } else if amount < threshold {
            TravelRuleStatus::Exempt
        } else if originator_vasp.is_empty() || beneficiary_vasp.is_empty() {
            TravelRuleStatus::PendingReview
        } else {
            TravelRuleStatus::Compliant
        };

        let check = &mut ctx.accounts.check;
        check.check_id = check_id.clone();
        check.originator_vasp = originator_vasp;
        check.beneficiary_vasp = beneficiary_vasp;
        check.originator_wallet = originator_wallet;
        check.beneficiary_wallet = beneficiary_wallet;
        check.amount = amount;
        check.currency = currency;
        check.originator_jurisdiction = originator_jurisdiction.clone();
        check.beneficiary_jurisdiction = beneficiary_jurisdiction.clone();
        check.threshold_applied = threshold;
        check.status = status.clone();
        check.checked_at = Clock::get()?.unix_timestamp;

        emit!(TravelRuleEvaluated {
            check_id,
            amount,
            status,
            originator_jurisdiction,
            beneficiary_jurisdiction,
            timestamp: check.checked_at,
        });

        Ok(())
    }

    pub fn update_check_status(
        ctx: Context<UpdateCheck>,
        new_status: TravelRuleStatus,
    ) -> Result<()> {
        let check = &mut ctx.accounts.check;
        check.status = new_status;
        Ok(())
    }

    pub fn suspend_vasp(ctx: Context<SuspendVASP>) -> Result<()> {
        let vasp = &mut ctx.accounts.vasp;
        vasp.status = VASPStatus::Suspended;
        Ok(())
    }
}

// ─── Account Structures ─────────────────────────────────────────

#[account]
pub struct NotabeneConfig {
    pub admin: Pubkey,
    pub total_checks: u64,
    pub total_vasps: u64,
    pub initialized: bool,
}

#[account]
pub struct VASPEntry {
    pub vasp_id: String,
    pub name: String,
    pub jurisdiction: String,
    pub lei: String,
    pub status: VASPStatus,
    pub registered_at: i64,
}

#[account]
pub struct TravelRuleCheck {
    pub check_id: String,
    pub originator_vasp: String,
    pub beneficiary_vasp: String,
    pub originator_wallet: Pubkey,
    pub beneficiary_wallet: Pubkey,
    pub amount: u64,
    pub currency: String,
    pub originator_jurisdiction: String,
    pub beneficiary_jurisdiction: String,
    pub threshold_applied: u64,
    pub status: TravelRuleStatus,
    pub checked_at: i64,
}

// ─── Enums ──────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum VASPStatus {
    Active,
    Suspended,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TravelRuleStatus {
    Exempt,
    Compliant,
    PendingReview,
    Blocked,
}

// ─── Instruction Contexts ───────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 1,
        seeds = [b"notabene_config"],
        bump,
    )]
    pub config: Account<'info, NotabeneConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(vasp_id: String)]
pub struct RegisterVASP<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+24) + (4+32) + (4+8) + (4+24) + 1 + 8 + 64,
        seeds = [b"vasp", vasp_id.as_bytes()],
        bump,
    )]
    pub vasp: Account<'info, VASPEntry>,
    #[account(mut, seeds = [b"notabene_config"], bump)]
    pub config: Account<'info, NotabeneConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(check_id: String)]
pub struct EvaluateTransfer<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + (4+16) + (4+24) + (4+24) + 32 + 32 + 8 + (4+8) + (4+8) + (4+8) + 8 + 1 + 8 + 64,
        seeds = [b"travel_rule", check_id.as_bytes()],
        bump,
    )]
    pub check: Account<'info, TravelRuleCheck>,
    #[account(mut, seeds = [b"notabene_config"], bump)]
    pub config: Account<'info, NotabeneConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateCheck<'info> {
    #[account(mut)]
    pub check: Account<'info, TravelRuleCheck>,
    #[account(seeds = [b"notabene_config"], bump)]
    pub config: Account<'info, NotabeneConfig>,
    #[account(constraint = authority.key() == config.admin @ NotabeneError::Unauthorized)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SuspendVASP<'info> {
    #[account(mut)]
    pub vasp: Account<'info, VASPEntry>,
    #[account(seeds = [b"notabene_config"], bump)]
    pub config: Account<'info, NotabeneConfig>,
    #[account(constraint = authority.key() == config.admin @ NotabeneError::Unauthorized)]
    pub authority: Signer<'info>,
}

// ─── Events ─────────────────────────────────────────────────────

#[event]
pub struct VASPRegistered {
    pub vasp_id: String,
    pub name: String,
    pub jurisdiction: String,
    pub timestamp: i64,
}

#[event]
pub struct TravelRuleEvaluated {
    pub check_id: String,
    pub amount: u64,
    pub status: TravelRuleStatus,
    pub originator_jurisdiction: String,
    pub beneficiary_jurisdiction: String,
    pub timestamp: i64,
}

// ─── Errors ─────────────────────────────────────────────────────

#[error_code]
pub enum NotabeneError {
    #[msg("Notabene instance already initialized")]
    AlreadyInitialized,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
}
