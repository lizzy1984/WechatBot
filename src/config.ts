import { config as loadEnvConfig } from "dotenv";
import { parse } from "yaml";
import { readFileSync, existsSync } from "fs";
import type { IConfig, IAccount } from "./interface.js";

// Load environment variables once at startup
loadEnvConfig();

// Cache for config to avoid repeated file reads
let configCache: IConfig | null = null;

/**
 * Lazy load configuration from file or environment variables
 * Uses caching to avoid repeated file system operations
 */
function loadConfig(): IConfig {
  if (configCache) {
    return configCache;
  }

  let configFile: any = {};
  
  try {
    if (existsSync("./config.yaml")) {
      const file = readFileSync("./config.yaml", "utf8");
      configFile = parse(file);
    } else {
      // Fallback to environment variables
      configFile = {
        chatGPTAccountPool: [
          {
            email: process.env.CHAT_GPT_EMAIL || "",
            password: process.env.CHAT_GPT_PASSWORD || "",
            apiKey: process.env.OPENAI_API_KEY || "",
            isGoogleLogin: false,
          },
        ],
        chatGptRetryTimes: Number(process.env.CHAT_GPT_RETRY_TIMES) || 3,
        chatPrivateTiggerKeyword: process.env.CHAT_PRIVATE_TRIGGER_KEYWORD || "",
        openAIProxy: process.env.OPENAI_PROXY,
        clearanceToken: process.env.CF_CLEARANCE || "",
        userAgent: process.env.USER_AGENT || "",
      };
    }
  } catch (error) {
    console.error("Failed to load configuration:", error);
    throw new Error("Configuration loading failed");
  }

  configCache = {
    chatGPTAccountPool: (configFile.chatGPTAccountPool as Array<IAccount>) || [],
    chatGptRetryTimes: configFile.chatGptRetryTimes || 3,
    chatPrivateTiggerKeyword:
      configFile.chatPrivateTiggerKeyword ||
      // Try compatible with previous designs
      (configFile?.botConfig as Array<Map<string, string>>)?.reduce(
        (prev: string, curr: Map<string, string>) =>
          curr.get("trigger_keywords") || prev,
        ""
      ) ||
      "",
    openAIProxy: configFile.openAIProxy,
    clearanceToken: configFile.clearanceToken || "",
    userAgent: configFile.userAgent || "",
  };

  // Validate that at least one account has an API key
  const hasValidAccount = configCache.chatGPTAccountPool.some(
    (account) => account.apiKey && account.apiKey.trim() !== ""
  );

  if (!hasValidAccount) {
    console.warn("⚠️ No valid API key found in configuration. Please set OPENAI_API_KEY environment variable or configure it in config.yaml");
  }

  return configCache;
}

export const config = loadConfig();
