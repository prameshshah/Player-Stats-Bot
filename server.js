


const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse');
const FuzzySearch = require('fuzzy-search');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

async function parseCSV(filePath) {
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
}

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
                    playerMap.set(playerName, { Name: record.Name });
                }
                Object.assign(playerMap.get(playerName), record);
            }
        } catch (err) {
            console.error(`Error parsing ${file}:`, err);
        }
    }
    return Array.from(playerMap.values());
}

let playerData = [];

async function startServer() {
    try {
        playerData = await loadPlayerData();
        const searcher = new FuzzySearch(playerData, ['Name'], { caseSensitive: false, sort: true });
        console.log(`Loaded ${playerData.length} unique players from CSV files`);

        app.post('/api/chat', (req, res) => {
            const userMessage = req.body.message?.toLowerCase().trim() || '';
            if (!userMessage) {
                return res.status(400).json({ response: 'Please provide a player name.' });
            }

            // Split the message into words
            const words = userMessage.split(' ');
            const searchTerm = words[0]; // First word is the name to search
            const keywords = words.slice(1); // Remaining words are keywords

            // Search for players where the name contains the search term anywhere
            const foundPlayers = playerData.filter(player =>
                player.Name.toLowerCase().includes(searchTerm)
            );

            if (foundPlayers.length === 0) {
                return res.json({ response: `I couldn't find any players with "${searchTerm}" in their name. Try another name!` });
            }

            let response = '';
            const showAll = keywords.length === 0 || keywords.includes('all');

            // Group players by category
            const offensePlayers = foundPlayers.filter(p => p['OFF GRD']);
            const defensePlayers = foundPlayers.filter(p => p['DEF GRD']);
            const specialTeamsPlayers = foundPlayers.filter(p => p['ST GRD']);
            const penaltyPlayers = foundPlayers.filter(p => p['PEN']);

            // Determine which categories to show based on keywords
            const showOffense = showAll || keywords.some(k => k.includes('offense'));
            const showDefense = showAll || keywords.some(k => k.includes('defense'));
            const showSpecial = showAll || keywords.some(k => k.includes('special'));
            const showPenalties = showAll || keywords.some(k => k.includes('penalties'));

            // Offense Section
            if (showOffense && offensePlayers.length > 0) {
                response += `\nOffense Players (${offensePlayers.length}):`;
                for (const player of offensePlayers) {
                    response += `\n- ${player.Name} (${player.Team || 'N/A'}, #${player['#'] || 'N/A'}, ${player.POS || 'N/A'}):`;
                    response += `\n  Overall Grade: ${player['OFF GRD']}`;
                    if (player['OFF']) response += `\n  Snaps: ${player['OFF']} (${player['OFF%'] || 'N/A'}%)`;
                    if (player['Run']) response += `\n  Run: ${player['Run']}`;
                    if (player['Pass']) response += `\n  Pass: ${player['Pass']}`;
                    if (player['RBLK']) response += `\n  Run Block: ${player['RBLK']}`;
                    if (player['PBLK']) response += `\n  Pass Block: ${player['PBLK']}`;
                    if (player['PASS GRD']) response += `\n  Pass Grade: ${player['PASS GRD']}`;
                    if (player['REC GRD']) response += `\n  Receiving Grade: ${player['REC GRD']}`;
                    if (player['RUSH GRD']) response += `\n  Rushing Grade: ${player['RUSH GRD']}`;
                    if (player['PBLK GRD']) response += `\n  Pass Block Grade: ${player['PBLK GRD']}`;
                    if (player['RBLK GRD']) response += `\n  Run Block Grade: ${player['RBLK GRD']}`;
                }
            }

            // Defense Section
            if (showDefense && defensePlayers.length > 0) {
                response += `\n\nDefense Players (${defensePlayers.length}):`;
                for (const player of defensePlayers) {
                    response += `\n- ${player.Name} (${player.Team || 'N/A'}, #${player['#'] || 'N/A'}, ${player.POS || 'N/A'}):`;
                    response += `\n  Overall Grade: ${player['DEF GRD']}`;
                    if (player['DEF']) response += `\n  Snaps: ${player['DEF']} (${player['DEF%'] || 'N/A'}%)`;
                    if (player['RUND']) response += `\n  Run Defense: ${player['RUND']}`;
                    if (player['PRSH']) response += `\n  Pass Rush: ${player['PRSH']}`;
                    if (player['COV']) response += `\n  Coverage: ${player['COV']}`;
                    if (player['RUND GRD']) response += `\n  Run Defense Grade: ${player['RUND GRD']}`;
                    if (player['PRSH GRD']) response += `\n  Pass Rush Grade: ${player['PRSH GRD']}`;
                    if (player['COV GRD']) response += `\n  Coverage Grade: ${player['COV GRD'] || player['COV']}`;
                    if (player['TKL']) response += `\n  Tackles: ${player['TKL']}`;
                    if (player['AST']) response += `\n  Assists: ${player['AST']}`;
                    if (player['MT']) response += `\n  Missed Tackles: ${player['MT']}`;
                    if (player['STOP']) response += `\n  Stops: ${player['STOP']}`;
                }
            }

            // Special Teams Section
            if (showSpecial && specialTeamsPlayers.length > 0) {
                response += `\n\nSpecial Teams Players (${specialTeamsPlayers.length}):`;
                for (const player of specialTeamsPlayers) {
                    response += `\n- ${player.Name} (${player.Team || 'N/A'}, #${player['#'] || 'N/A'}, ${player.POS || 'N/A'}):`;
                    response += `\n  Overall Grade: ${player['ST GRD']}`;
                    if (player['ST']) response += `\n  Snaps: ${player['ST']}`;
                    if (player['KRET']) response += `\n  Kick Return: ${player['KRET']}`;
                    if (player['KCOV']) response += `\n  Kick Coverage: ${player['KCOV']}`;
                    if (player['PRET']) response += `\n  Punt Return: ${player['PRET']}`;
                    if (player['PCOV']) response += `\n  Punt Coverage: ${player['PCOV']}`;
                    if (player['FGBLK']) response += `\n  FG Block: ${player['FGBLK']}`;
                    if (player['FGXP']) response += `\n  FG Extra Point: ${player['FGXP']}`;
                    if (player['KOFF GRD']) response += `\n  Kickoff Grade: ${player['KOFF GRD']}`;
                    if (player['PUNT GRD']) response += `\n  Punt Grade: ${player['PUNT GRD']}`;
                }
            }

            // Penalties Section
            if (showPenalties && penaltyPlayers.length > 0) {
                response += `\n\nPlayers with Penalties (${penaltyPlayers.length}):`;
                for (const player of penaltyPlayers) {
                    response += `\n- ${player.Name} (${player.Team || 'N/A'}, #${player['#'] || 'N/A'}, ${player.POS || 'N/A'}):`;
                    response += `\n  Penalties: ${player['PEN']}`;
                }
            }

            // If no categories match the filters, adjust the response
            if (!showOffense && !showDefense && !showSpecial && !showPenalties) {
                response += "\nPlease specify a valid category (offense, defense, special, penalties, or all).";
            } else if (
                (!showOffense || offensePlayers.length === 0) &&
                (!showDefense || defensePlayers.length === 0) &&
                (!showSpecial || specialTeamsPlayers.length === 0) &&
                (!showPenalties || penaltyPlayers.length === 0)
            ) {
                response += "\nNo players found in the specified category.";
            }

            res.json({ response });
        });

        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();