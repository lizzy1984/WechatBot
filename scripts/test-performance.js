#!/usr/bin/env node

import { performance } from 'perf_hooks';
import { readFileSync, writeFileSync } from 'fs';

console.log('🧪 Performance Testing Suite');
console.log('============================\n');

class PerformanceTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: {}
    };
  }

  // Test message processing performance
  async testMessageProcessing() {
    console.log('📝 Testing message processing performance...');
    
    const testMessages = [
      'Hello, how are you?',
      'What is the weather like today?',
      'Can you help me with a programming question?',
      'Tell me a joke',
      'Explain quantum physics in simple terms'
    ];

    const processingTimes = [];
    
    for (const message of testMessages) {
      const start = performance.now();
      
      // Simulate message processing
      await this.simulateMessageProcessing(message);
      
      const end = performance.now();
      const duration = end - start;
      processingTimes.push(duration);
      
      console.log(`  Message: "${message.substring(0, 30)}..." - ${duration.toFixed(2)}ms`);
    }

    const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    const minTime = Math.min(...processingTimes);
    const maxTime = Math.max(...processingTimes);

    this.results.tests.messageProcessing = {
      average: avgTime,
      min: minTime,
      max: maxTime,
      total: processingTimes.length,
      times: processingTimes
    };

    console.log(`  ✅ Average processing time: ${avgTime.toFixed(2)}ms\n`);
  }

  // Test memory usage
  async testMemoryUsage() {
    console.log('🧠 Testing memory usage...');
    
    const initialMemory = process.memoryUsage();
    
    // Simulate memory-intensive operations
    const testData = [];
    for (let i = 0; i < 1000; i++) {
      testData.push({
        id: i,
        message: `Test message ${i}`,
        timestamp: Date.now(),
        data: new Array(100).fill('test').join('')
      });
    }
    
    const afterDataCreation = process.memoryUsage();
    
    // Clear test data
    testData.length = 0;
    
    const afterCleanup = process.memoryUsage();
    
    this.results.tests.memoryUsage = {
      initial: {
        rss: Math.round(initialMemory.rss / 1024 / 1024),
        heapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(initialMemory.heapTotal / 1024 / 1024)
      },
      afterDataCreation: {
        rss: Math.round(afterDataCreation.rss / 1024 / 1024),
        heapUsed: Math.round(afterDataCreation.heapUsed / 1024 / 1024),
        heapTotal: Math.round(afterDataCreation.heapTotal / 1024 / 1024)
      },
      afterCleanup: {
        rss: Math.round(afterCleanup.rss / 1024 / 1024),
        heapUsed: Math.round(afterCleanup.heapUsed / 1024 / 1024),
        heapTotal: Math.round(afterCleanup.heapTotal / 1024 / 1024)
      }
    };

    console.log(`  ✅ Memory test completed`);
    console.log(`     Initial: ${this.results.tests.memoryUsage.initial.heapUsed}MB`);
    console.log(`     Peak: ${this.results.tests.memoryUsage.afterDataCreation.heapUsed}MB`);
    console.log(`     Final: ${this.results.tests.memoryUsage.afterCleanup.heapUsed}MB\n`);
  }

  // Test string operations performance
  async testStringOperations() {
    console.log('🔤 Testing string operations performance...');
    
    const testString = 'This is a test message that needs to be processed and cleaned up for the ChatGPT bot';
    const iterations = 10000;
    
    // Test original string operations
    const originalStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const parts = testString.split('- - - - - - - - - - - - - - -');
      const text = parts.length > 1 ? parts[parts.length - 1] : testString;
      text.replace('test', '');
    }
    const originalEnd = performance.now();
    const originalTime = originalEnd - originalStart;

    // Test optimized string operations
    const optimizedStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      const parts = testString.split('- - - - - - - - - - - - - - -');
      const text = parts.length > 1 ? parts[parts.length - 1] : testString;
      if (text.includes('test')) {
        text.replace('test', '');
      }
    }
    const optimizedEnd = performance.now();
    const optimizedTime = optimizedEnd - optimizedStart;

    this.results.tests.stringOperations = {
      original: originalTime,
      optimized: optimizedTime,
      improvement: ((originalTime - optimizedTime) / originalTime * 100).toFixed(2)
    };

    console.log(`  ✅ String operations test completed`);
    console.log(`     Original: ${originalTime.toFixed(2)}ms`);
    console.log(`     Optimized: ${optimizedTime.toFixed(2)}ms`);
    console.log(`     Improvement: ${this.results.tests.stringOperations.improvement}%\n`);
  }

  // Test cache performance
  async testCachePerformance() {
    console.log('💾 Testing cache performance...');
    
    const cacheSize = 100;
    const testData = new Map();
    
    // Fill cache
    const fillStart = performance.now();
    for (let i = 0; i < cacheSize; i++) {
      testData.set(`key${i}`, `value${i}`);
    }
    const fillEnd = performance.now();
    const fillTime = fillEnd - fillStart;

    // Test cache lookups
    const lookupStart = performance.now();
    for (let i = 0; i < cacheSize * 10; i++) {
      const key = `key${i % cacheSize}`;
      testData.get(key);
    }
    const lookupEnd = performance.now();
    const lookupTime = lookupEnd - lookupStart;

    this.results.tests.cachePerformance = {
      fillTime,
      lookupTime,
      cacheSize,
      lookupsPerSecond: Math.round((cacheSize * 10) / (lookupTime / 1000))
    };

    console.log(`  ✅ Cache performance test completed`);
    console.log(`     Fill time: ${fillTime.toFixed(2)}ms`);
    console.log(`     Lookup time: ${lookupTime.toFixed(2)}ms`);
    console.log(`     Lookups/sec: ${this.results.tests.cachePerformance.lookupsPerSecond}\n`);
  }

  // Simulate message processing
  async simulateMessageProcessing(message) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    
    // Simulate string operations
    const processed = message.toLowerCase().replace(/[^\w\s]/g, '');
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    
    return processed;
  }

  // Generate performance report
  generateReport() {
    console.log('📊 Performance Test Report');
    console.log('==========================');
    
    // Calculate summary statistics
    const messageProcessing = this.results.tests.messageProcessing;
    const stringOperations = this.results.tests.stringOperations;
    const cachePerformance = this.results.tests.cachePerformance;
    
    this.results.summary = {
      overallScore: this.calculateOverallScore(),
      recommendations: this.generateRecommendations(),
      timestamp: new Date().toISOString()
    };

    console.log(`Overall Performance Score: ${this.results.summary.overallScore}/100`);
    console.log(`Message Processing: ${messageProcessing.average.toFixed(2)}ms avg`);
    console.log(`String Operations: ${stringOperations.improvement}% improvement`);
    console.log(`Cache Performance: ${cachePerformance.lookupsPerSecond} lookups/sec`);
    
    console.log('\n💡 Recommendations:');
    this.results.summary.recommendations.forEach((rec, index) => {
      console.log(`  ${index + 1}. ${rec}`);
    });

    // Save detailed report
    const reportPath = 'performance-test-report.json';
    writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  calculateOverallScore() {
    const messageScore = Math.max(0, 100 - (this.results.tests.messageProcessing.average / 10));
    const stringScore = Math.min(100, 50 + parseFloat(this.results.tests.stringOperations.improvement));
    const cacheScore = Math.min(100, this.results.tests.cachePerformance.lookupsPerSecond / 100);
    
    return Math.round((messageScore + stringScore + cacheScore) / 3);
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.results.tests.messageProcessing.average > 50) {
      recommendations.push('Consider optimizing message processing algorithms');
    }
    
    if (parseFloat(this.results.tests.stringOperations.improvement) < 10) {
      recommendations.push('String operations could benefit from further optimization');
    }
    
    if (this.results.tests.cachePerformance.lookupsPerSecond < 1000) {
      recommendations.push('Cache performance could be improved');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Performance is excellent! Keep up the good work.');
    }
    
    return recommendations;
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Starting performance tests...\n');
    
    await this.testMessageProcessing();
    await this.testMemoryUsage();
    await this.testStringOperations();
    await this.testCachePerformance();
    
    this.generateReport();
  }
}

// Run tests
const tester = new PerformanceTester();
tester.runAllTests().catch(console.error);