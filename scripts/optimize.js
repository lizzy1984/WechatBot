#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('🔧 Starting production optimization...');

// Create scripts directory if it doesn't exist
if (!existsSync('scripts')) {
  mkdirSync('scripts');
}

// Optimize production build
function optimizeProduction() {
  console.log('📦 Optimizing production build...');
  
  // Remove source maps in production
  const distFiles = readdirSync('dist');
  distFiles.forEach(file => {
    if (file.endsWith('.js')) {
      const filePath = join('dist', file);
      let content = readFileSync(filePath, 'utf8');
      
      // Remove console.debug statements in production
      content = content.replace(/console\.debug\([^)]*\);?\n?/g, '');
      
      // Remove comments
      content = content.replace(/\/\/.*$/gm, '');
      content = content.replace(/\/\*[\s\S]*?\*\//g, '');
      
      writeFileSync(filePath, content);
      console.log(`✅ Optimized ${file}`);
    }
  });
}

// Generate bundle analysis
function generateBundleAnalysis() {
  console.log('📊 Generating bundle analysis...');
  
  const analysis = {
    timestamp: new Date().toISOString(),
    files: [],
    totalSize: 0,
    dependencies: {}
  };
  
  // Analyze dist files
  const distFiles = readdirSync('dist');
  distFiles.forEach(file => {
    if (file.endsWith('.js')) {
      const filePath = join('dist', file);
      const stats = statSync(filePath);
      const size = stats.size;
      analysis.files.push({ name: file, size });
      analysis.totalSize += size;
    }
  });
  
  // Analyze package dependencies
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    analysis.dependencies = {
      production: Object.keys(packageJson.dependencies || {}),
      development: Object.keys(packageJson.devDependencies || {})
    };
  } catch (error) {
    console.warn('⚠️ Could not analyze package.json');
  }
  
  writeFileSync('dist/bundle-analysis.json', JSON.stringify(analysis, null, 2));
  console.log('✅ Bundle analysis generated');
}

// Main optimization
try {
  optimizeProduction();
  generateBundleAnalysis();
  console.log('🎉 Production optimization completed!');
} catch (error) {
  console.error('❌ Optimization failed:', error.message);
  process.exit(1);
}