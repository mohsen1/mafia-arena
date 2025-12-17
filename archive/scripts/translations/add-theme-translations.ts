#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';

// New themes to add
const newThemes = {
  "ANTARCTICA_1911": {
    "name": "Antarctic Expedition 1911",
    "description": "Scott's doomed expedition to the South Pole, where the harsh elements and dwindling supplies breed suspicion and desperation."
  },
  "DISCO_ERA_NYC": {
    "name": "Studio 54 NYC 1977",
    "description": "The legendary Studio 54 nightclub at its peak, where celebrities, artists, and imposters dance while danger lurks in the VIP rooms."
  },
  "BYZANTINE_COURT": {
    "name": "Byzantine Palace 1050",
    "description": "The opulent court of Constantinople, where Byzantine politics means poison in wine cups and daggers behind silk curtains."
  },
  "GOLD_RUSH_CALIFORNIA": {
    "name": "California Gold Rush 1849",
    "description": "A lawless mining camp in the Sierra Nevada, where prospectors guard their claims and trust is worth less than gold dust."
  },
  "LUNAR_MINING_COLONY": {
    "name": "Lunar Mining Base 2175",
    "description": "A corporate mining facility on the dark side of the moon, where equipment failures might not be accidents and Earth is very far away."
  },
  "RENAISSANCE_FLORENCE": {
    "name": "Renaissance Florence 1495",
    "description": "The height of the Italian Renaissance, where rival families commission art by day and assassination by night."
  },
  "SUBMARINE_DEPTHS": {
    "name": "Nuclear Submarine",
    "description": "A nuclear submarine on silent patrol in hostile waters, where claustrophobia meets paranoia 300 meters below the surface."
  },
  "PROHIBITION_SPEAKEASY": {
    "name": "Underground Speakeasy 1925",
    "description": "A hidden jazz club during Prohibition, where bootleggers, flappers, and federal agents mingle while death lurks in bathtub gin."
  },
  "AZTEC_EMPIRE": {
    "name": "Tenochtitlan 1519",
    "description": "The Aztec capital on the eve of conquest, where priests perform rituals and conspirators plot in the shadow of the pyramids."
  },
  "ARCTIC_WHALING_SHIP": {
    "name": "Arctic Whaler 1845",
    "description": "A whaling ship trapped in Arctic ice, where months of darkness and dwindling supplies turn crew members against each other."
  },
  "BELLE_EPOQUE_PARIS": {
    "name": "Paris Opera House 1896",
    "description": "The glamorous Paris Opera during the Belle Époque, where phantom rumors spread and jealousy leads to murder behind the curtains."
  },
  "SILK_ROAD_CARAVAN": {
    "name": "Silk Road Caravan 1260",
    "description": "A merchant caravan crossing the Gobi Desert, where bandits infiltrate the group and water is worth more than silk."
  },
  "ALCATRAZ_PRISON": {
    "name": "Alcatraz Island 1962",
    "description": "The infamous federal prison during an escape attempt, where inmates and guards must determine who can be trusted in the chaos."
  },
  "REVOLUTIONARY_PARIS": {
    "name": "Paris 1793",
    "description": "The height of the French Revolution's Terror, where yesterday's ally is today's enemy and the guillotine waits for all."
  },
  "MONGOL_HORDE": {
    "name": "Mongol War Camp 1241",
    "description": "A Mongol military camp preparing to invade Europe, where Khan's generals scheme for power and spies hide among warriors."
  },
  "WOODSTOCK_FESTIVAL": {
    "name": "Woodstock 1969",
    "description": "The legendary music festival, where peace and love meet paranoia as mysterious deaths occur and not everyone is who they seem."
  },
  "HIMALAYAN_MONASTERY": {
    "name": "Tibetan Monastery 1938",
    "description": "An isolated monastery high in the Himalayas, where ancient secrets attract dangerous visitors and trust is tested by altitude."
  },
  "DUST_BOWL_FARM": {
    "name": "Oklahoma Dust Bowl 1935",
    "description": "A struggling farm during the Great Depression, where desperate times lead to desperate measures and neighbors turn on each other."
  },
  "SALEM_WITCH_MUSEUM": {
    "name": "Witch Museum Overnight",
    "description": "Modern-day museum staff locked in overnight, where Salem's dark history seems to repeat itself and exhibits come alive."
  },
  "AMAZON_EXPEDITION": {
    "name": "Amazon Expedition 1925",
    "description": "A scientific expedition deep in the Amazon rainforest, where the jungle hides ancient curses and team members vanish one by one."
  }
};

const dictionariesDir = path.join(process.cwd(), 'src', 'dictionaries');

// Get all language files except English (which already has the translations)
const languageFiles = fs.readdirSync(dictionariesDir)
  .filter(file => file.endsWith('.json') && file !== 'en.json');

console.log(`Found ${languageFiles.length} language files to update`);

// Process each language file
for (const file of languageFiles) {
  const filePath = path.join(dictionariesDir, file);
  const lang = file.replace('.json', '');
  
  console.log(`\nProcessing ${file}...`);
  
  try {
    // Read the file
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Check if themes section exists
    if (!data.themes) {
      console.log(`  Warning: No themes section found in ${file}`);
      continue;
    }
    
    // Check if themes is a string (just the translation of "themes")
    if (typeof data.themes === 'string') {
      console.log(`  Converting themes from string to object...`);
      // Convert to object with all themes
      data.themes = {};
      for (const [key, theme] of Object.entries(newThemes)) {
        data.themes[key] = {
          name: theme.name,
          description: theme.description
        };
      }
    } else {
      // Add new themes to existing object
      let addedCount = 0;
      for (const [key, theme] of Object.entries(newThemes)) {
        if (!data.themes[key]) {
          data.themes[key] = {
            name: theme.name,
            description: theme.description
          };
          addedCount++;
        }
      }
      
      if (addedCount === 0) {
        console.log(`  ℹ️  All themes already present`);
        continue;
      }
    }
    
    // Write the updated content back
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`  ✅ Added ${Object.keys(newThemes).length} themes`);
    
  } catch (error) {
    console.error(`  ❌ Error processing ${file}:`, error);
  }
}

console.log('\nDone!'); 