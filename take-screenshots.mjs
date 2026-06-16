import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

(async () => {
    const screenshotDir = path.join(process.cwd(), 'rapport-pfe', 'assets', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    console.log("Starting Vite server...");
    const viteProcess = spawn('npm', ['run', 'dev'], { cwd: './frontend', shell: true });
    
    // Wait for vite to be ready
    await new Promise(r => setTimeout(r, 8000));

    console.log("Launching browser...");
    const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--use-gl=egl', '--no-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        console.log("Navigating to http://localhost:5173...");
        await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        await new Promise(r => setTimeout(r, 5000));
        
        console.log("Saving dashboard.png...");
        await page.screenshot({ path: path.join(screenshotDir, 'dashboard.png') });
        
        const tabs = [
            { name: 'history', text: 'HISTORY' },
            { name: 'analytics', text: 'ANALYTICS' },
            { name: 'stix', text: 'STIX INTEL' }
        ];
        
        for (let tab of tabs) {
            console.log(`Clicking ${tab.text}...`);
            await page.evaluate((text) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent && b.textContent.includes(text));
                if (btn) btn.click();
            }, tab.text);
            
            await new Promise(r => setTimeout(r, 2000));
            console.log(`Saving ${tab.name}.png...`);
            await page.screenshot({ path: path.join(screenshotDir, `${tab.name}.png`) });
        }
    } catch(e) {
        console.error("Error taking screenshots:", e);
    } finally {
        await browser.close();
        viteProcess.kill();
        console.log("Done.");
    }
})();
