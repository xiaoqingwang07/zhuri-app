#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const token = process.env.GH_TOKEN || '';
const repo = `https://xiaoqingwang07:${token}@github.com/xiaoqingwang07/zhuri-app.git`;
const outDir = path.join(__dirname, 'out');

try {
  // Initialize git in out directory
  execSync('rm -rf .git', { cwd: outDir, stdio: 'pipe' });
  execSync('git init', { cwd: outDir, stdio: 'pipe' });
  execSync(`git remote add origin ${repo}`, { cwd: outDir, stdio: 'pipe' });
  execSync('git checkout -b gh-pages', { cwd: outDir, stdio: 'pipe' });
  execSync('git add .', { cwd: outDir, stdio: 'pipe' });
  const date = new Date().toISOString().replace(/T/, '-').slice(0, 16);
  execSync(`git commit -m "Deploy ${date}"`, { cwd: outDir, stdio: 'inherit' });
  execSync('git push origin gh-pages --force', { cwd: outDir, stdio: 'inherit' });
  console.log('✅ Deployed!');
} catch (e) {
  console.error('Deploy failed:', e.message);
  process.exit(1);
}
