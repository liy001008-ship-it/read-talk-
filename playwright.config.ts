import {defineConfig} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
const testData=fs.mkdtempSync(path.join(os.tmpdir(),'between-pages-e2e-'));
export default defineConfig({testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:150000,expect:{timeout:20000},use:{baseURL:'http://127.0.0.1:3100',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},screenshot:'only-on-failure'},webServer:{command:`"${process.execPath}" scripts/e2e-server.mjs`,url:'http://127.0.0.1:3100/api/health',timeout:360000,reuseExistingServer:false,env:{DATA_DIR:testData,OPENAI_API_KEY:''}}});
