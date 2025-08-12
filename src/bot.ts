import { ChatGPTPool } from "./chatgpt.js";
import { config } from "./config.js";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Message } from "wechaty";

enum MessageType {
  Unknown = 0,
  Attachment = 1,
  Audio = 2,
  Contact = 3,
  ChatHistory = 4,
  Emoticon = 5,
  Image = 6,
  Text = 7,
  Location = 8,
  MiniProgram = 9,
  GroupNote = 10,
  Transfer = 11,
  RedEnvelope = 12,
  Recalled = 13,
  Url = 14,
  Video = 15,
  Post = 16,
}

const SINGLE_MESSAGE_MAX_SIZE = 500;
const MESSAGE_CACHE_SIZE = 100;

// Performance optimization: Cache for processed messages
class MessageCache {
  private cache = new Map<string, string>();
  private maxSize: number;

  constructor(maxSize: number = MESSAGE_CACHE_SIZE) {
    this.maxSize = maxSize;
  }

  get(key: string): string | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: string): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class ChatGPTBot {
  // Record talkid with conversation id
  chatGPTPool = new ChatGPTPool();
  chatPrivateTiggerKeyword = config.chatPrivateTiggerKeyword;
  botName: string = "";
  ready = false;
  
  // Performance optimization: Add message cache
  private messageCache = new MessageCache();
  
  // Performance optimization: Pre-compile regex patterns
  private readonly messageCleanupPattern = /- - - - - - - - - - - - - - -/g;
  private readonly nonsensePatterns = [
    "收到一条视频/语音聊天消息，请在手机上查看",
    "收到红包，请在手机上查看",
    "收到转账，请在手机上查看",
    "/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg"
  ];

  setBotName(botName: string) {
    this.botName = botName;
  }

  get chatGroupTiggerKeyword(): string {
    return `@${this.botName}`;
  }

  async startGPTBot() {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`Start GPT Bot Config is:${JSON.stringify(config)}`);
    }
    await this.chatGPTPool.startPools();
    console.debug(`🤖️ Start GPT Bot Success, ready to handle message!`);
    this.ready = true;
  }

  // TODO: Add reset conversation id and ping pong
  async command(): Promise<void> {}

  // Performance optimization: Improved message cleaning with caching
  cleanMessage(rawText: string, privateChat: boolean = false): string {
    // Check cache first
    const cacheKey = `${rawText}_${privateChat}`;
    const cached = this.messageCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let text = rawText;
    
    // Performance optimization: Use split with limit for better performance
    const parts = rawText.split("- - - - - - - - - - - - - - -");
    if (parts.length > 1) {
      text = parts[parts.length - 1];
    }

    const triggerKeyword = privateChat ? this.chatPrivateTiggerKeyword : this.chatGroupTiggerKeyword;
    if (triggerKeyword) {
      text = text.replace(triggerKeyword, "");
    }

    // Cache the result
    this.messageCache.set(cacheKey, text);
    return text;
  }

  async getGPTMessage(text: string, talkerId: string): Promise<string> {
    return await this.chatGPTPool.sendMessage(text, talkerId);
  }

  // Performance optimization: Improved message segmentation
  async trySay(
    talker: RoomInterface | ContactInterface,
    message: string
  ): Promise<void> {
    if (message.length <= SINGLE_MESSAGE_MAX_SIZE) {
      await talker.say(message);
      return;
    }

    // Performance optimization: Pre-calculate segments
    const segments: string[] = [];
    let remaining = message;
    
    while (remaining.length > SINGLE_MESSAGE_MAX_SIZE) {
      segments.push(remaining.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      remaining = remaining.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    segments.push(remaining);

    // Performance optimization: Send messages in parallel for better throughput
    const sendPromises = segments.map(segment => talker.say(segment));
    await Promise.all(sendPromises);
  }

  // Performance optimization: Improved trigger detection
  tiggerGPTMessage(text: string, privateChat: boolean = false): boolean {
    const chatPrivateTiggerKeyword = this.chatPrivateTiggerKeyword;
    let triggered = false;

    if (privateChat) {
      triggered = chatPrivateTiggerKeyword ? text.includes(chatPrivateTiggerKeyword) : true;
    } else {
      triggered = text.includes(this.chatGroupTiggerKeyword);
    }

    if (triggered && process.env.NODE_ENV !== 'production') {
      console.log(`🎯 Triggered ChatGPT: ${text}`);
    }
    return triggered;
  }

  // Performance optimization: Improved nonsense detection with pattern matching
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    if (talker.self() || messageType !== MessageType.Text) {
      return true;
    }

    const talkerName = talker.name();
    if (talkerName === "微信团队") {
      return true;
    }

    // Performance optimization: Use pattern matching instead of multiple includes
    return this.nonsensePatterns.some(pattern => text.includes(pattern));
  }

  async onPrivateMessage(talker: ContactInterface, text: string) {
    const talkerId = talker.id;
    const gptMessage = await this.getGPTMessage(text, talkerId);
    await this.trySay(talker, gptMessage);
  }

  async onGroupMessage(
    talker: ContactInterface,
    text: string,
    room: RoomInterface
  ) {
    const talkerId = room.id + talker.id;
    const gptMessage = await this.getGPTMessage(text, talkerId);
    const result = `${text}\n ------\n ${gptMessage}`;
    await this.trySay(room, result);
  }

  async onMessage(message: Message) {
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const privateChat = !room;

    if (this.isNonsense(talker, messageType, rawText)) {
      return;
    }

    if (this.tiggerGPTMessage(rawText, privateChat)) {
      const text = this.cleanMessage(rawText, privateChat);
      if (privateChat) {
        return await this.onPrivateMessage(talker, text);
      } else {
        return await this.onGroupMessage(talker, text, room);
      }
    }
  }

  // Performance optimization: Add cleanup method
  cleanup(): void {
    this.messageCache.clear();
  }
}
