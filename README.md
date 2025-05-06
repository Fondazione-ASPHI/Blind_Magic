# Blind Magic by ASPHI Onlus

The aim of this project is to enable blind or visually impaired people to play Magic TCG by using technologies: a 3D printed support and an AI-powered web app to run on a smarpthone.

Card search relies on Scryfall database (https://scryfall.com/) using the bulk-downloaded data.

The literal and graphical information presented on this project about Magic: The Gathering, including card images and mana symbols, is copyright Wizards of the Coast, LLC. This project is not endorsed by Wizards of the Coast.

## Quick setup
* print the 3D support (you can find it in the latest releases: https://github.com/Fondazione-ASPHI/Blind_Magic/releases)
* open the web app: -public link will appear here-
* insert your Endpoint and Apikey for OCR
* put the phone face up on the base of the 3D support
* press START button on the web app
* place the card face down on the upper part of the 3D support 

## Instructions for developers

* print 3D physical support
* download Scryfall bulk data in database/all_cards.json
* npm install
* generate https certificate: openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365
* node --max-old-space-size=8192 server.js
* on user device, connect to https://localhost:3000/ (replace localhost with the actual address of the server)
* put the device inside the 3D printed support
* if using self-signed certificate for local testing, on mobile browsers, try to disable security restrictions, otherwise the browser app won't allow you to open the camera
* a clean solution if owner of a public domain is to use software like nginx to manage HTTPS, in that case, the server.js must be reconfigured to run on HTTP (instead of HTTPS).


### Debug tips
https://api.scryfall.com/cards/named?fuzzy=

localhost:3000/card?printedCardName=Trombettiere%20Rombosuono&language=it

## Credits
* Thanks to Scryfall for providing the cards database
