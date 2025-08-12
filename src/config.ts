import { readFileSync } from "fs";
import { parse } from "yaml";
import { IConfig, IAccount } from "./interface.js";

const configFile = readFileSync("config.yaml", "utf-8");
const config = parse(configFile) as IConfig;

// Validate required fields
if (!config.chatGPTAccountPool || config.chatGPTAccountPool.length === 0) {
  throw new Error("chatGPTAccountPool is required in config.yaml");
}

// Set default values
if (!config.chatPrivateTiggerKeyword) {
  config.chatPrivateTiggerKeyword = "";
}

if (!config.openAIProxy) {
  config.openAIProxy = "";
}

// Convert account pool to the expected format
const accountPool: IAccount[] = config.chatGPTAccountPool.map((account: any) => ({
  email: account.email,
  password: account.password,
  isGoogleLogin: account.isGoogleLogin || false, // Default to false if not specified
}));

// Create a map for easy lookup
const accountMap = new Map<string, string>();
accountPool.forEach((account) => {
  accountMap.set(account.email, account.password);
});

// Export the processed config
export { config, accountPool, accountMap };
