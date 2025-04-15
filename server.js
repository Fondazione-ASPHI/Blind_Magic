const https = require('https');
const fs = require('fs');
const express = require('express');
const path = require('path');
const JSONStream = require('JSONStream');
const { debug } = require('console');
const stringSimilarity = require('string-similarity');

const app = express();
const PORT = 3000;

// Load SSL certificate and key
const options = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
};

// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// Load the JSON file into memory as dictionaries by language
let cardDictionariesByLanguage = {}; // Separate dictionaries for each language
let printedNamesByLanguage = {}; // Separate lists of printed names for each language

function loadCards() {
    const filePath = path.join(__dirname, 'database', 'all_cards.json');
    try {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        const parser = JSONStream.parse('*'); // Parse each object in the array
        stream.pipe(parser);

        parser.on('data', (card) => {
            if ((card.printed_name || card.name) && card.lang) {
                const language = card.lang;

                // Initialize the dictionary and list for the language if not already created
                if (!cardDictionariesByLanguage[language]) {
                    cardDictionariesByLanguage[language] = {};
                    printedNamesByLanguage[language] = [];
                }

                // Use `printed_name` if available, otherwise fallback to `name`
                const cardNameKey = (card.printed_name || card.name).toLowerCase();

                // Add the card to the language-specific dictionary
                if (!cardDictionariesByLanguage[language][cardNameKey]) {
                    cardDictionariesByLanguage[language][cardNameKey] = [];
                }
                cardDictionariesByLanguage[language][cardNameKey].push(card);

                // Add the printed name (or name) to the language-specific list
                const cardDisplayName = card.printed_name || card.name;
                if (!printedNamesByLanguage[language].includes(cardDisplayName)) {
                    printedNamesByLanguage[language].push(cardDisplayName);
                }
            }
        });

        parser.on('end', () => {
            console.log('Card data loaded successfully.');
        });

        parser.on('error', (error) => {
            console.error('Error parsing card data:', error);
        });
    } catch (error) {
        console.error('Error loading card data:', error);
    }
}

// Endpoint to handle GET requests
app.get('/card', (req, res) => {
    const printedCardName = req.query.printedCardName;
    const language = req.query.language || 'all'; // Default to "all" if no language is provided

    console.log(`Received request for card: ${printedCardName}, language: ${language}`);

    if (!printedCardName) {
        return res.status(400).json({ error: 'Missing "printedCardName" query parameter.' });
    }

    // Decode the card name to handle spaces and special characters
    const decodedCardName = decodeURIComponent(printedCardName).toLowerCase();

    // Step 1: Search in the selected language
    if (language !== 'all') {
        const cards = cardDictionariesByLanguage[language]?.[decodedCardName];
        if (cards) {
            return res.json(cards[0]); // Return the first match
        }

        // Perform a best match search in the selected language
        console.log(`Card "${decodedCardName}" not found in language "${language}". Performing best match search...`);
        const namesToSearch = printedNamesByLanguage[language] || [];
        if (!Array.isArray(namesToSearch)) {
            console.error(`Error: namesToSearch is not an array for language "${language}".`);
            return res.status(500).json({ error: 'Internal server error.' });
        }

        const bestMatch = stringSimilarity.findBestMatch(decodedCardName, namesToSearch);

        if (bestMatch.bestMatch.rating > 0.5) { // Adjust the threshold as needed
            const bestMatchName = bestMatch.bestMatch.target;
            console.log(`Best match found in language "${language}": ${bestMatchName}`);
            const bestMatchCard = cardDictionariesByLanguage[language]?.[bestMatchName.toLowerCase()]?.[0];
            if (bestMatchCard) {
                return res.json(bestMatchCard);
            }
        }
    }

    // Step 2: Fallback to English
    console.log(`Card "${decodedCardName}" not found in language "${language}". Searching in English...`);
    const englishCards = cardDictionariesByLanguage['en']?.[decodedCardName];
    if (englishCards) {
        return res.json(englishCards[0]); // Return the first match in English
    }

    // Perform a best match search in English
    const englishNamesToSearch = printedNamesByLanguage['en'] || [];
    if (!Array.isArray(englishNamesToSearch)) {
        console.error('Error: englishNamesToSearch is not an array.');
        return res.status(500).json({ error: 'Internal server error.' });
    }

    const englishBestMatch = stringSimilarity.findBestMatch(decodedCardName, englishNamesToSearch);

    if (englishBestMatch.bestMatch.rating > 0.5) {
        const bestMatchName = englishBestMatch.bestMatch.target;
        console.log(`Best match found in English: ${bestMatchName}`);
        const bestMatchCard = cardDictionariesByLanguage['en']?.[bestMatchName.toLowerCase()]?.[0];
        if (bestMatchCard) {
            return res.json(bestMatchCard);
        }
    }

    // Step 3: Fallback to all other languages
    console.log(`Card "${decodedCardName}" not found in English. Searching in all other languages...`);
    for (const lang in cardDictionariesByLanguage) {
        if (lang === 'en' || lang === language) continue; // Skip English and the already-searched language
        const cards = cardDictionariesByLanguage[lang]?.[decodedCardName];
        if (cards) {
            return res.json(cards[0]); // Return the first match
        }

        // Perform a best match search in the current language
        const namesToSearch = printedNamesByLanguage[lang] || [];
        if (!Array.isArray(namesToSearch)) {
            console.error(`Error: namesToSearch is not an array for language "${lang}".`);
            continue;
        }

        const bestMatch = stringSimilarity.findBestMatch(decodedCardName, namesToSearch);

        if (bestMatch.bestMatch.rating > 0.5) {
            const bestMatchName = bestMatch.bestMatch.target;
            console.log(`Best match found in language "${lang}": ${bestMatchName}`);
            const bestMatchCard = cardDictionariesByLanguage[lang]?.[bestMatchName.toLowerCase()]?.[0];
            if (bestMatchCard) {
                return res.json(bestMatchCard);
            }
        }
    }

    // Step 4: No match found
    console.log(`Card "${decodedCardName}" not found in any language.`);
    return res.status(404).json({ error: 'Card not found in any language.' });
});

// Start the HTTPS server
https.createServer(options, app).listen(PORT, () => {
    console.log(`Server is running on https://localhost:${PORT}`);
    loadCards(); // Load the card data when the server starts
});