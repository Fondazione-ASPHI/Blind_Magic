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

// Parse JSON bodies
app.use(express.json());

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

// Endpoint to handle POST requests with deck list
app.post('/card', (req, res) => {
    const { printedCardName, deckList, language } = req.body;
    const lang = language || 'all';
    if (!printedCardName) {
        return res.status(400).json({ error: 'Missing "printedCardName" in request body.' });
    }
    const decodedCardName = printedCardName.toLowerCase();

    // If deckList is provided and non-empty, restrict best match to deckList
    if (Array.isArray(deckList) && deckList.length > 0) {
        console.log(`POST /card: deckList provided (${deckList.length} items).`);
        // Use the deckList as the search pool (case-insensitive match)
        const deckListNormalized = deckList.map(x => x.trim()).filter(Boolean);
        const bestMatch = stringSimilarity.findBestMatch(decodedCardName, deckListNormalized);
        console.log(`POST /card: Best match in deckList for '${decodedCardName}' is '${bestMatch.bestMatch.target}' (rating: ${bestMatch.bestMatch.rating})`);
        const bestDeckName = bestMatch.bestMatch.target;
        let foundCard = null;
        // Try in selected language first
        if (lang !== 'all') {
            foundCard = cardDictionariesByLanguage[lang]?.[bestDeckName.toLowerCase()]?.[0];
            if (foundCard) console.log(`POST /card: Found card in language '${lang}': ${bestDeckName}`);
        }
        // Fallback to English
        if (!foundCard) {
            foundCard = cardDictionariesByLanguage['en']?.[bestDeckName.toLowerCase()]?.[0];
            if (foundCard) console.log(`POST /card: Found card in English: ${bestDeckName}`);
        }
        // Fallback to any language
        if (!foundCard) {
            for (const l in cardDictionariesByLanguage) {
                if (l === lang || l === 'en') continue;
                foundCard = cardDictionariesByLanguage[l]?.[bestDeckName.toLowerCase()]?.[0];
                if (foundCard) {
                    console.log(`POST /card: Found card in language '${l}': ${bestDeckName}`);
                    break;
                }
            }
        }
        if (foundCard) {
            return res.json(foundCard);
        } else {
            console.log(`POST /card: Card '${bestDeckName}' not found in any language.`);
            return res.status(404).json({ object: 'error', error: `Card '${bestDeckName}' not found in database.` });
        }
    }
    // Fallback to GET logic if no deckList
    // Step 1: Search in the selected language
    if (lang !== 'all') {
        const cards = cardDictionariesByLanguage[lang]?.[decodedCardName];
        if (cards) {
            console.log(`POST /card: Found exact match in language '${lang}': ${decodedCardName}`);
            return res.json(cards[0]);
        }
        // Best match in selected language
        const namesToSearch = printedNamesByLanguage[lang] || [];
        const bestMatch = stringSimilarity.findBestMatch(decodedCardName, namesToSearch);
        console.log(`POST /card: Best match in language '${lang}' for '${decodedCardName}' is '${bestMatch.bestMatch.target}' (rating: ${bestMatch.bestMatch.rating})`);
        if (bestMatch.bestMatch.rating > 0.5) {
            const bestMatchName = bestMatch.bestMatch.target;
            const bestMatchCard = cardDictionariesByLanguage[lang]?.[bestMatchName.toLowerCase()]?.[0];
            if (bestMatchCard) {
                console.log(`POST /card: Found best match card in language '${lang}': ${bestMatchName}`);
                return res.json(bestMatchCard);
            }
        }
    }
    // Step 2: Fallback to English
    const englishCards = cardDictionariesByLanguage['en']?.[decodedCardName];
    if (englishCards) {
        console.log(`POST /card: Found exact match in English: ${decodedCardName}`);
        return res.json(englishCards[0]);
    }
    const englishNamesToSearch = printedNamesByLanguage['en'] || [];
    const englishBestMatch = stringSimilarity.findBestMatch(decodedCardName, englishNamesToSearch);
    console.log(`POST /card: Best match in English for '${decodedCardName}' is '${englishBestMatch.bestMatch.target}' (rating: ${englishBestMatch.bestMatch.rating})`);
    if (englishBestMatch.bestMatch.rating > 0.5) {
        const bestMatchName = englishBestMatch.bestMatch.target;
        const bestMatchCard = cardDictionariesByLanguage['en']?.[bestMatchName.toLowerCase()]?.[0];
        if (bestMatchCard) {
            console.log(`POST /card: Found best match card in English: ${bestMatchName}`);
            return res.json(bestMatchCard);
        }
    }
    // Step 3: Fallback to all other languages
    for (const l in cardDictionariesByLanguage) {
        if (l === 'en' || l === lang) continue;
        const cards = cardDictionariesByLanguage[l]?.[decodedCardName];
        if (cards) {
            console.log(`POST /card: Found exact match in language '${l}': ${decodedCardName}`);
            return res.json(cards[0]);
        }
        const namesToSearch = printedNamesByLanguage[l] || [];
        const bestMatch = stringSimilarity.findBestMatch(decodedCardName, namesToSearch);
        console.log(`POST /card: Best match in language '${l}' for '${decodedCardName}' is '${bestMatch.bestMatch.target}' (rating: ${bestMatch.bestMatch.rating})`);
        if (bestMatch.bestMatch.rating > 0.5) {
            const bestMatchName = bestMatch.bestMatch.target;
            const bestMatchCard = cardDictionariesByLanguage[l]?.[bestMatchName.toLowerCase()]?.[0];
            if (bestMatchCard) {
                console.log(`POST /card: Found best match card in language '${l}': ${bestMatchName}`);
                return res.json(bestMatchCard);
            }
        }
    }
    // Step 4: No match found
    console.log(`POST /card: Card '${decodedCardName}' not found in any language.`);
    return res.status(404).json({ object: 'error', error: 'Card not found in any language.' });
});

// Start the HTTPS server
https.createServer(options, app).listen(PORT, () => {
    console.log(`Server is running on https://localhost:${PORT}`);
    loadCards(); // Load the card data when the server starts
});