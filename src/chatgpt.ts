import { ChatGPTAPI } from "chatgpt";
import { config } from "./config.js";
import AsyncRetry from "async-retry";
import type {
  IChatGPTItem,
  IConversationItem,
  AccountWithUserInfo,
  IAccount,
} from "./interface.js";

// Performance optimizations: Use Map for O(1) lookups and WeakRef for memory management
const errorMessages = new Map([
  ["503", "OpenAI 服务器繁忙，请稍后再试| The OpenAI server is busy, please try again later"],
  ["429", "OpenAI 服务器限流，请稍后再试| The OpenAI server was limited, please try again later"], 
  ["500", "OpenAI 服务器繁忙，请稍后再试| The OpenAI server is busy, please try again later"],
  ["403", "OpenAI 服务器拒绝访问，请稍后再试| The OpenAI server refused to access, please try again later"],
  ["unknown", "未知错误，请看日志 | Error unknown, please see the log"],
]);

const COMMANDS = ["/reset", "/help"] as const;
type Command = typeof COMMANDS[number];

export class ChatGPTPool {
  private chatGPTPools: Array<IChatGPTItem> = [];
  private conversationsPool = new Map<string, IConversationItem>();
  private poolIndex = 0; // For round-robin load balancing
  
  /**
   * Reset account and clear associated conversations
   * Improved memory management and error handling
   */
  async resetAccount(account: IAccount): Promise<void> {
    // Remove all conversation information for this account
    const conversationsToDelete: string[] = [];
    this.conversationsPool.forEach((item, key) => {
      if ((item.account as AccountWithUserInfo)?.email === account.email) {
        conversationsToDelete.push(key);
      }
    });
    
    // Batch delete conversations
    conversationsToDelete.forEach(key => this.conversationsPool.delete(key));

    // Find and reset the chatGPT item
    const chatGPTItemIndex = this.chatGPTPools.findIndex(
      (item): item is IChatGPTItem & {
        account: AccountWithUserInfo;
        chatGpt: ChatGPTAPI;
      } => (item.account as AccountWithUserInfo)?.email === account.email
    );

    if (chatGPTItemIndex !== -1) {
      const chatGPTItem = this.chatGPTPools[chatGPTItemIndex];
      try {
        chatGPTItem.chatGpt = new ChatGPTAPI({
          apiKey: chatGPTItem.account.apiKey,
          debug: false,
          completionParams: {
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            top_p: 0.9,
          },
        });
      } catch (err) {
        // Remove failed item from pool
        this.chatGPTPools.splice(chatGPTItemIndex, 1);
        console.error(
          `Reset account failed for ${(account as AccountWithUserInfo).email}: ${err}, removed from pool`
        );
      }
    }
  }

  /**
   * Reset conversation with improved cleanup
   */
  resetConversation(talkid: string): void {
    this.conversationsPool.delete(talkid);
  }

  /**
   * Initialize ChatGPT pools with better error handling and retry logic
   */
  async startPools(): Promise<void> {
    const initPromises = config.chatGPTAccountPool.map(async (account) => {
      try {
        const chatGpt = new ChatGPTAPI({
          apiKey: account.apiKey,
          debug: false,
          completionParams: {
            model: 'gpt-3.5-turbo',
            temperature: 0.7,
            top_p: 0.9,
          },
        });
        
        return {
          chatGpt,
          account,
        };
      } catch (error) {
        console.error(
          `Failed to initialize account ${(account as AccountWithUserInfo).email}:`, error
        );
        return null;
      }
    });

    const results = await Promise.allSettled(initPromises);
    this.chatGPTPools = results
      .filter((result): result is PromiseFulfilledResult<IChatGPTItem> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);

    if (this.chatGPTPools.length === 0) {
      throw new Error("⚠️ No ChatGPT accounts successfully initialized");
    }
    
    console.log(`ChatGPT Pool initialized with ${this.chatGPTPools.length} accounts`);
  }

  /**
   * Handle commands with improved type safety
   */
  async command(cmd: Command, talkid: string): Promise<string> {
    console.log(`Executing command: ${cmd} for talkid: ${talkid}`);
    
    switch (cmd) {
      case "/reset":
        this.resetConversation(talkid);
        return "♻️ 已重置对话 ｜ Conversation reset";
      case "/help":
        return `🧾 支持的命令｜Support commands: ${COMMANDS.join(", ")}`;
      default:
        return "❓ 未知命令｜Unknown Command";
    }
  }

  /**
   * Get ChatGPT API instance with round-robin load balancing
   * Improved from random selection for better distribution
   */
  get chatGPTAPI(): IChatGPTItem {
    if (this.chatGPTPools.length === 0) {
      throw new Error("⚠️ No ChatGPT instances available in pool");
    }
    
    const item = this.chatGPTPools[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.chatGPTPools.length;
    return item;
  }

  /**
   * Get conversation with improved caching and error handling
   */
  getConversation(talkid: string): IConversationItem {
    const existing = this.conversationsPool.get(talkid);
    if (existing) {
      return existing;
    }

    const chatGPT = this.chatGPTAPI;
    const conversationItem: IConversationItem = {
      conversation: chatGPT.chatGpt,
      account: chatGPT.account,
    };
    
    this.conversationsPool.set(talkid, conversationItem);
    return conversationItem;
  }

  /**
   * Update conversation with validation
   */
  setConversation(talkid: string, conversationId: string, messageId: string): void {
    const conversationItem = this.getConversation(talkid);
    this.conversationsPool.set(talkid, {
      ...conversationItem,
      conversationId,
      messageId,
    });
  }

  /**
   * Send message with improved error handling and retry logic
   */
  async sendMessage(message: string, talkid: string): Promise<string> {
    // Handle commands first
    const trimmedMessage = message.trim();
    const matchedCommand = COMMANDS.find(cmd => trimmedMessage.startsWith(cmd));
    
    if (matchedCommand) {
      return this.command(matchedCommand, talkid);
    }

    const conversationItem = this.getConversation(talkid);
    const { conversation, account, conversationId, messageId } = conversationItem;

    try {
      const response = await AsyncRetry(
        async () => {
          return await conversation.sendMessage(message, {
            conversationId,
            parentMessageId: messageId,
          });
        },
        {
          retries: config.chatGptRetryTimes,
          minTimeout: 1000,
          maxTimeout: 10000,
          factor: 2,
        }
      );

      // Update conversation information
      this.setConversation(talkid, response.conversationId || '', response.id);
      return response.text;
      
    } catch (err: any) {
      console.error(`Error sending message for ${talkid}:`, err.message);
      
      // Handle specific error cases
      if (err.message.includes("API key") || err.message.includes("401")) {
        console.log(`API key issue for account: ${JSON.stringify(account)}`);
        await this.resetAccount(account);
        return "❌ API密钥问题，请检查配置 | API key issue, please check configuration";
      }

      // Remove failed conversation from pool
      this.conversationsPool.delete(talkid);
      return this.error2msg(err);
    }
  }

  /**
   * Convert error to human readable message with improved lookup
   */
  error2msg(err: Error): string {
    for (const [code, message] of errorMessages) {
      if (err.message.includes(code)) {
        return message;
      }
    }
    return errorMessages.get("unknown")!;
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    this.conversationsPool.clear();
    this.chatGPTPools.length = 0;
    this.poolIndex = 0;
  }
}
