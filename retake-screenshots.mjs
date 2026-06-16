import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

(async () => {
    const screenshotDir = path.join(process.cwd(), 'rapport-pfe', 'assets', 'screenshots');
    
    console.log("Starting Backend server...");
    const backendProcess = spawn('npm', ['run', 'dev'], { cwd: './backend', shell: true });
    
    console.log("Starting Frontend server...");
    const frontendProcess = spawn('npm', ['run', 'dev'], { cwd: './frontend', shell: true });
    
    console.log("Waiting 15 seconds for servers to initialize...");
    await new Promise(r => setTimeout(r, 15000));

    console.log("Launching browser (Visible Mode)...");
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        console.log("Navigating to http://localhost:5173...");
        await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        console.log("Waiting 10 seconds for WebGL and live data to load...");
        await new Promise(r => setTimeout(r, 10000));
        
        console.log("Saving live_map.png...");
        await page.screenshot({ path: path.join(screenshotDir, 'live_map.png') });
        
        const tabs = [
            { name: 'history', text: 'HISTORY' },
            { name: 'dashboard', text: 'DASHBOARD' },
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
            
            console.log("Waiting 4 seconds for page to render...");
            await new Promise(r => setTimeout(r, 4000));
            console.log(`Saving ${tab.name}.png...`);
            await page.screenshot({ path: path.join(screenshotDir, `${tab.name}.png`) });
        }
    } catch(e) {
        console.error("Error taking screenshots:", e);
    } finally {
        await browser.close();
        
        // Terminate the servers
        backendProcess.kill();
        frontendProcess.kill();
        
        console.log("Done. All screenshots captured.");
    }
})();
