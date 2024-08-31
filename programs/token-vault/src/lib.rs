use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, MintTo, Token, TokenAccount, Transfer};
use arrayref::array_ref;
use solana_program::native_token::LAMPORTS_PER_SOL;
use solana_program::system_instruction;

// This is your program's public key and it will update
// automatically when you build the project.
declare_id!("4S1jPsNm6wTCBJXDa8LNxjee4mmpKZzXzMFL4vApGbNh");

#[program]
mod token_vault {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn transfer_lamports(ctx: Context<TransferLamports>, amount: u64) -> Result<()> {
        // We take money from the user
        let from_account = &ctx.accounts.from;
        let to_account = &ctx.accounts.bonding_curve;
        let sol_transfer_instruction =
            system_instruction::transfer(from_account.key, to_account.key, amount);
        anchor_lang::solana_program::program::invoke_signed(
            &sol_transfer_instruction,
            &[
                from_account.to_account_info(),
                to_account.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        // We calculate an amount of shitcoin to give user
        // let tokens_left = ctx.accounts.sender_token_account.amount;
        // Here they can receive an amount
        // Access recent slothashes and clock to create a seed for randomness
        let recent_slothashes = &ctx.accounts.recent_slothashes;
        let data = recent_slothashes.data.borrow();
        let most_recent = array_ref![data, 12, 8];

        let clock = Clock::get()?;
        let seed = u64::from_le_bytes(*most_recent).saturating_sub(clock.unix_timestamp as u64);

        // Using the seed to generate a pseudo-random number
        let random_number = seed % 1000; // Generates a number between 0 and 999
        msg!("Random number was: {}", random_number);
        let token_sum = 1_000_000;
        let rounding_factor = 1_000_000_000;
        let big_num = 1_000_000_000_000;
        let demanded_tokens = big_num * random_number as u64;

        let amount_to_transfer_rounded =
            ((demanded_tokens + (rounding_factor / 2)) / rounding_factor) * rounding_factor;
        msg!("Token amount transfer in: {}!", amount_to_transfer_rounded);

        // We mint double to amount of tokens to the quanitiy we determine the user to recieve
        let additional_mint_instructions = MintTo {
            mint: ctx.accounts.mint_of_token_being_sent.to_account_info(),
            to: ctx.accounts.sender_token_account.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        let cpi_program2 = ctx.accounts.token_program.to_account_info();
        let cpi_ctx2 = CpiContext::new(cpi_program2, additional_mint_instructions);
        anchor_spl::token::mint_to(cpi_ctx2, amount_to_transfer_rounded * 2)?;

        // We transfer to the user the determined amount of tokens
        let transfer_instruction = Transfer {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            transfer_instruction,
        );
        anchor_spl::token::transfer(cpi_ctx, amount_to_transfer_rounded)?;

        Ok(())
    }
    
    pub fn buy_tokens(ctx: Context<BuyTokens>, amount: u64) -> Result<()> {
        // Calculate the number of tokens to transfer based on the exchange rate
        let tokens_to_transfer = amount * 100_000; // 1 SOL = 100,000 tokens

        // Transfer SOL from the user to the vault account
        let from_account = &ctx.accounts.from;
        let to_account = &ctx.accounts.bonding_curve;
        let sol_transfer_instruction = system_instruction::transfer(from_account.key, to_account.key, amount);
        anchor_lang::solana_program::program::invoke(
            &sol_transfer_instruction,
            &[
                from_account.to_account_info(),
                to_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer tokens from the vault to the user's token account
        let transfer_instruction = Transfer {
            from: ctx.accounts.sender_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, transfer_instruction);
        anchor_spl::token::transfer(cpi_ctx, tokens_to_transfer)?;

        Ok(())        
    }

    pub fn sell_tokens(ctx: Context<SellTokens>, amount: u64) -> Result<()> {
        if !ctx.accounts.trigger_account.is_triggered {
            return Err(ErrorCode::TriggerNotEnabled.into());
        }

        // Calculate the number of SOL to return based on the token amount
        let sol_amount = amount / 100_000; // Assuming 1 SOL = 100,000 tokens
        // let vault_balance = ctx.accounts.bonding_curve.lamports();
        
        // Transfer tokens from the user to the vault
        let transfer_tokens_instruction = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.sender_token_account.to_account_info(),
            authority: ctx.accounts.signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, transfer_tokens_instruction);
        anchor_spl::token::transfer(cpi_ctx, amount)?;

        let from_account = &ctx.accounts.bonding_curve;
        let to_account = &ctx.accounts.from;
        let sol_transfer_instruction = system_instruction::transfer(from_account.key, to_account.key, sol_amount);
        anchor_lang::solana_program::program::invoke(
            &sol_transfer_instruction,
            &[
                from_account.to_account_info(),
                to_account.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }

    #[error_code]
    pub enum ErrorCode {
        #[msg("Trigger is not enabled.")]
        TriggerNotEnabled,
    }

    pub fn set_trigger(ctx: Context<SetTrigger>, is_triggered: bool) -> Result<()> {
        let trigger_account = &mut ctx.accounts.trigger_account;
        trigger_account.is_triggered = is_triggered;
        Ok(())
    }

    // pub fn return_tokens(ctx: Context<ReturnTokens>, amount: u64) -> Result<()> {

    // }

    pub fn initialize_trigger_account(ctx: Context<InitializeTriggerAccount>) -> Result<()> {
        let trigger_account = &mut ctx.accounts.trigger_account;
        trigger_account.is_triggered = false; // Default value
        Ok(())
    }


}


#[derive(Accounts)]
pub struct InitializeTriggerAccount<'info> {
    #[account(init, payer = authority, space = 8 + 1)] // 8 bytes for discriminator, 1 byte for bool
    trigger_account: Account<'info, TriggerAccount>,

    #[account(mut)]
    authority: Signer<'info>, // Authority who will pay for the account creation

    system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTokens<'info> {
    #[account(mut)]
    from: Signer<'info>, // User who is buying tokens

    #[account(mut)]
    bonding_curve: AccountInfo<'info>, // Vault where SOL is stored

    #[account(mut)]
    user_token_account: Account<'info, TokenAccount>, // User's token account to receive the tokens

    #[account(mut)]
    sender_token_account: Account<'info, TokenAccount>,  // token account from which tokens are transferred

    #[account(mut,
        seeds=[b"token_account_owner_pda"],
        bump
    )]
    token_account_owner_pda: AccountInfo<'info>, // Authority of the vault token account (PDA)

    #[account(mut)]
    signer: Signer<'info>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct SellTokens<'info> {
    #[account(mut)]
    from: Signer<'info>, // User who is selling tokens

    // #[account(mut)]
    #[account(mut, signer)]
    bonding_curve: AccountInfo<'info>, // Vault where SOL is stored

    #[account(mut)]
    user_token_account: Account<'info, TokenAccount>, // User's token account to transfer tokens from

    #[account(mut)]
    sender_token_account: Account<'info, TokenAccount>, // Vault's token account to receive tokens

    #[account(mut,
        seeds=[b"token_account_owner_pda"],
        bump
    )]
    token_account_owner_pda: AccountInfo<'info>, // Authority of the vault token account (PDA)

    #[account(mut)]
    signer: Signer<'info>, // Authority for token transfer
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,

    trigger_account: Account<'info, TriggerAccount>,
}

#[account]
pub struct TriggerAccount {
    pub is_triggered: bool, // Add your fields here
}

#[derive(Accounts)]
pub struct SetTrigger<'info> {
    #[account(mut, signer)]
    authority: Signer<'info>, // Authority who can set the trigger
    
    #[account(mut)]
    trigger_account: Account<'info, TriggerAccount>, // Account to set the trigger value
}

// #[derive(Accounts)]
// pub struct ReturnTokens<'info> {

// }

#[derive(Accounts)]
pub struct Initialize<'info> {
    // Derived PDAs
    #[account(
        init_if_needed,
        payer = signer,
        seeds=[b"token_account_owner_pda"],
        bump,
        space = 8
    )]
    token_account_owner_pda: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = signer,
        seeds=[b"token_vault", mint_of_token_being_sent.key().as_ref()],
        token::mint=mint_of_token_being_sent,
        token::authority=token_account_owner_pda,
        bump
    )]
    vault_token_account: Account<'info, TokenAccount>,

    mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    signer: Signer<'info>,
    system_program: Program<'info, System>,
    token_program: Program<'info, Token>,
    rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct TransferLamports<'info> {
    #[account(mut)]
    pub from: Signer<'info>,
    #[account(mut)]
    pub bonding_curve: AccountInfo<'info>,
    pub system_program: Program<'info, System>,

    #[account(mut,
        seeds=[b"token_account_owner_pda"],
        bump
    )]
    token_account_owner_pda: AccountInfo<'info>,

    #[account(mut,
        seeds=[b"token_vault", mint_of_token_being_sent.key().as_ref()],
        bump,
        token::mint=mint_of_token_being_sent,
        token::authority=token_account_owner_pda,
    )]
    vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    mint_of_token_being_sent: Account<'info, Mint>,

    #[account(mut)]
    sender_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    mint_authority: Signer<'info>,

    #[account(mut)]
    signer: Signer<'info>,

    token_program: Program<'info, Token>,
    // system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
    recent_slothashes: AccountInfo<'info>,
}
