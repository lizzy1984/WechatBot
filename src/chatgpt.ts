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
  "503": "OpenAI 服务器繁忙，请稍后再试| The OpenAI server is busy, please try again later",
  "429": "OpenAI 服务器限流，请稍后再试| The OpenAI server was limited, please try again later",
  "500": "OpenAI 服务器繁忙，请稍后再试| The OpenAI server is busy, please try again later",
  "403": "OpenAI 服务器拒绝访问，请稍后再试| The OpenAI server refused to access, please try again later",
  unknown: "未知错误，请看日志 | Error unknown, please see the log",
};

const Commands = ["/reset", "/help"] as const;

// Performance optimization: Connection pool with health checks
class ConnectionPool {
  private connections: IChatGPTItem[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly healthCheckMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.startHealthCheck();
  }

  addConnection(connection: IChatGPTItem): void {
    this.connections.push(connection);
  }

  getConnection(): IChatGPTItem | null {
    if (this.connections.length === 0) return null;
    
    // Performance optimization: Round-robin selection for better load distribution
    const connection = this.connections.shift()!;
    this.connections.push(connection);
    return connection;
  }

  removeConnection(email: string): void {
    this.connections = this.connections.filter(
      conn => (conn.account as AccountWithUserInfo)?.email !== email
    );
  }

  getConnectionCount(): number {
    return this.connections.length;
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckMs);
  }

  private async performHealthCheck(): Promise<void> {
    const healthyConnections: IChatGPTItem[] = [];
    
    for (const connection of this.connections) {
      try {
        // Simple health check - try to send a minimal message
        await connection.chatGpt.sendMessage("ping", { conversationId: undefined, parentMessageId: undefined });
        healthyConnections.push(connection);
      } catch (error) {
        console.warn(`Health check failed for ${(connection.account as AccountWithUserInfo)?.email}:`, error);
        // Remove unhealthy connection
        this.removeConnection((connection.account as AccountWithUserInfo)?.email);
      }
    }
    
    this.connections = healthyConnections;
    
    if (this.connections.length === 0) {
      console.error("⚠️ All connections are unhealthy!");
    }
  }

  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

export class ChatGPTPool {
  private connectionPool = new ConnectionPool();
  conversationsPool: Map<string, IConversationItem> = new Map();
  
  // Performance optimization: Add LRU cache for conversations
  private readonly maxConversations = 1000;
  private conversationKeys: string[] = [];

  async resetAccount(account: IAccount) {
    // Remove all conversation information
    this.conversationsPool.forEach((item, key) => {
      if ((item.account as AccountWithUserInfo)?.email === account.email) {
        this.conversationsPool.delete(key);
        this.removeConversationKey(key);
      }
    });

    // Relogin and generate a new session token
    const chatGPTItem = this.connectionPool.getConnection();
    if (chatGPTItem && (chatGPTItem.account as AccountWithUserInfo)?.email === account.email) {
      try {
        const newConnection = new ChatGPTAPIBrowser({
          ...account,
          proxyServer: config.openAIProxy,
        });
        
        // Replace the connection
        this.connectionPool.removeConnection(account.email);
        this.connectionPool.addConnection({
          chatGpt: newConnection,
          account: account,
        });
      } catch (err) {
        this.connectionPool.removeConnection(account.email);
        console.error(`Try reset account: ${account.email} failed: ${err}, remove it from pool`);
      }
    }
  }

  resetConversation(talkid: string) {
    this.conversationsPool.delete(talkid);
    this.removeConversationKey(talkid);
  }

  async startPools() {
    const chatGPTPools = [];
    
    // Performance optimization: Initialize connections in parallel with better error handling
    const initPromises = config.chatGPTAccountPool.map(async (account) => {
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

        return {
          chatGpt: chatGpt,
          account: account,
        };
      } catch (error) {
        console.error(`Failed to initialize account: ${account.email}`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(initPromises);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        chatGPTPools.push(result.value);
        this.connectionPool.addConnection(result.value);
      } else {
        console.error(`Account ${config.chatGPTAccountPool[index].email} failed to initialize`);
      }
    });

    if (chatGPTPools.length === 0) {
      throw new Error("⚠️ No chatgpt account in pool");
    }

    console.log(`ChatGPTPools: ${chatGPTPools.length}`);
  }

  async command(cmd: typeof Commands[number], talkid: string): Promise<string> {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`command: ${cmd} talkid: ${talkid}`);
    }
    
    if (cmd == "/reset") {
      this.resetConversation(talkid);
      return "♻️ 已重置对话 ｜ Conversation reset";
    }
    if (cmd == "/help") {
      return `🧾 支持的命令｜Support command：${Commands.join("，")}`;
    }
    return "❓ 未知命令｜Unknow Command";
  }

  // Performance optimization: Get connection from pool
  get chatGPTAPI(): IChatGPTItem {
    const connection = this.connectionPool.getConnection();
    if (!connection) {
      throw new Error("⚠️ No chatgpt item in pool");
    }
    return connection;
  }

  // Performance optimization: Improved conversation management with LRU cache
  getConversation(talkid: string): IConversationItem {
    if (this.conversationsPool.has(talkid)) {
      // Move to end of LRU list
      this.removeConversationKey(talkid);
      this.addConversationKey(talkid);
      return this.conversationsPool.get(talkid) as IConversationItem;
    }

    const chatGPT = this.chatGPTAPI;
    if (!chatGPT) {
      throw new Error("⚠️ No chatgpt item in pool");
    }

    const conversationItem = {
      conversation: chatGPT.chatGpt,
      account: chatGPT.account,
    };

    this.conversationsPool.set(talkid, conversationItem);
    this.addConversationKey(talkid);
    
    // Enforce LRU cache size limit
    if (this.conversationsPool.size > this.maxConversations) {
      const oldestKey = this.conversationKeys.shift();
      if (oldestKey) {
        this.conversationsPool.delete(oldestKey);
      }
    }

    return conversationItem;
  }

  private addConversationKey(key: string): void {
    this.conversationKeys.push(key);
  }

  private removeConversationKey(key: string): void {
    const index = this.conversationKeys.indexOf(key);
    if (index > -1) {
      this.conversationKeys.splice(index, 1);
    }
  }

  setConversation(talkid: string, conversationId: string, messageId: string) {
    const conversationItem = this.getConversation(talkid);
    this.conversationsPool.set(talkid, {
      ...conversationItem,
      conversationId,
      messageId,
    });
  }

  // Performance optimization: Improved message sending with better error handling
  async sendMessage(message: string, talkid: string): Promise<string> {
    if (Commands.some((cmd) => message.startsWith(cmd))) {
      return this.command(message as typeof Commands[number], talkid);
    }

    const conversationItem = this.getConversation(talkid);
    const { conversation, account, conversationId, messageId } = conversationItem;

    try {
      const {
        response,
        conversationId: newConversationId,
        messageId: newMessageId,
      } = await conversation.sendMessage(message, {
        conversationId,
        parentMessageId: messageId,
      });

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

      console.error(`err is ${err.message}, account ${JSON.stringify(account)}`);
      
      // If send message failed, we will remove the conversation from pool
      this.conversationsPool.delete(talkid);
      this.removeConversationKey(talkid);
      
      // Retry
      return this.error2msg(err);
    }
  }

  // Performance optimization: Improved error message handling
  error2msg(err: Error): string {
    for (const code in ErrorCode2Message) {
      if (err.message.includes(code)) {
        return ErrorCode2Message[code];
      }
    }
    return ErrorCode2Message.unknown;
  }

  // Performance optimization: Cleanup method
  cleanup(): void {
    this.connectionPool.stop();
    this.conversationsPool.clear();
    this.conversationKeys = [];
  }
}
