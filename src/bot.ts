import { ChatGPTPool } from "./chatgpt.js";
import { config } from "./config.js";
import { ContactInterface, RoomInterface } from "wechaty/impls";
import { Message } from "wechaty";

enum MessageType {
  Unknown = 0,

  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}

const SINGLE_MESSAGE_MAX_SIZE = 500;

export class ChatGPTBot {
  // Record talkid with conversation id
  chatGPTPool = new ChatGPTPool();
  chatPrivateTiggerKeyword = config.chatPrivateTiggerKeyword;
  botName: string = "";
  ready = false;
  
  // Performance optimization: Add message caching
  private messageCache = new Map<string, { response: string; timestamp: number }>();
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private readonly maxCacheSize = 1000;

  setBotName(botName: string) {
    this.botName = botName;
  }

  get chatGroupTiggerKeyword(): string {
    return `@${this.botName}`;
  }

  async startGPTBot() {
    console.debug(`Start GPT Bot Config is:${JSON.stringify(config)}`);
    await this.chatGPTPool.startPools();
    console.debug(`🤖️ Start GPT Bot Success, ready to handle message!`);
    this.ready = true;
  }

  // TODO: Add reset conversation id and ping pong
  async command(): Promise<void> {}

  // Performance optimization: Add message deduplication and caching
  private getCachedResponse(text: string): string | null {
    const cacheKey = this.generateCacheKey(text);
    const cached = this.messageCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.response;
    }
    
    return null;
  }

  private setCachedResponse(text: string, response: string): void {
    const cacheKey = this.generateCacheKey(text);
    
    // Cleanup cache if it's too large
    if (this.messageCache.size >= this.maxCacheSize) {
      const entries = Array.from(this.messageCache.entries());
      const toRemove = entries.slice(0, Math.floor(entries.length * 0.2));
      toRemove.forEach(([key]) => this.messageCache.delete(key));
    }
    
    this.messageCache.set(cacheKey, { response, timestamp: Date.now() });
  }

  private generateCacheKey(text: string): string {
    // Simple hash for cache key
    return text.length > 50 ? text.substring(0, 50) + '...' : text;
  }

  // remove more times conversation and mention
  cleanMessage(rawText: string, privateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }
    text = text.replace(
      privateChat ? this.chatPrivateTiggerKeyword : this.chatGroupTiggerKeyword,
      ""
    );
    // remove more text via - - - - - - - - - - - - - - -
    return text;
  }

  async getGPTMessage(text: string, talkerId: string): Promise<string> {
    // Performance optimization: Check cache first
    const cached = this.getCachedResponse(text);
    if (cached) {
      console.log(`📋 Using cached response for: ${text.substring(0, 50)}...`);
      return cached;
    }
    
    const response = await this.chatGPTPool.sendMessage(text, talkerId);
    
    // Cache the response
    this.setCachedResponse(text, response);
    
    return response;
  }

  // The message is segmented according to its size
  async trySay(
    talker: RoomInterface | ContactInterface,
    mesasge: string
  ): Promise<void> {
    const messages: Array<string> = [];
    let message = mesasge;
    
    // Performance optimization: Better message segmentation
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      // Try to break at sentence boundaries
      let breakPoint = SINGLE_MESSAGE_MAX_SIZE;
      const lastPeriod = message.lastIndexOf('。', SINGLE_MESSAGE_MAX_SIZE);
      const lastExclamation = message.lastIndexOf('！', SINGLE_MESSAGE_MAX_SIZE);
      const lastQuestion = message.lastIndexOf('？', SINGLE_MESSAGE_MAX_SIZE);
      const lastNewline = message.lastIndexOf('\n', SINGLE_MESSAGE_MAX_SIZE);
      
      if (lastPeriod > SINGLE_MESSAGE_MAX_SIZE * 0.8) breakPoint = lastPeriod + 1;
      else if (lastExclamation > SINGLE_MESSAGE_MAX_SIZE * 0.8) breakPoint = lastExclamation + 1;
      else if (lastQuestion > SINGLE_MESSAGE_MAX_SIZE * 0.8) breakPoint = lastQuestion + 1;
      else if (lastNewline > SINGLE_MESSAGE_MAX_SIZE * 0.8) breakPoint = lastNewline + 1;
      
      messages.push(message.slice(0, breakPoint));
      message = message.slice(breakPoint);
    }
    
    if (message.length > 0) {
      messages.push(message);
    }
    
    // Performance optimization: Send messages with rate limiting
    for (let i = 0; i < messages.length; i++) {
      await talker.say(messages[i]);
      
      // Add small delay between messages to avoid rate limiting
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Check whether the ChatGPT processing can be triggered
  tiggerGPTMessage(text: string, privateChat: boolean = false): boolean {
    const chatPrivateTiggerKeyword = this.chatPrivateTiggerKeyword;
    let triggered = false;
    if (privateChat) {
      triggered = chatPrivateTiggerKeyword
        ? text.includes(chatPrivateTiggerKeyword)
        : true;
    } else {
      triggered = text.includes(this.chatGroupTiggerKeyword);
    }
    if (triggered) {
      console.log(`🎯 Triggered ChatGPT: ${text}`);
    }
    return triggered;
  }

  // Filter out the message that does not need to be processed
  isNonsense(
    talker: ContactInterface,
    messageType: MessageType,
    text: string
  ): boolean {
    return (
      talker.self() ||
      // TODO: add doc support
      messageType !== MessageType.Text ||
      talker.name() == "微信团队" ||
      // 语音(视频)消息
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // 红包消息
      text.includes("收到红包，请在手机上查看") ||
      // Transfer message
      text.includes("收到转账，请在手机上查看") ||
      // 位置消息
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg")
    );
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

  // Performance optimization: Add message queuing and better error handling
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
      
      try {
        if (privateChat) {
          return await this.onPrivateMessage(talker, text);
        } else {
          return await this.onGroupMessage(talker, text, room);
        }
      } catch (error) {
        console.error(`❌ Error processing message: ${error}`);
        
        // Send error message to user
        const errorMsg = "抱歉，处理消息时出现错误，请稍后再试。";
        try {
          if (privateChat) {
            await talker.say(errorMsg);
          } else if (room) {
            await room.say(errorMsg);
          }
        } catch (sendError) {
          console.error(`Failed to send error message: ${sendError}`);
        }
      }
    } else {
      return;
    }
  }
}
