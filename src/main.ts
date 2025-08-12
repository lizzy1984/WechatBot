import { WechatyBuilder } from "wechaty";
import QRCode from "qrcode";
import { ChatGPTBot } from "./bot.js";

const chatGPTBot = new ChatGPTBot();

const bot = WechatyBuilder.build({
  name: "wechat-assistant", // generate xxxx.memory-card.json and save login data for the next login
  puppetOptions: {
    uos: true, // 开启uos协议
  },
  puppet: "wechaty-puppet-wechat",
});

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Cleanup bot resources
    chatGPTBot.cleanup();
    
    // Stop the bot
    await bot.stop();
    
    console.log("✅ Shutdown completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
    process.exit(1);
  }
}

/**
 * Setup process signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach(signal => {
    process.on(signal, () => gracefulShutdown(signal));
  });
}

/**
 * Setup error handlers
 */
function setupErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });
}

/**
 * Main function with improved error handling and monitoring
 */
async function main(): Promise<void> {
  try {
    console.log("🚀 Starting WeChat ChatGPT Bot...");
    
    // Setup handlers
    setupSignalHandlers();
    setupErrorHandlers();
    
    // Start ChatGPT bot
    await chatGPTBot.startGPTBot();
    
    // Setup bot event handlers
    bot
      .on("scan", async (qrcode, status) => {
        const url = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
        console.log(`📱 Scan QR Code to login: ${status}\n${url}`);
        
        try {
          const qrString = await QRCode.toString(qrcode, { 
            type: "terminal", 
            small: true,
            margin: 1,
            width: 60
          });
          console.log(qrString);
        } catch (error) {
          console.error("Failed to generate QR code:", error);
        }
      })
      .on("login", async (user) => {
        console.log(`✅ User ${user.name()} logged in successfully`);
        chatGPTBot.setBotName(user.name());
      })
      .on("logout", (user) => {
        console.log(`👋 User ${user.name()} logged out`);
      })
      .on("error", (error) => {
        console.error("🔥 Bot error:", error);
      })
      .on("message", async (message) => {
        if (!chatGPTBot.ready) {
          return;
        }
        
        // Handle ping command for health check
        const messageText = message.text();
        if (messageText.startsWith("/ping")) {
          await message.say("🏓 pong");
          return;
        }
        
        try {
          console.log(`📨 Processing message: ${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}`);
          await chatGPTBot.onMessage(message);
        } catch (error) {
          console.error("❌ Error processing message:", error);
        }
      });

    // Start the bot
    console.log("🔄 Starting bot...");
    await bot.start();
    console.log("✅ Bot started successfully!");
    
  } catch (error) {
    console.error("⚠️ Bot startup failed:", error);
    
    if (error instanceof Error) {
      if (error.message.includes("login")) {
        console.error("💡 Hint: Try logging in through WeChat web client first");
      }
      if (error.message.includes("puppet")) {
        console.error("💡 Hint: Check if wechaty-puppet-wechat is properly installed");
      }
    }
    
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  console.error("💥 Fatal error:", error);
  process.exit(1);
});
