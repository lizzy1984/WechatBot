#!/usr/bin/env node

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

console.log('📊 Performance Monitoring Started');
console.log('================================\n');

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      startupTime: 0,
      messageProcessingTimes: [],
      memoryUsage: [],
      errorCount: 0,
      messageCount: 0,
      startTime: Date.now()
    };
    
    this.startMonitoring();
  }

  startMonitoring() {
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      this.recordMemoryUsage();
    }, 30000);

    // Monitor system resources every minute
    setInterval(() => {
      this.recordSystemMetrics();
    }, 60000);

    // Generate performance report every 5 minutes
    setInterval(() => {
      this.generateReport();
    }, 5 * 60 * 1000);
  }

  recordMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage.push({
      timestamp: Date.now(),
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external
    });

    // Keep only last 100 memory readings
    if (this.metrics.memoryUsage.length > 100) {
      this.metrics.memoryUsage.shift();
    }
  }

  recordSystemMetrics() {
    // This could be extended to monitor CPU, disk I/O, etc.
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    console.log(`📈 System Metrics - Uptime: ${Math.round(uptime)}s, Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  }

  recordMessageProcessingTime(timeMs) {
    this.metrics.messageProcessingTimes.push(timeMs);
    this.metrics.messageCount++;
    
    // Keep only last 1000 processing times
    if (this.metrics.messageProcessingTimes.length > 1000) {
      this.metrics.messageProcessingTimes.shift();
    }
  }

  recordError() {
    this.metrics.errorCount++;
  }

  generateReport() {
    const now = Date.now();
    const uptime = now - this.metrics.startTime;
    
    const avgProcessingTime = this.metrics.messageProcessingTimes.length > 0 
      ? this.metrics.messageProcessingTimes.reduce((a, b) => a + b, 0) / this.metrics.messageProcessingTimes.length
      : 0;
    
    const maxProcessingTime = Math.max(...this.metrics.messageProcessingTimes, 0);
    const minProcessingTime = Math.min(...this.metrics.messageProcessingTimes, Infinity);
    
    const currentMemory = this.metrics.memoryUsage.length > 0 
      ? this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1]
      : null;

    const report = {
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime / 1000),
      messageCount: this.metrics.messageCount,
      errorCount: this.metrics.errorCount,
      processingTime: {
        average: Math.round(avgProcessingTime),
        max: Math.round(maxProcessingTime),
        min: Math.round(minProcessingTime),
        total: this.metrics.messageProcessingTimes.length
      },
      memory: currentMemory ? {
        rss: Math.round(currentMemory.rss / 1024 / 1024),
        heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(currentMemory.heapTotal / 1024 / 1024)
      } : null,
      performance: {
        messagesPerSecond: Math.round((this.metrics.messageCount / (uptime / 1000)) * 100) / 100,
        errorRate: Math.round((this.metrics.errorCount / Math.max(this.metrics.messageCount, 1)) * 10000) / 100
      }
    };

    // Save report to file
    const reportPath = 'performance-report.json';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    // Display summary
    console.log('\n📊 Performance Report Generated');
    console.log('================================');
    console.log(`Uptime: ${report.uptime}s`);
    console.log(`Messages: ${report.messageCount} (${report.performance.messagesPerSecond}/s)`);
    console.log(`Errors: ${report.errorCount} (${report.performance.errorRate}%)`);
    console.log(`Avg Processing Time: ${report.processingTime.average}ms`);
    console.log(`Memory Usage: ${report.memory?.heapUsed || 'N/A'}MB`);
    console.log(`Report saved to: ${reportPath}\n`);
  }

  // Method to be called from the main application
  static recordMessageProcessing(timeMs) {
    if (global.performanceMonitor) {
      global.performanceMonitor.recordMessageProcessingTime(timeMs);
    }
  }

  static recordError() {
    if (global.performanceMonitor) {
      global.performanceMonitor.recordError();
    }
  }
}

// Start monitoring
const monitor = new PerformanceMonitor();
global.performanceMonitor = monitor;

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔄 Shutting down performance monitor...');
  monitor.generateReport();
  process.exit(0);
});

console.log('✅ Performance monitoring active');
console.log('📝 Reports will be generated every 5 minutes');
console.log('💡 Use Ctrl+C to generate final report and exit\n');