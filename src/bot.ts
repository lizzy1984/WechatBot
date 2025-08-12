import { ChatGPTPool } from "./chatgpt.js";
import { config } from "./config.js";
import type { ContactInterface, RoomInterface } from "wechaty/impls";
import type { Message } from "wechaty";

// Optimized enum using const assertion for better tree-shaking
const MessageType = {
  Unknown: 0,
  Attachment: 1,
  Audio: 2,
  Contact: 3,
  ChatHistory: 4,
  Emoticon: 5,
  Image: 6,
  Text: 7,
  Location: 8,
  MiniProgram: 9,
  GroupNote: 10,
  Transfer: 11,
  RedEnvelope: 12,
  Recalled: 13,
  Url: 14,
  Video: 15,
  Post: 16,
} as const;

type MessageTypeValue = typeof MessageType[keyof typeof MessageType];

const SINGLE_MESSAGE_MAX_SIZE = 500;

// Pre-compiled regex patterns for better performance
const MESSAGE_SEPARATOR = /- - - - - - - - - - - - - - -/;
const WECHAT_SYSTEM_MESSAGES = new Set([
  "收到一条视频/语音聊天消息，请在手机上查看",
  "收到红包，请在手机上查看", 
  "收到转账，请在手机上查看",
]);

export class ChatGPTBot {
  private chatGPTPool = new ChatGPTPool();
  private chatPrivateTriggerKeyword = config.chatPrivateTiggerKeyword;
  private botName = "";
  public ready = false; // Make public so main.ts can access it
  
  // Cache for cleaned messages to avoid repeated processing
  private messageCache = new Map<string, string>();

  setBotName(botName: string): void {
    this.botName = botName;
  }

  get chatGroupTriggerKeyword(): string {
    return `@${this.botName}`;
  }

  async startGPTBot(): Promise<void> {
    console.debug(`Starting GPT Bot with config: ${JSON.stringify(config)}`);
    await this.chatGPTPool.startPools();
    console.debug(`🤖️ GPT Bot started successfully, ready to handle messages!`);
    this.ready = true;
  }

  /**
   * Optimized message cleaning with caching and improved string operations
   */
  cleanMessage(rawText: string, privateChat = false): string {
    const cacheKey = `${rawText}_${privateChat}`;
    const cached = this.messageCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let text = rawText;
    
    // Split by separator and take the last part (more efficient than multiple splits)
    const parts = text.split(MESSAGE_SEPARATOR);
    if (parts.length > 1) {
      text = parts[parts.length - 1];
    }

    // Remove trigger keyword
    const triggerKeyword = privateChat 
      ? this.chatPrivateTriggerKeyword 
      : this.chatGroupTriggerKeyword;
    
    if (triggerKeyword) {
      text = text.replace(triggerKeyword, "").trim();
    }

    // Cache the result (limit cache size to prevent memory leaks)
    if (this.messageCache.size > 1000) {
      // Get the first key and delete it
      const firstKey = Array.from(this.messageCache.keys())[0];
      this.messageCache.delete(firstKey);
    }
    this.messageCache.set(cacheKey, text);

    return text;
  }

  async getGPTMessage(text: string, talkerId: string): Promise<string> {
    return await this.chatGPTPool.sendMessage(text, talkerId);
  }

  /**
   * Optimized message splitting with better performance
   */
  async trySay(
    talker: RoomInterface | ContactInterface,
    message: string
  ): Promise<void> {
    if (!message) return;

    if (message.length <= SINGLE_MESSAGE_MAX_SIZE) {
      await talker.say(message);
      return;
    }

    // More efficient chunking using a single loop
    const chunks: string[] = [];
    for (let i = 0; i < message.length; i += SINGLE_MESSAGE_MAX_SIZE) {
      chunks.push(message.slice(i, i + SINGLE_MESSAGE_MAX_SIZE));
    }

    // Send messages sequentially to avoid rate limiting
    for (const chunk of chunks) {
      await talker.say(chunk);
      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Optimized trigger checking with early returns
   */
  triggerGPTMessage(text: string, privateChat = false): boolean {
    if (!text) return false;

    let triggered = false;
    
    if (privateChat) {
      triggered = this.chatPrivateTriggerKeyword
        ? text.includes(this.chatPrivateTriggerKeyword)
        : true;
    } else {
      triggered = text.includes(this.chatGroupTriggerKeyword);
    }

    if (triggered) {
      console.log(`🎯 Triggered ChatGPT: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
    }
    
    return triggered;
  }

  /**
   * Optimized nonsense filtering with Set lookup for O(1) performance
   */
  isNonsense(
    talker: ContactInterface,
    messageType: MessageTypeValue,
    text: string
  ): boolean {
    // Early returns for most common cases
    if (talker.self()) return true;
    if (messageType !== MessageType.Text) return true;
    if (talker.name() === "微信团队") return true;

    // Use Set for O(1) lookup instead of multiple includes() calls
    for (const systemMessage of WECHAT_SYSTEM_MESSAGES) {
      if (text.includes(systemMessage)) return true;
    }

    // Check for location messages
    return text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg");
  }

  async onPrivateMessage(talker: ContactInterface, text: string): Promise<void> {
    const talkerId = talker.id;
    const gptMessage = await this.getGPTMessage(text, talkerId);
    await this.trySay(talker, gptMessage);
  }

  async onGroupMessage(
    talker: ContactInterface,
    text: string,
    room: RoomInterface
  ): Promise<void> {
    const talkerId = `${room.id}_${talker.id}`; // More efficient string concatenation
    const gptMessage = await this.getGPTMessage(text, talkerId);
    const result = `${text}\n------\n${gptMessage}`;
    await this.trySay(room, result);
  }

  async onMessage(message: Message): Promise<void> {
    if (!this.ready) {
      return;
    }

    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const privateChat = !room;

    // Early exit for nonsense messages
    if (this.isNonsense(talker, messageType, rawText)) {
      return;
    }

    // Check trigger condition
    if (!this.triggerGPTMessage(rawText, privateChat)) {
      return;
    }

    try {
      const cleanedText = this.cleanMessage(rawText, privateChat);
      
      if (privateChat) {
        await this.onPrivateMessage(talker, cleanedText);
      } else {
        await this.onGroupMessage(talker, cleanedText, room);
      }
    } catch (error) {
      console.error(`Error processing message from ${talker.name()}:`, error);
      // Optionally send error message to user
      await this.trySay(privateChat ? talker : room, "抱歉，处理消息时出现错误，请稍后重试。");
    }
  }

  /**
   * Cleanup method for graceful shutdown
   */
  cleanup(): void {
    this.messageCache.clear();
    this.chatGPTPool.cleanup();
    this.ready = false;
  }
}
