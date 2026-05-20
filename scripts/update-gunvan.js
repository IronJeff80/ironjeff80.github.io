import fs from 'fs';
import * as cheerio from 'cheerio';

async function fetchGunVanLocation() {
    try {
        console.log("Fetching latest Gun Van data...");
        
        // Replace this URL with the actual site you are targeting
        const targetUrl = 'https://gtalens.com/map/gun-vans'; 
        const response = await fetch(targetUrl);
        const html = await response.text();
        
        const $ = cheerio.load(html);
        
        // Strip all HTML tags to get pure text, just like your copy-paste
        const plainText = $('body').text();

        let location = "";
        let inventory = [];

        // 1. EXTRACT THE LOCATION
        // Looks for "Gun Van #X" followed by "[active]"
        const activeMatch = plainText.match(/(Gun Van #\d+)[\s\S]*?\[active\]/i);
        if (activeMatch) {
            location = activeMatch[1].trim();
        }

        // 2. EXTRACT THE INVENTORY
        // Looks for the text between "In stock:" and "Locations"
        const inventoryMatch = plainText.match(/In stock:([\s\S]*?)(?=Locations|Gun Van #1\s)/i);
        if (inventoryMatch) {
            // Split the block into individual lines, clean up empty spaces
            const rawItems = inventoryMatch[1].split('\n');
            inventory = rawItems
                .map(item => item.trim())
                .filter(item => item.length > 0 && item !== "Weapons:" && item !== "Throwables:");
        }

        // 3. FALLBACKS & VALIDATION
        if (!location) {
            location = "Location data parsing failed.";
            console.warn("Could not find the [active] tag in the text.");
        } 

        console.log(`Final Location Found: ${location}`);
        console.log(`Inventory Items Found: ${inventory.length}`);

        // 4. SAVE TO JSON
        if (!fs.existsSync('./public/api')) {
            fs.mkdirSync('./public/api', { recursive: true });
        }

        const data = { 
            location: location, 
            inventory: inventory, // Added the array of items!
            updatedAt: new Date().toISOString() 
        };

        fs.writeFileSync('./public/api/gunvan.json', JSON.stringify(data, null, 2));
        console.log("Successfully saved to /public/api/gunvan.json");

    } catch (error) {
        console.error("Scraper Error:", error);
        process.exit(1); 
    }
}

fetchGunVanLocation();