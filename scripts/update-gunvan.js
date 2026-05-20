import fs from 'fs';
import puppeteer from 'puppeteer';

async function fetchGunVanLocation() {
    console.log("Starting headless browser to bypass JavaScript blocks...");
    
    // Launch an invisible Chrome browser
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for GitHub Actions
    });

    try {
        const page = await browser.newPage();
        
        // Pretend to be a normal desktop user
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log("Navigating to GTALens...");
        // waitUntil: 'networkidle2' tells the browser to wait until the JavaScript finishes building the page
        await page.goto('https://gtalens.com/map/gun-vans', { waitUntil: 'networkidle2', timeout: 30000 });

        // Extract all the visible text from the fully rendered page
        const plainText = await page.evaluate(() => document.body.innerText);

        let location = "";
        let inventory = [];

        // 1. EXTRACT THE LOCATION (Using the exact same Regex)
        const activeMatch = plainText.match(/(Gun Van #\d+)[\s\S]*?\[active\]/i);
        if (activeMatch) {
            location = activeMatch[1].trim();
        }

        // 2. EXTRACT THE INVENTORY
        const inventoryMatch = plainText.match(/In stock:([\s\S]*?)(?=Locations|Gun Van #1\s)/i);
        if (inventoryMatch) {
            const rawItems = inventoryMatch[1].split('\n');
            inventory = rawItems
                .map(item => item.trim())
                .filter(item => item.length > 0 && item !== "Weapons:" && item !== "Throwables:");
        }

        if (!location) {
            location = "Location data parsing failed.";
            console.warn("Could not find the [active] tag even after JS rendered.");
            console.log("--- DEBUG: PAGE TEXT SNIPPET ---");
            console.log(plainText.substring(0, 500)); // Print a snippet to see what it actually saw
        } 

        console.log(`Final Location Found: ${location}`);
        console.log(`Inventory Items Found: ${inventory.length}`);

        // 3. SAVE TO JSON
        if (!fs.existsSync('./public/api')) {
            fs.mkdirSync('./public/api', { recursive: true });
        }

        const data = { 
            location: location, 
            inventory: inventory,
            updatedAt: new Date().toISOString() 
        };

        fs.writeFileSync('./public/api/gunvan.json', JSON.stringify(data, null, 2));
        console.log("Successfully saved to /public/api/gunvan.json");

    } catch (error) {
        console.error("Scraper Error:", error);
        process.exit(1); 
    } finally {
        // ALWAYS close the browser to free up server memory
        await browser.close();
    }
}

fetchGunVanLocation();