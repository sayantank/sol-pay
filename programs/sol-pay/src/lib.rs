use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{CloseAccount, Mint, Token, TokenAccount, Transfer}};

declare_id!("6qZM5m4H6ZspdKraMmJKCLNbFmw6hdWt6z3h71gScQmq");

#[error]
pub enum ErrorCode {
    #[msg("Wallet to withdraw from is not owned by owner")]
    WalletToWithdrawFromInvalid,
    #[msg("State index is inconsistent")]
    InvalidStateIdx,
    #[msg("Delegate is not set correctly")]
    DelegateNotSetCorrectly,
    #[msg("Stage is invalid")]
    StageInvalid
}

fn transfer_escrow_out<'info>(
    from_user: AccountInfo<'info>,
    to_user: AccountInfo<'info>,
    mint_of_token_being_sent: AccountInfo<'info>,
    escrow_wallet: &mut Account<'info, TokenAccount>,
    escrow_id: u64,
    escrow_state: AccountInfo<'info>,
    state_bump: u8,
    token_program: AccountInfo<'info>,
    destination_wallet: AccountInfo<'info>,
    amount: u64
) -> ProgramResult {

    let state_bump_bytes = state_bump.to_le_bytes();
    let mint_of_token_being_sent_pk = mint_of_token_being_sent.key().clone();
    let escrow_id_bytes = escrow_id.to_le_bytes();
    let inner = vec![
        b"escrow_state".as_ref(),
        from_user.key.as_ref(),
        to_user.key.as_ref(),
        mint_of_token_being_sent_pk.as_ref(), 
        escrow_id_bytes.as_ref(),
        state_bump_bytes.as_ref(),
    ];
    let outer = vec![inner.as_slice()];

    let transfer_instruction = Transfer{
        from: escrow_wallet.to_account_info(),
        to: destination_wallet,
        authority: escrow_state.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        token_program.to_account_info(),
        transfer_instruction,
        outer.as_slice(),
    );
    anchor_spl::token::transfer(cpi_ctx, amount)?;

    // Checking if account needs to be closed.
    let should_close = {
        escrow_wallet.reload()?;
        escrow_wallet.amount == 0
    };

    if should_close {
        let ca = CloseAccount{
            account: escrow_wallet.to_account_info(),
            destination: from_user.to_account_info(),
            authority: escrow_state.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            ca,
            outer.as_slice(),
        );
        anchor_spl::token::close_account(cpi_ctx)?;
    }

    Ok(())
}

#[program]
pub mod sol_pay {
    use super::*;
    pub fn initialize_new_escrow(ctx: Context<InitializeNewEscrow>, escrow_id: u64, state_bump: u8, _wallet_bump: u8, amount: u64) -> ProgramResult {
        let state = &mut ctx.accounts.escrow_state_account;
        state.id = escrow_id;
        state.amount = amount;
        state.from_user = ctx.accounts.from_user.key().clone();
        state.to_user = ctx.accounts.to_user.key().clone();
        state.mint_of_token_being_sent = ctx.accounts.mint_of_token_being_sent.key().clone();
        state.escrow_wallet_account = ctx.accounts.escrow_wallet_account.key().clone();
        
        msg!("Initialized escrow for amount: {}", amount);

        let state_bump_bytes = state_bump.to_le_bytes();
        let mint_of_token_being_sent_pk = ctx.accounts.mint_of_token_being_sent.key().clone();
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let inner = vec![
            b"escrow_state".as_ref(),
            ctx.accounts.from_user.key.as_ref(),
            ctx.accounts.to_user.key.as_ref(),
            mint_of_token_being_sent_pk.as_ref(),
            escrow_id_bytes.as_ref(),
            state_bump_bytes.as_ref(),
        ];
        let outer = vec![inner.as_slice()];

        let transfer_instruction = Transfer {
            from: ctx.accounts.wallet_to_withdraw_from.to_account_info(),
            to: ctx.accounts.escrow_wallet_account.to_account_info(),
            authority: ctx.accounts.from_user.to_account_info()
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(), 
            transfer_instruction, 
            outer.as_slice(),
        );

        anchor_spl::token::transfer(cpi_ctx, state.amount)?;

        state.stage = Stage::FundsDeposited.to_code();

        Ok(())
    }

    pub fn complete_escrow(ctx: Context<CompleteEscrow>, escrow_id: u64, state_bump: u8, _wallet_bump: u8) -> ProgramResult {
        if Stage::from(ctx.accounts.escrow_state_account.stage)? != Stage::FundsDeposited {
            msg!("Stage is invalid, state stage is {}", ctx.accounts.escrow_state_account.stage);
            return Err(ErrorCode::StageInvalid.into());
        }

        transfer_escrow_out(
            ctx.accounts.from_user.to_account_info(),
            ctx.accounts.to_user.to_account_info(),
            ctx.accounts.mint_of_token_being_sent.to_account_info(),
            &mut ctx.accounts.escrow_wallet_account,
            escrow_id,
            ctx.accounts.escrow_state_account.to_account_info(),
            state_bump,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.wallet_to_deposit_to.to_account_info(),
            ctx.accounts.escrow_state_account.amount
        )?;

        let state = &mut ctx.accounts.escrow_state_account;
        state.stage = Stage::EscrowCompleted.to_code();

        Ok(())
    }

    pub fn pullback_escrow(ctx: Context<PullbackEscrow>, escrow_id: u64, state_bump: u8, _wallet_bump: u8) -> ProgramResult {
        if Stage::from(ctx.accounts.escrow_state_account.stage)? == Stage::EscrowCompleted {
            msg!("Stage is invalid, state stage is {}", ctx.accounts.escrow_state_account.stage);
            return Err(ErrorCode::StageInvalid.into());
        }

        transfer_escrow_out(
            ctx.accounts.from_user.to_account_info(),
            ctx.accounts.to_user.to_account_info(),
            ctx.accounts.mint_of_token_being_sent.to_account_info(),
            &mut ctx.accounts.escrow_wallet_account,
            escrow_id,
            ctx.accounts.escrow_state_account.to_account_info(),
            state_bump,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.refund_wallet.to_account_info(),
            ctx.accounts.escrow_state_account.amount,
        )?;

        let state = &mut ctx.accounts.escrow_state_account;
        state.stage = Stage::PullBackComplete.to_code();

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(escrow_id: u64, state_bump: u8, wallet_bump: u8)]
pub struct InitializeNewEscrow<'info> {
    #[account(
        init,
        payer = from_user,
        seeds = [b"escrow_state".as_ref(), from_user.key().as_ref(), to_user.key().as_ref(), mint_of_token_being_sent.key().as_ref(), escrow_id.to_le_bytes().as_ref()],
        bump = state_bump,
    )]
    escrow_state_account: Account<'info, EscrowState>,

    #[account(
        init,
        payer = from_user,
        seeds = [b"escrow_wallet".as_ref(), from_user.key().as_ref(), to_user.key().as_ref(), mint_of_token_being_sent.key().as_ref(), escrow_id.to_le_bytes().as_ref()],
        bump = wallet_bump,
        token::mint = mint_of_token_being_sent,
        token::authority = escrow_state_account,
    )]
    escrow_wallet_account: Account<'info, TokenAccount>,

    #[account(mut)]
    from_user: Signer<'info>,

    to_user: AccountInfo<'info>,

    mint_of_token_being_sent: Account<'info, Mint>,

    #[account(
        mut,
        constraint = wallet_to_withdraw_from.owner == from_user.key(),
        constraint = wallet_to_withdraw_from.mint == mint_of_token_being_sent.key()
    )]
    wallet_to_withdraw_from: Account<'info, TokenAccount>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
#[instruction(escrow_id: u64, state_bump: u8, wallet_bump: u8)]
pub struct CompleteEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow_state".as_ref(), from_user.key().as_ref(), to_user.key().as_ref(), mint_of_token_being_sent.key().as_ref(), escrow_id.to_le_bytes().as_ref()],
        bump = state_bump,
        has_one = from_user,
        has_one = to_user,
        has_one = mint_of_token_being_sent,
    )]
    escrow_state_account: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"escrow_wallet".as_ref(), from_user.key().as_ref(), to_user.key().as_ref(), mint_of_token_being_sent.key().as_ref(), escrow_id.to_le_bytes().as_ref()],
        bump = wallet_bump,
    )]
    escrow_wallet_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = to_user,
        associated_token::mint = mint_of_token_being_sent,
        associated_token::authority = to_user,
    )]
    wallet_to_deposit_to: Account<'info, TokenAccount>,

    #[account(mut)]
    from_user: AccountInfo<'info>,

    #[account(mut)]
    to_user: Signer<'info>,

    mint_of_token_being_sent: Account<'info, Mint>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(escrow_id: u64, state_bump: u8, wallet_bump: u8)]
pub struct PullbackEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow_state".as_ref(), from_user.key().as_ref(), to_user.key().as_ref(), mint_of_token_being_sent.key().as_ref(), escrow_id.to_le_bytes().as_ref()],
        bump = state_bump,
        has_one = from_user,
        has_one = to_user,
        has_one = mint_of_token_being_sent,
    )]
    escrow_state_account: Account<'info, EscrowState>,

    #[account(
        mut,
        seeds = [b"escrow_wallet".as_ref(), from_user.key().as_ref(), to_user.key().as_ref(), mint_of_token_being_sent.key().as_ref(), escrow_id.to_le_bytes().as_ref()],
        bump = wallet_bump,
    )]
    escrow_wallet_account: Account<'info, TokenAccount>,

    #[account(mut)]
    from_user: Signer<'info>,

    to_user: AccountInfo<'info>,

    mint_of_token_being_sent: Account<'info, Mint>,

    #[account(
        mut,
        constraint=refund_wallet.owner == from_user.key(),
        constraint=refund_wallet.mint == mint_of_token_being_sent.key()
    )]
    refund_wallet: Account<'info, TokenAccount>,

    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}

#[account]
#[derive(Default)]
pub struct EscrowState {
    id: u64,
    amount: u64,
    from_user: Pubkey,
    to_user: Pubkey,
    mint_of_token_being_sent: Pubkey,
    escrow_wallet_account: Pubkey,
    stage: u8,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Stage {
    FundsDeposited,
    EscrowCompleted,
    PullBackComplete,
}

impl Stage {
    fn to_code(&self) -> u8 {
        match self {
            Stage::FundsDeposited => 1,
            Stage::EscrowCompleted => 2,
            Stage::PullBackComplete => 3,
        }
    }

    fn from(val: u8) -> std::result::Result<Stage, ProgramError> {
        match val {
            1 => Ok(Stage::FundsDeposited),
            2 => Ok(Stage::EscrowCompleted),
            3 => Ok(Stage::PullBackComplete),
            unknown_value => {
                msg!("Unknown stage: {}", unknown_value);
                Err(ErrorCode::StageInvalid.into())
            }
        }
    }
}

