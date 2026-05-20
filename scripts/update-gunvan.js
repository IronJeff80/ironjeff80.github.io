import fs from 'fs';
import * as cheerio from 'cheerio';

async function fetchGunVanLocation() {
    try {
        console.log("Fetching latest Gun Van data...");
        
        // Target the GTA Wiki (or GTALens if they render server-side HTML)
        const response = await fetch('https://gta.wiki/w/Gun_Van');
        const html = await response.text();
        
        // Load the HTML into Cheerio so we can query it like CSS
        const $ = cheerio.load(html);

        // Note: Websites change their layout. This selector looks for the first bold 
        // text in the "Current Location" table data. You may need to tweak this 
        // selector based on the exact HTML structure of the page!
        let location = $('th:contains("Current location")').next('td').text().trim();

        // Fallback if the wiki format changes slightly
        if (!location) {
            location = "Location data parsing failed. Check scraper script.";
            console.warn("Could not find the exact location text.");
        }

        console.log(`Found location: ${location}`);

        // Ensure the public/api directory exists
        if (!fs.existsSync('./public/api')) {
            fs.mkdirSync('./public/api', { recursive: true });
        }

        // Save the data to our local JSON file
        const data = { 
            location: location, 
            updatedAt: new Date().toISOString() 
        };

        fs.writeFileSync('./public/api/gunvan.json', JSON.stringify(data, null, 2));
        console.log("Successfully saved to /public/api/gunvan.json");

    } catch (error) {
        console.error("Scraper Error:", error);
        process.exit(1); // Tell GitHub Action that it failed
    }
}

fetchGunVanLocation();