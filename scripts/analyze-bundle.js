#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

console.log('📊 Bundle Analysis Report');
console.log('========================\n');

// Analyze dist directory
function analyzeDist() {
  console.log('📁 Distribution Files:');
  console.log('----------------------');
  
  const distPath = 'dist';
  if (!existsSync(distPath)) {
    console.log('❌ No dist directory found. Run "npm run build" first.');
    return;
  }
  
  const files = readdirSync(distPath);
  let totalSize = 0;
  
  files.forEach(file => {
    const filePath = join(distPath, file);
    const stats = statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    totalSize += stats.size;
    
    console.log(`${file.padEnd(20)} ${sizeKB.padStart(8)} KB`);
  });
  
  console.log('----------------------');
  console.log(`Total:${' '.repeat(15)} ${(totalSize / 1024).toFixed(2)} KB\n`);
}

// Analyze dependencies
function analyzeDependencies() {
  console.log('📦 Dependencies Analysis:');
  console.log('------------------------');
  
  try {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    
    console.log(`Production Dependencies: ${Object.keys(deps).length}`);
    console.log(`Development Dependencies: ${Object.keys(devDeps).length}`);
    
    // Show largest dependencies
    const allDeps = { ...deps, ...devDeps };
    const depSizes = [];
    
    Object.keys(allDeps).forEach(dep => {
      try {
        const depPath = join('node_modules', dep);
        if (existsSync(depPath)) {
          const size = getDirectorySize(depPath);
          depSizes.push({ name: dep, size });
        }
      } catch (error) {
        // Skip if can't read
      }
    });
    
    depSizes.sort((a, b) => b.size - a.size);
    
    console.log('\nTop 10 Largest Dependencies:');
    depSizes.slice(0, 10).forEach((dep, index) => {
      const sizeMB = (dep.size / (1024 * 1024)).toFixed(2);
      console.log(`${(index + 1).toString().padStart(2)}. ${dep.name.padEnd(25)} ${sizeMB.padStart(8)} MB`);
    });
    
  } catch (error) {
    console.log('❌ Could not analyze dependencies:', error.message);
  }
}

// Helper function to get directory size
function getDirectorySize(dirPath) {
  try {
    const items = readdirSync(dirPath);
    let size = 0;
    
    items.forEach(item => {
      const itemPath = join(dirPath, item);
      try {
        const stats = statSync(itemPath);
        if (stats.isDirectory()) {
          size += getDirectorySize(itemPath);
        } else {
          size += stats.size;
        }
      } catch (error) {
        // Skip if can't read
      }
    });
    
    return size;
  } catch (error) {
    return 0;
  }
}

// Check if file exists
function existsSync(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Performance recommendations
function showRecommendations() {
  console.log('\n💡 Performance Recommendations:');
  console.log('-------------------------------');
  console.log('1. Use "npm run build:prod" for production builds');
  console.log('2. Consider using "npm run start:prod" for production');
  console.log('3. Monitor memory usage with --max-old-space-size flag');
  console.log('4. Consider lazy loading for heavy dependencies');
  console.log('5. Use production environment variables');
}

// Main analysis
try {
  analyzeDist();
  analyzeDependencies();
  showRecommendations();
} catch (error) {
  console.error('❌ Analysis failed:', error.message);
  process.exit(1);
}