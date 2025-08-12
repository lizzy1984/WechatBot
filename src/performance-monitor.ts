#!/usr/bin/env tsx

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

class PerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 10000;
  private readonly reportInterval = 60000; // 1 minute
  private intervalId?: NodeJS.Timeout;

  constructor() {
    super();
    this.startMonitoring();
  }

  startMonitoring(): void {
    this.intervalId = setInterval(() => {
      this.generateReport();
    }, this.reportInterval);
  }

  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  measure<T>(operation: string, fn: () => T | Promise<T>, metadata?: Record<string, any>): T | Promise<T> {
    const start = performance.now();
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = performance.now() - start;
          this.recordMetric(operation, duration, metadata);
        });
      } else {
        const duration = performance.now() - start;
        this.recordMetric(operation, duration, metadata);
        return result;
      }
    } catch (error) {
      const duration = performance.now() - start;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordMetric(operation, duration, { ...metadata, error: errorMessage });
      throw error;
    }
  }

  private recordMetric(operation: string, duration: number, metadata?: Record<string, any>): void {
    const metric: PerformanceMetric = {
      operation,
      duration,
      timestamp: Date.now(),
      metadata
    };

    this.metrics.push(metric);

    // Cleanup old metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics / 2);
    }

    // Emit metric for real-time monitoring
    this.emit('metric', metric);
  }

  getMetrics(operation?: string, timeRange?: { start: number; end: number }): PerformanceMetric[] {
    let filtered = this.metrics;

    if (operation) {
      filtered = filtered.filter(m => m.operation === operation);
    }

    if (timeRange) {
      filtered = filtered.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
    }

    return filtered;
  }

  getAverageDuration(operation: string, timeRange?: { start: number; end: number }): number {
    const metrics = this.getMetrics(operation, timeRange);
    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  getMemoryUsage(): MemoryUsage {
    return process.memoryUsage();
  }

  getSystemInfo(): Record<string, any> {
    const memUsage = this.getMemoryUsage();
    const uptime = process.uptime();
    
    return {
      uptime,
      memory: {
        rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
        arrayBuffers: `${(memUsage.arrayBuffers / 1024 / 1024).toFixed(2)} MB`
      },
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid
    };
  }

  private generateReport(): void {
    const now = Date.now();
    const lastMinute = now - 60000;
    
    const recentMetrics = this.getMetrics(undefined, { start: lastMinute, end: now });
    const systemInfo = this.getSystemInfo();
    
    // Group metrics by operation
    const operationStats = new Map<string, { count: number; totalDuration: number; avgDuration: number }>();
    
    recentMetrics.forEach(metric => {
      const existing = operationStats.get(metric.operation) || { count: 0, totalDuration: 0, avgDuration: 0 };
      existing.count++;
      existing.totalDuration += metric.duration;
      existing.avgDuration = existing.totalDuration / existing.count;
      operationStats.set(metric.operation, existing);
    });

    // Generate report
    let report = `\n📊 Performance Report (Last Minute)\n`;
    report += `=====================================\n`;
    report += `Timestamp: ${new Date().toISOString()}\n`;
    report += `Total Operations: ${recentMetrics.length}\n\n`;
    
    report += `Operation Statistics:\n`;
    operationStats.forEach((stats, operation) => {
      report += `  ${operation}:\n`;
      report += `    Count: ${stats.count}\n`;
      report += `    Avg Duration: ${stats.avgDuration.toFixed(2)}ms\n`;
      report += `    Total Duration: ${stats.totalDuration.toFixed(2)}ms\n\n`;
    });

    report += `System Information:\n`;
    report += `  Uptime: ${(systemInfo.uptime / 60).toFixed(2)} minutes\n`;
    report += `  Memory RSS: ${systemInfo.memory.rss}\n`;
    report += `  Heap Used: ${systemInfo.memory.heapUsed}\n`;
    report += `  Platform: ${systemInfo.platform}\n`;
    report += `  Node Version: ${systemInfo.nodeVersion}\n`;

    console.log(report);

    // Emit report event
    this.emit('report', {
      timestamp: now,
      metrics: recentMetrics,
      operationStats: Object.fromEntries(operationStats),
      systemInfo
    });
  }

  // Performance decorator for methods
  static monitor(operationName?: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
      const method = descriptor.value;
      const operation = operationName || `${target.constructor.name}.${propertyName}`;

      descriptor.value = function (...args: any[]) {
        const start = performance.now();
        
        try {
          const result = method.apply(this, args);
          
          if (result instanceof Promise) {
            return result.finally(() => {
              const duration = performance.now() - start;
              // Use the global performance monitor
              performanceMonitor.recordMetric(operation, duration, { args: args.length });
            });
          } else {
            const duration = performance.now() - start;
            performanceMonitor.recordMetric(operation, duration, { args: args.length });
            return result;
          }
        } catch (error) {
          const duration = performance.now() - start;
          const errorMessage = error instanceof Error ? error.message : String(error);
          performanceMonitor.recordMetric(operation, duration, { 
            args: args.length, 
            error: errorMessage 
          });
          throw error;
        }
      };
    };
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Export the class for use in other modules
export { PerformanceMonitor };

// Auto-cleanup on process exit
process.on('SIGINT', () => {
  performanceMonitor.stopMonitoring();
  process.exit(0);
});

process.on('SIGTERM', () => {
  performanceMonitor.stopMonitoring();
  process.exit(0);
});

// If this file is run directly, start monitoring
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting performance monitoring...');
  console.log('Press Ctrl+C to stop monitoring');
  
  // Example usage
  performanceMonitor.on('metric', (metric) => {
    if (metric.duration > 1000) { // Log slow operations
      console.log(`🐌 Slow operation detected: ${metric.operation} took ${metric.duration.toFixed(2)}ms`);
    }
  });
  
  performanceMonitor.on('report', (_report) => {
    // You can send this report to external monitoring systems
    // console.log('Performance report generated:', report);
  });
}