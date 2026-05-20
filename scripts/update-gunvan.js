import fs from 'fs';
import puppeteer from 'puppeteer';

// The Master Dictionary translating IDs to real locations
const LOCATION_DICT = {
    "1": "No Marks Cleaners, Paleto Bay",
    "2": "Behind the Discount Store, Grapeseed",
    "3": "Merle Abrahams' house, Sandy Shores",
    "4": "Dirt road overlooking Larry's RV Sales, Grand Senora Desert",
    "5": "Vinewood Sign",
    "6": "Behind Ink Inc. Tattoos, Chumash Plaza",
    "7": "Paleto Forest Lumber Yard",
    "8": "Next to Ortega's Trailer, Zancudo River",
    "9": "Palmer-Taylor Power Station",
    "10": "Under the Fort Zancudo Approach Road bridge, Fort Zancudo",
    "11": "Thomson Scrapyard",
    "12": "Car Scrapyard, El Burro Heights",
    "13": "LT Weld Supply Co. / Lester's Warehouse, Murrieta Heights",
    "14": "Walker Ocean Store, Port of Los Santos",
    "15": "Land Act Reservoir (north end)",
    "16": "Fridgit, Forced Labor Place, La Mesa",
    "17": "Terminal (southwest corner)",
    "18": "Rogers Salvage & Scrap, La Puerta",
    "19": "Popular Street, La Mesa",
    "20": "Alleyway carport, Del Perro",
    "21": "Magellan Ave / Conquistador St, Vespucci Beach",
    "22": "Parking above J's Bonds, West Vinewood",
    "23": "Parking garage south of Oriental Theater, Downtown Vinewood",
    "24": "24 hour parking, Pillbox Hill",
    "25": "Caesars Auto Parking, Little Seoul",
    "26": "Abandoned auto service garage, Joshua Road, Alamo Sea",
    "27": "Hookies, North Chumash",
    "28": "Public toilets west of Procopio Truck Stop, Procopio Beach",
    "29": "Hearty Taco, Mirror Park",
    "30": "In an alley next to Bishop's Chicken, Davis"
};

async function fetchGunVanLocation() {
    console.log("Starting headless browser to bypass JavaScript blocks...");
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        console.log("Navigating to GTALens...");
        await page.goto('https://gtalens.com/map/gun-vans', { waitUntil: 'networkidle2', timeout: 30000 });

        const plainText = await page.evaluate(() => document.body.innerText);

        let rawLocationId = "";
        let finalLocationName = "Location data parsing failed.";
        let imagePath = "";
        let mapPath = "";
        let inventory = [];

        // 1. EXTRACT THE LOCATION ID
        const activeMatch = plainText.match(/Gun Van #(\d+)[\s\S]*?\[active\]/i);
        if (activeMatch) {
            rawLocationId = activeMatch[1].trim(); // Grabs just the number (e.g., "9")
            
            // Map the number to our dictionary
            if (LOCATION_DICT[rawLocationId]) {
                finalLocationName = LOCATION_DICT[rawLocationId];
                // Generate predictable image paths based on the ID
                imagePath = `/images/gunvan/loc_${rawLocationId}.jpg`;
                mapPath = `/images/gunvan/map_${rawLocationId}.jpg`;
            } else {
                finalLocationName = `Gun Van #${rawLocationId} (Unknown Mapping)`;
            }
        }

        // 2. EXTRACT & FILTER THE INVENTORY
        const inventoryMatch = plainText.match(/In stock:([\s\S]*?)(?=Locations|Gun Van #1\s)/i);
        if (inventoryMatch) {
            const rawItems = inventoryMatch[1].split('\n');
            inventory = rawItems
                .map(item => item.trim())
                .filter(item => {
                    // Filter out empty lines, headers, and irrelevant site text
                    if (item.length === 0) return false;
                    if (item === "Weapons:" || item === "Throwables:") return false;
                    if (item.includes("updated weekly")) return false;
                    if (item.includes("Watch video")) return false;
                    if (item.includes("Remove all checkmarks")) return false;
                    if (item.includes("Reveal coordinates")) return false;
                    return true;
                });
        }

        console.log(`Location Found: ${finalLocationName}`);
        console.log(`Inventory Items Found: ${inventory.length}`);

        // 3. SAVE TO JSON
        if (!fs.existsSync('./public/api')) {
            fs.mkdirSync('./public/api', { recursive: true });
        }

        const data = { 
            id: rawLocationId,
            locationName: finalLocationName, 
            imagePath: imagePath,
            mapPath: mapPath,
            inventory: inventory,
            updatedAt: new Date().toISOString() 
        };

        fs.writeFileSync('./public/api/gunvan.json', JSON.stringify(data, null, 2));
        console.log("Successfully saved mapped data to /public/api/gunvan.json");

    } catch (error) {
        console.error("Scraper Error:", error);
        process.exit(1); 
    } finally {
        await browser.close();
    }
}

fetchGunVanLocation();