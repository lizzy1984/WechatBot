#!/usr/bin/env tsx

import { readFileSync, writeFileSync } from 'fs';

interface DependencyInfo {
  name: string;
  size: number;
  version: string;
  dependencies: number;
}

async function analyzeBundle() {
  console.log('🔍 Analyzing bundle size and dependencies...\n');

  try {
    // Get package-lock.json info
    const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf-8'));
    
    // Analyze dependencies
    const dependencies: DependencyInfo[] = [];
    
    for (const [name, info] of Object.entries(packageLock.dependencies || {})) {
      const depInfo = info as any;
      if (depInfo.dev) continue; // Skip dev dependencies for production bundle analysis
      
      dependencies.push({
        name,
        size: depInfo.size || 0,
        version: depInfo.version || 'unknown',
        dependencies: Object.keys(depInfo.dependencies || {}).length
      });
    }

    // Sort by size (largest first)
    dependencies.sort((a, b) => b.size - a.size);

    // Generate report
    let report = '# Bundle Analysis Report\n\n';
    report += '## Largest Dependencies\n\n';
    report += '| Package | Size | Version | Dependencies |\n';
    report += '|---------|------|---------|--------------|\n';
    
    dependencies.slice(0, 20).forEach(dep => {
      const sizeInMB = (dep.size / 1024 / 1024).toFixed(2);
      report += `| ${dep.name} | ${sizeInMB} MB | ${dep.version} | ${dep.dependencies} |\n`;
    });

    report += '\n## Total Bundle Size\n\n';
    const totalSize = dependencies.reduce((sum, dep) => sum + dep.size, 0);
    const totalSizeInMB = (totalSize / 1024 / 1024).toFixed(2);
    report += `**Total Production Dependencies:** ${totalSizeInMB} MB\n\n`;

    // Check for potential optimizations
    report += '## Optimization Recommendations\n\n';
    
    const largeDeps = dependencies.filter(d => d.size > 1024 * 1024); // > 1MB
    if (largeDeps.length > 0) {
      report += '### Large Dependencies (>1MB)\n\n';
      largeDeps.forEach(dep => {
        const sizeInMB = (dep.size / 1024 / 1024).toFixed(2);
        report += `- **${dep.name}** (${sizeInMB} MB): Consider if this is needed in production\n`;
      });
      report += '\n';
    }

    // Check for duplicate dependencies
    const versions = new Map<string, string[]>();
    dependencies.forEach(dep => {
      if (!versions.has(dep.name)) {
        versions.set(dep.name, []);
      }
      versions.get(dep.name)!.push(dep.version);
    });

    const duplicates = Array.from(versions.entries())
      .filter(([_, versions]) => versions.length > 1);
    
    if (duplicates.length > 0) {
      report += '### Duplicate Dependencies\n\n';
      duplicates.forEach(([name, versions]) => {
        report += `- **${name}**: Multiple versions detected (${versions.join(', ')})\n`;
      });
      report += '\n';
    }

    // Write report
    writeFileSync('bundle-analysis.md', report);
    console.log('✅ Bundle analysis complete! Check bundle-analysis.md for details.');
    
    // Console summary
    console.log(`\n📊 Summary:`);
    console.log(`Total dependencies: ${dependencies.length}`);
    console.log(`Total size: ${totalSizeInMB} MB`);
    console.log(`Largest dependency: ${dependencies[0]?.name} (${(dependencies[0]?.size / 1024 / 1024).toFixed(2)} MB)`);
    
    if (largeDeps.length > 0) {
      console.log(`\n⚠️  Large dependencies found: ${largeDeps.length}`);
      console.log('Consider optimizing these for better performance.');
    }

  } catch (error) {
    console.error('❌ Error analyzing bundle:', error);
    process.exit(1);
  }
}

// Run analysis
analyzeBundle();