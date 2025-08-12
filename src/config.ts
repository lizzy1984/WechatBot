import * as dotenv from "dotenv";
import { parse } from "yaml";
import fs from "fs";

dotenv.config();

interface IAccount {
  email: string;
  password: string;
}

interface IConfig {
  chatGPTAccountPool: IAccount[];
  chatGptRetryTimes: number;
  chatPrivateTiggerKeyword: string;
  openAIProxy: string;
  clearanceToken: string;
  userAgent: string;
  // Performance optimization: Add performance-related config
  performance: {
    maxMessageCacheSize: number;
    maxConversations: number;
    healthCheckIntervalMs: number;
    startupTimeoutMs: number;
    enablePerformanceLogging: boolean;
    enableMemoryMonitoring: boolean;
  };
}

// Performance optimization: Load config with performance defaults
const config: IConfig = {
  chatGPTAccountPool: [
    {
      email: process.env.CHAT_GPT_EMAIL || "",
      password: process.env.CHAT_GPT_PASSWORD || "",
    },
  ],
  chatGptRetryTimes: Number(process.env.CHAT_GPT_RETRY_TIMES) || 3,
  chatPrivateTiggerKeyword: process.env.CHAT_PRIVATE_TRIGGER_KEYWORD || "",
  openAIProxy: process.env.OPENAI_PROXY || "",
  clearanceToken: process.env.CF_CLEARANCE || "",
  userAgent: process.env.USER_AGENT || "",
  performance: {
    maxMessageCacheSize: Number(process.env.MAX_MESSAGE_CACHE_SIZE) || 100,
    maxConversations: Number(process.env.MAX_CONVERSATIONS) || 1000,
    healthCheckIntervalMs: Number(process.env.HEALTH_CHECK_INTERVAL_MS) || 5 * 60 * 1000, // 5 minutes
    startupTimeoutMs: Number(process.env.STARTUP_TIMEOUT_MS) || 60000, // 60 seconds
    enablePerformanceLogging: process.env.ENABLE_PERFORMANCE_LOGGING === 'true',
    enableMemoryMonitoring: process.env.ENABLE_MEMORY_MONITORING === 'true',
  },
};

// Performance optimization: Load YAML config if exists
try {
  if (fs.existsSync("config.yaml")) {
    const yamlContent = fs.readFileSync("config.yaml", "utf8");
    const yamlConfig = parse(yamlContent);
    
    // Merge YAML config with environment variables
    if (yamlConfig.chatGPTAccountPool) {
      config.chatGPTAccountPool = yamlConfig.chatGPTAccountPool;
    }
    if (yamlConfig.chatGptRetryTimes) {
      config.chatGptRetryTimes = yamlConfig.chatGptRetryTimes;
    }
    if (yamlConfig.chatPrivateTiggerKeyword) {
      config.chatPrivateTiggerKeyword = yamlConfig.chatPrivateTiggerKeyword;
    }
    if (yamlConfig.openAIProxy) {
      config.openAIProxy = yamlConfig.openAIProxy;
    }
    if (yamlConfig.performance) {
      config.performance = { ...config.performance, ...yamlConfig.performance };
    }
  }
} catch (error) {
  console.warn("⚠️ Could not load config.yaml:", error);
}

export { config };
