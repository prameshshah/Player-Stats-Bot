const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse');
const FuzzySearch = require('fuzzy-search');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Function to parse CSV files
async function parseCSV(filePath) {
    try {
        let fileContent = fs.readFileSync(filePath, 'utf-8');
        if (fileContent.startsWith('\ufeff')) {
            fileContent = fileContent.slice(1);
        }
        return new Promise((resolve, reject) => {
            parse(fileContent, { columns: true, skip_empty_lines: true, trim: true }, (err, records) => {
                if (err) reject(err);
                else resolve(records);
            });
        });
    } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return [];
    }
}

// Load and merge player data from multiple CSV files
async function loadPlayerData() {
    const dataDir = path.join(__dirname, 'data');
    const files = [
        'Power 5 Offense Grades.csv',
        'Power 5 Defense Grades.csv',
        'Power 5 ST Grades.csv',
        'pff-data.csv',
        'Group 5 Offense Grades.csv',
        'Group 5 Defense Grades.csv',
        'Group 5 ST Grades.csv'
    ];
    const playerMap = new Map();

    for (const file of files) {
        const filePath = path.join(dataDir, file);
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${file}`);
            continue;
        }
        try {
            const records = await parseCSV(filePath);
            for (const record of records) {
                const playerName = record.Name?.toLowerCase();
                if (!playerName) continue;
                if (!playerMap.has(playerName)) {
                    playerMap.set(playerName, { Name: record.Name, Team: record.Team || 'N/A' });
                }
                Object.assign(playerMap.get(playerName), record);
            }
        } catch (err) {
            console.error(`Error parsing ${file}:`, err);
        }
    }
    return Array.from(playerMap.values());
}

// Global variable to store player data
let playerData = [];

// Start server after loading player data
async function startServer() {
    try {
        playerData = await loadPlayerData();
        console.log(`Loaded ${playerData.length} unique players from CSV files`);

        const searcher = new FuzzySearch(playerData, ['Name'], { caseSensitive: false, sort: true });

        app.post('/api/chat', (req, res) => {
            const userMessage = req.body.message?.toLowerCase().trim();
            if (!userMessage) {
                return res.status(400).json({ response: 'Please provide a player name.' });
            }

            const words = userMessage.split(' ');
            const searchTerm = words[0]; // Extract player name
            const keywords = words.slice(1); // Extract filters

            const foundPlayers = searcher.search(searchTerm);

            if (foundPlayers.length === 0) {
                return res.json({ response: `No players found with the name "${searchTerm}". Try another name!` });
            }

            let response = '';
            const showAll = keywords.length === 0 || keywords.includes('all');

            // Filtering categories
            const offensePlayers = foundPlayers.filter(p => p['OFF GRD']);
            const defensePlayers = foundPlayers.filter(p => p['DEF GRD']);
            const specialTeamsPlayers = foundPlayers.filter(p => p['ST GRD']);
            const penaltyPlayers = foundPlayers.filter(p => p['PEN']);

            const showOffense = showAll || keywords.some(k => k.includes('offense'));
            const showDefense = showAll || keywords.some(k => k.includes('defense'));
            const showSpecial = showAll || keywords.some(k => k.includes('special'));
            const showPenalties = showAll || keywords.some(k => k.includes('penalties'));

            function formatPlayerData(players, type) {
                if (players.length === 0) return '';
                let section = `\n\n${type} Players (${players.length}):`;
                for (const player of players) {
                    section += `\n- ${player.Name} (${player.Team}, #${player['#'] || 'N/A'}, ${player.POS || 'N/A'}):`;
                    section += `\n  Overall Grade: ${player[`${type.toUpperCase()} GRD`]}`;
                    Object.keys(player).forEach((key) => {
                        if (!['Name', 'Team', '#', 'POS', `${type.toUpperCase()} GRD`].includes(key) && player[key]) {
                            section += `\n  ${key}: ${player[key]}`;
                        }
                    });
                }
                return section;
            }

            if (showOffense) response += formatPlayerData(offensePlayers, 'OFF');
            if (showDefense) response += formatPlayerData(defensePlayers, 'DEF');
            if (showSpecial) response += formatPlayerData(specialTeamsPlayers, 'ST');
            if (showPenalties) response += formatPlayerData(penaltyPlayers, 'PEN');

            if (!response) {
                response = "No players found in the specified category. Please specify offense, defense, special teams, or penalties.";
            }

            res.json({ response });
        });

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
