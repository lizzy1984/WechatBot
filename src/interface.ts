import type { ChatGPTAPI } from "chatgpt";

export interface AccountWithUserInfo {
  readonly password: string;
  readonly email: string;
  readonly isGoogleLogin: boolean;
  readonly apiKey: string; // Required for the new API
}

// Account will be one in the session token or email and password
export type IAccount = AccountWithUserInfo;

export interface IChatGPTItem {
  chatGpt: ChatGPTAPI; // Remove readonly to allow reassignment during reset
  readonly account: IAccount;
}

export interface IConversationItem {
  readonly conversation: ChatGPTAPI;
  readonly account: IAccount;
  readonly conversationId?: string;
  readonly messageId?: string;
}

export interface IConfig {
  readonly chatGPTAccountPool: readonly IAccount[];
  readonly chatGptRetryTimes: number;
  readonly chatPrivateTiggerKeyword: string;
  readonly openAIProxy?: string;
  readonly clearanceToken: string;
  readonly userAgent: string;
}
