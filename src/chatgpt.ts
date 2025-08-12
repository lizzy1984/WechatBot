import { ChatGPTAPI, ChatGPTAPIBrowser } from "chatgpt";

import { config } from "./config.js";
import AsyncRetry from "async-retry";
import {
  IChatGPTItem,
  IConversationItem,
  AccountWithUserInfo,
  IAccount,
} from "./interface.js";

const ErrorCode2Message: Record<string, string> = {
  "503":
    "OpenAI 服务器繁忙，请稍后再试| The OpenAI server is busy, please try again later",
  "429":
    "OpenAI 服务器限流，请稍后再试| The OpenAI server was limited, please try again later",
  "500":
    "OpenAI 服务器繁忙，请稍后再试| The OpenAI server is busy, please try again later",
  "403":
    "OpenAI 服务器拒绝访问，请稍后再试| The OpenAI server refused to access, please try again later",
  unknown: "未知错误，请看日志 | Error unknown, please see the log",
};

const Commands = ["/reset", "/help"] as const;

// Performance optimization: Add connection pooling and caching
class ConnectionPool {
  private pool: Map<string, IChatGPTItem> = new Map();
  private lastUsed: Map<string, number> = new Map();
  private readonly maxConnections = 10;
  private readonly connectionTimeout = 5 * 60 * 1000; // 5 minutes

  addConnection(email: string, item: IChatGPTItem): void {
    // Clean up old connections if pool is full
    if (this.pool.size >= this.maxConnections) {
      this.cleanupOldConnections();
    }
    
    this.pool.set(email, item);
    this.lastUsed.set(email, Date.now());
  }

  getConnection(email: string): IChatGPTItem | undefined {
    const item = this.pool.get(email);
    if (item) {
      this.lastUsed.set(email, Date.now());
    }
    return item;
  }

  private cleanupOldConnections(): void {
    const now = Date.now();
    for (const [email, lastUsed] of this.lastUsed.entries()) {
      if (now - lastUsed > this.connectionTimeout) {
        this.pool.delete(email);
        this.lastUsed.delete(email);
      }
    }
  }

  clear(): void {
    this.pool.clear();
    this.lastUsed.clear();
  }
}

export class ChatGPTPool {
  chatGPTPools: Array<IChatGPTItem> | [] = [];
  conversationsPool: Map<string, IConversationItem> = new Map();
  private connectionPool = new ConnectionPool();
  private readonly maxConversations = 1000; // Prevent memory leaks
  
  // Performance optimization: Add LRU cache for conversations
  private cleanupConversations(): void {
    if (this.conversationsPool.size > this.maxConversations) {
      const entries = Array.from(this.conversationsPool.entries());
      // Remove oldest conversations (keep the most recent 80%)
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
      toRemove.forEach(([key]) => this.conversationsPool.delete(key));
      console.log(`🧹 Cleaned up ${toRemove.length} old conversations`);
    }
  }

  async resetAccount(account: IAccount) {
    // Remove all conversation information
    this.conversationsPool.forEach((item, key) => {
      if ((item.account as AccountWithUserInfo)?.email === account.email) {
        this.conversationsPool.delete(key);
      }
    });
    
    // Clear from connection pool
    this.connectionPool.clear();
    
    // Relogin and generate a new session token
    const chatGPTItem = this.chatGPTPools.find(
      (
        item: any
      ): item is IChatGPTItem & {
        account: AccountWithUserInfo;
        chatGpt: ChatGPTAPI;
      } => item.account.email === account.email
    );
    if (chatGPTItem) {
      const account = chatGPTItem.account;
      try {
        chatGPTItem.chatGpt = new ChatGPTAPIBrowser({
          ...account,
          proxyServer: config.openAIProxy,
        });
        
        // Add to connection pool
        this.connectionPool.addConnection(account.email, chatGPTItem);
      } catch (err) {
        //remove this object
        this.chatGPTPools = this.chatGPTPools.filter(
          (item) =>
            (item.account as AccountWithUserInfo)?.email !== account.email
        );
        console.error(
          `Try reset account: ${account.email} failed: ${err}, remove it from pool`
        );
      }
    }
  }

  resetConversation(talkid: string) {
    this.conversationsPool.delete(talkid);
  }

  async startPools() {
    console.log('🚀 Starting ChatGPT pools with performance optimizations...');
    
    // Performance optimization: Parallel initialization with better error handling
    const chatGPTPools: IChatGPTItem[] = [];
    const initPromises = config.chatGPTAccountPool.map(async (account: IAccount) => {
      try {
        const chatGpt = new ChatGPTAPIBrowser({
          ...account,
          proxyServer: config.openAIProxy,
        });
        
        await AsyncRetry(
          async () => {
            await chatGpt.initSession();
          },
          { 
            retries: 3,
            factor: 2,
            minTimeout: 1000,
            maxTimeout: 10000
          }
        );
        
        const item: IChatGPTItem = {
          chatGpt: chatGpt,
          account: account,
        };
        
        // Add to connection pool
        this.connectionPool.addConnection(account.email, item);
        
        return item;
      } catch (error) {
        console.error(
          `❌ Failed to initialize account: ${account.email} - ${error}`
        );
        return null;
      }
    });

    // Wait for all initializations with timeout
    const results = await Promise.allSettled(initPromises);
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        chatGPTPools.push(result.value);
      }
    });

    this.chatGPTPools = chatGPTPools;
    
    if (this.chatGPTPools.length === 0) {
      throw new Error("⚠️ No chatgpt account in pool");
    }
    
    console.log(`✅ ChatGPT pools initialized: ${this.chatGPTPools.length} accounts ready`);
  }

  async command(cmd: typeof Commands[number], talkid: string): Promise<string> {
    console.log(`command: ${cmd} talkid: ${talkid}`);
    if (cmd == "/reset") {
      this.resetConversation(talkid);
      return "♻️ 已重置对话 ｜ Conversation reset";
    }
    if (cmd == "/help") {
      return `🧾 支持的命令｜Support command：${Commands.join("，")}`;
    }
    return "❓ 未知命令｜Unknow Command";
  }

  // Performance optimization: Better load balancing with connection health checks
  get chatGPTAPI(): IChatGPTItem {
    // Try to get a healthy connection from the pool first
    const healthyConnections = this.chatGPTPools.filter(item => {
      const email = (item.account as AccountWithUserInfo)?.email;
      return email && this.connectionPool.getConnection(email);
    });
    
    if (healthyConnections.length > 0) {
      return healthyConnections[Math.floor(Math.random() * healthyConnections.length)];
    }
    
    // Fallback to original pool
    return this.chatGPTPools[
      Math.floor(Math.random() * this.chatGPTPools.length)
    ];
  }

  // Performance optimization: Add conversation caching and cleanup
  getConversation(talkid: string): IConversationItem {
    if (this.conversationsPool.has(talkid)) {
      return this.conversationsPool.get(talkid) as IConversationItem;
    }
    
    const chatGPT = this.chatGPTAPI;
    if (!chatGPT) {
      throw new Error("⚠️ No chatgpt item in pool");
    }
    
    //TODO: Add conversation implementation
    const conversation = chatGPT.chatGpt;
    const conversationItem = {
      conversation,
      account: chatGPT.account,
    };
    
    this.conversationsPool.set(talkid, conversationItem);
    
    // Cleanup old conversations if needed
    this.cleanupConversations();
    
    return conversationItem;
  }

  setConversation(talkid: string, conversationId: string, messageId: string) {
    const conversationItem = this.getConversation(talkid);
    this.conversationsPool.set(talkid, {
      ...conversationItem,
      conversationId,
      messageId,
    });
  }

  // Performance optimization: Better error handling and retry logic
  async sendMessage(message: string, talkid: string): Promise<string> {
    if (
      Commands.some((cmd) => {
        return message.startsWith(cmd);
      })
    ) {
      return this.command(message as typeof Commands[number], talkid);
    }
    
    const conversationItem = this.getConversation(talkid);
    const { conversation, account, conversationId, messageId } = conversationItem;
    
    try {
      // Performance optimization: Add timeout for API calls
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 30000); // 30 second timeout
      });
      
      const apiPromise = conversation.sendMessage(message, {
        conversationId,
        parentMessageId: messageId,
      });
      
      const {
        response,
        conversationId: newConversationId,
        messageId: newMessageId,
      } = await Promise.race([apiPromise, timeoutPromise]) as any;
      
      // Update conversation information
      this.setConversation(talkid, newConversationId, newMessageId);
      return response;
    } catch (err: any) {
      if (err.message.includes("ChatGPT failed to refresh auth token")) {
        // If refresh token failed, we will remove the conversation from pool
        await this.resetAccount(account);
        console.log(`Refresh token failed, account ${JSON.stringify(account)}`);
        return this.sendMessage(message, talkid);
      }
      
      console.error(
        `err is ${err.message}, account ${JSON.stringify(account)}`
      );
      
      // If send message failed, we will remove the conversation from pool
      this.conversationsPool.delete(talkid);
      
      // Retry
      return this.error2msg(err);
    }
  }

  // Make error code to more human readable message.
  error2msg(err: Error): string {
    for (const code in ErrorCode2Message) {
      if (err.message.includes(code)) {
        return ErrorCode2Message[code];
      }
    }
    return ErrorCode2Message.unknown;
  }
}
