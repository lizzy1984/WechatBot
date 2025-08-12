import { WechatyBuilder } from "wechaty";
import QRCode from "qrcode";
import { ChatGPTBot } from "./bot.js";

// Performance optimization: Add performance monitoring
const startTime = Date.now();

const chatGPTBot = new ChatGPTBot();
const bot = WechatyBuilder.build({
  name: "wechat-assistant",
  puppetOptions: {
    uos: true, // 开启uos协议
  },
  puppet: "wechaty-puppet-wechat",
});

// Performance optimization: Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Cleanup bot resources
    if (chatGPTBot) {
      chatGPTBot.cleanup();
    }
    
    // Stop the bot
    if (bot) {
      await bot.stop();
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Performance optimization: Add signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // For nodemon

// Performance optimization: Add uncaught exception handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

async function main() {
  try {
    console.log('🚀 Starting WeChat ChatGPT Bot...');
    
    // Performance optimization: Start GPT bot in parallel with bot setup
    const gptBotPromise = chatGPTBot.startGPTBot();
    
    // Setup bot event handlers
    bot
      .on("scan", async (qrcode, status) => {
        const url = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
        console.log(`Scan QR Code to login: ${status}\n${url}`);
        
        // Performance optimization: Only generate QR code in terminal for development
        if (process.env.NODE_ENV !== 'production') {
          console.log(await QRCode.toString(qrcode, { type: "terminal", small: true }));
        }
      })
      .on("login", async (user) => {
        const loginTime = Date.now();
        console.log(`User ${user} logged in`);
        chatGPTBot.setBotName(user.name());
        
        if (process.env.NODE_ENV !== 'production') {
          console.log(`⏱️ Login completed in ${loginTime - startTime}ms`);
        }
      })
      .on("message", async (message) => {
        if (!chatGPTBot.ready) {
          return;
        }
        
        // Performance optimization: Handle ping command immediately
        if (message.text().startsWith("/ping")) {
          await message.say("pong");
          return;
        }
        
        try {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`Message: ${message}`);
          }
          
          const messageStartTime = Date.now();
          await chatGPTBot.onMessage(message);
          
          if (process.env.NODE_ENV !== 'production') {
            const processingTime = Date.now() - messageStartTime;
            console.log(`⏱️ Message processed in ${processingTime}ms`);
          }
        } catch (e) {
          console.error('❌ Error processing message:', e);
        }
      })
      .on("error", (error) => {
        console.error('❌ Bot error:', error);
      });

    // Wait for both GPT bot and WeChat bot to be ready
    await Promise.all([gptBotPromise, bot.start()]);
    
    const totalStartupTime = Date.now() - startTime;
    console.log(`🎉 Bot started successfully in ${totalStartupTime}ms`);
    
    // Performance optimization: Log memory usage in development
    if (process.env.NODE_ENV !== 'production') {
      const memUsage = process.memoryUsage();
      console.log('📊 Memory usage:', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      });
    }
    
  } catch (e) {
    console.error(`❌ Bot start failed: ${e}`);
    console.error('💡 Can you log in through WeChat on the web?');
    process.exit(1);
  }
}

// Performance optimization: Add startup timeout
const startupTimeout = setTimeout(() => {
  console.error('⏰ Startup timeout reached. Exiting...');
  process.exit(1);
}, 60000); // 60 seconds

main().then(() => {
  clearTimeout(startupTimeout);
}).catch((error) => {
  clearTimeout(startupTimeout);
  console.error('❌ Fatal error during startup:', error);
  process.exit(1);
});
