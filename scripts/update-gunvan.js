import fs from 'fs';
import * as cheerio from 'cheerio';

async function fetchGunVanLocation() {
    try {
        console.log("Fetching latest Gun Van data...");
        let location = "";

        // TARGET 1: GTA Wiki
        try {
            const wikiRes = await fetch('https://gta.wiki/w/Gun_Van');
            const wikiHtml = await wikiRes.text();
            const $wiki = cheerio.load(wikiHtml);
            
            // Look for standard Wiki table structures for "Current location"
            location = $wiki('th:contains("Current")').next('td').text().trim();
            
            if (!location) {
                // Fallback for Wiki Infoboxes
                location = $wiki('[data-source="location"] .pi-data-value').first().text().trim();
            }
        } catch (e) {
            console.log("Wiki fetch failed, trying fallback...");
        }

        // TARGET 2: Rockstar Intel (If Target 1 fails)
        if (!location || location.toLowerCase().includes("changes daily") || location.includes("parsing failed")) {
            console.log("Wiki data unclear. Falling back to Rockstar Intel...");
            const intelRes = await fetch('https://rockstarintel.com/gta-online-gun-van-location/');
            const intelHtml = await intelRes.text();
            const $intel = cheerio.load(intelHtml);
            
            // Rockstar Intel usually puts the location right after a specific header
            location = $intel('h2:contains("Where is the Gun Van today")').next('p').text().trim();
        }

        // Final cleanup & validation
        if (!location) {
            location = "Location data parsing failed. Check scraper script.";
            console.warn("Could not find the exact location text on any target.");
        } else {
            // Remove Wikipedia-style citation brackets (e.g., "[1]")
            location = location.replace(/\[\d+\]/g, '').trim();
        }

        console.log(`Final Location Found: ${location}`);

        // Ensure directory exists and save
        if (!fs.existsSync('./public/api')) {
            fs.mkdirSync('./public/api', { recursive: true });
        }

        const data = { 
            location: location, 
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