export default {
  // Build optimizations
  build: {
    // TypeScript compilation options
    incremental: true,
    sourceMap: true,
    removeComments: true,
    importHelpers: true,
    
    // Bundle optimizations
    treeShaking: true,
    minify: true,
    
    // Parallel processing
    maxConcurrency: 4,
    
    // Cache settings
    cacheDirectory: '.build-cache',
    cacheExpiry: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Runtime optimizations
  runtime: {
    // Memory management
    maxHeapSize: '4GB',
    gcInterval: 30000, // 30 seconds
    
    // Connection pooling
    maxConnections: 10,
    connectionTimeout: 5 * 60 * 1000, // 5 minutes
    
    // Message processing
    maxConcurrentMessages: 3,
    messageRateLimit: 100, // ms between messages
    
    // Caching
    messageCacheTTL: 5 * 60 * 1000, // 5 minutes
    maxCacheSize: 1000,
    
    // Conversation management
    maxConversations: 1000,
    conversationCleanupThreshold: 0.8, // Clean when 80% full
  },

  // Monitoring and metrics
  monitoring: {
    enabled: true,
    reportInterval: 60000, // 1 minute
    maxMetrics: 10000,
    
    // Performance thresholds
    slowOperationThreshold: 1000, // 1 second
    memoryWarningThreshold: 0.8, // 80% of max heap
    
    // Export options
    exportMetrics: false,
    exportFormat: 'json',
    exportPath: './metrics',
  },

  // Docker optimizations
  docker: {
    // Multi-stage build
    useMultiStage: true,
    baseImage: 'node:19-alpine',
    
    // Security
    nonRootUser: true,
    userId: 1001,
    groupId: 1001,
    
    // Resource limits
    memoryLimit: '2GB',
    cpuLimit: '2',
    
    // Health checks
    healthCheckInterval: 30,
    healthCheckTimeout: 3,
    healthCheckRetries: 3,
  },

  // Development optimizations
  development: {
    // Hot reload
    watchMode: true,
    watchExtensions: ['ts', 'js', 'yaml'],
    watchDelay: 500,
    
    // Debug mode
    debugEnabled: false,
    debugLevel: 'info',
    
    // Development server
    devServerPort: 3000,
    devServerHost: 'localhost',
  },

  // Production optimizations
  production: {
    // Performance flags
    optimizeForSize: true,
    maxOldSpaceSize: 4096,
    
    // Security
    helmet: true,
    rateLimit: true,
    cors: false,
    
    // Logging
    logLevel: 'warn',
    logFormat: 'json',
    
    // Metrics
    enableMetrics: true,
    metricsPort: 9090,
  },

  // ChatGPT API optimizations
  chatgpt: {
    // Retry configuration
    maxRetries: 3,
    retryFactor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    
    // Request timeout
    requestTimeout: 30000, // 30 seconds
    
    // Rate limiting
    requestsPerMinute: 60,
    burstLimit: 10,
    
    // Connection management
    keepAlive: true,
    maxSockets: 10,
    maxFreeSockets: 5,
  },

  // WeChat optimizations
  wechat: {
    // Message processing
    maxMessageSize: 500,
    messageSegmentation: true,
    
    // QR code generation
    qrCodeType: 'terminal',
    qrCodeSize: 'small',
    
    // Puppet options
    uosProtocol: true,
    memoryCard: true,
    
    // Error handling
    maxLoginAttempts: 3,
    loginTimeout: 60000, // 1 minute
  }
};

// Environment-specific overrides
export const getConfig = (environment = process.env.NODE_ENV || 'development') => {
  const baseConfig = defaultConfig;
  
  switch (environment) {
    case 'production':
      return {
        ...baseConfig,
        monitoring: { ...baseConfig.monitoring, enabled: true },
        development: { ...baseConfig.development, watchMode: false },
        production: { ...baseConfig.production, optimizeForSize: true }
      };
      
    case 'development':
      return {
        ...baseConfig,
        monitoring: { ...baseConfig.monitoring, enabled: false },
        development: { ...baseConfig.development, watchMode: true },
        production: { ...baseConfig.production, optimizeForSize: false }
      };
      
    case 'test':
      return {
        ...baseConfig,
        monitoring: { ...baseConfig.monitoring, enabled: false },
        runtime: { ...baseConfig.runtime, maxConnections: 1 },
        chatgpt: { ...baseConfig.chatgpt, maxRetries: 1 }
      };
      
    default:
      return baseConfig;
  }
};