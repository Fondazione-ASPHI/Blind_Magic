# Blind Magic by ASPHI Onlus

The aim of this project is to enable blind or visually impaired people to play Magic TCG by using technologies: a 3D printed support and an AI-powered web app to run on a smarpthone.

Card search relies on Scryfall database (https://scryfall.com/) using the bulk-downloaded data.

The literal and graphical information presented on this project about Magic: The Gathering, including card images and mana symbols, is copyright Wizards of the Coast, LLC. This project is not endorsed by Wizards of the Coast.


## Setup instructions

* print 3D physical support
* download bulk data in database/all_cards.json
* npm install
* node --max-old-space-size=8192 server.js
* on user device, connect to https://localhost:3000/ (replace localhost with the actual address of the server)
* put the device inside the 3D printed support


### Debug tips
https://api.scryfall.com/cards/named?fuzzy=

localhost:3000/card?printedCardName=Trombettiere%20Rombosuono&language=it

## Credits
* Thanks to Scryfall for providing the cards database
