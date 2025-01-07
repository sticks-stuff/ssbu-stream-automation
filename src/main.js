import http from "http";
import fs from "fs";
import net from "net";
import { default as OBSWebSocket } from "obs-websocket-js";
const obs = new OBSWebSocket();
import url from "url";
import axios from "axios";
import WebSocket from "ws";
import { fileURLToPath } from 'url';
import path from 'path';
import {serializeError, deserializeError} from 'serialize-error';
import readline from 'readline';
import { setTimeout } from "timers/promises";
import { RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { ChatClient } from '@twurple/chat';
import { Webhook } from 'discord-webhook-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wss = new WebSocket.Server({ port: 9310 });

var webSocketInfo = {}
webSocketInfo.switchConnected = -1;
webSocketInfo.switchError = "";
webSocketInfo.switchInfo = {};
webSocketInfo.obsConnected = -1;
webSocketInfo.tshConnected = -1;
webSocketInfo.tshError = "";
webSocketInfo.tshInfo = {};
webSocketInfo.twitchConnected = -1;

var CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config.json'), 'utf8'));
var tags = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'tags.json'), 'utf8'));
var characters = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'characters.json'), 'utf8'));

let webhook = null;
if (CONFIG.DISCORD_WEBHOOK_URL != "") {
	webhook = new Webhook(CONFIG.DISCORD_WEBHOOK_URL);
}

wss.on('connection', function connection(ws) {
	ws.on('error', console.error);
	
	ws.on('message', function message(data) {
		try {
			const messageObj = JSON.parse(data);
			let response;
			switch (messageObj.command) {
				case 'set_env':
					try {
						const jsonData = JSON.parse(messageObj.env);
						CONFIG = jsonData;
						fs.writeFileSync(path.resolve(__dirname, '../config.json'), JSON.stringify(jsonData, null, "\t"), 'utf8');
						response = { status: 'success', message: 'config.json written successfully' };
					} catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'set_tags':
					try {
						console.log(messageObj)
						const jsonData = JSON.parse(messageObj.tags);
						tags = jsonData;
						fs.writeFileSync(path.resolve(__dirname, './tags.json'), JSON.stringify(jsonData, null, "\t"), 'utf8');
						response = { status: 'success', message: 'tags.json written successfully' };
					} catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'connectToOBS':
					try {
						connectToOBS();
						response = { status: 'success', message: 'received connectToOBS' };
						webSocketInfo.obsError = "";
					}
					catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'connectToSwitch':
					try {
						connectToSwitch();
						webSocketInfo.switchError = "";
						response = { status: 'success', message: 'received connectToSwitch' };
					}
					catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'connectToTSH':
					try {
						connectToTSH();
						webSocketInfo.tshError = "";
						response = { status: 'success', message: 'received connectToTSH' };
					}
					catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'disconnectFromTSH':
                    try {
                        disconnectFromTSH();
                        response = { status: 'success', message: 'Disconnected from TSH' };
                    } catch (e) {
                        response = { status: 'error', message: serializeError(e) };
                    }
                    break;

                case 'disconnectFromOBS':
                    try {
                        disconnectFromOBS();
                        response = { status: 'success', message: 'Disconnected from OBS' };
                    } catch (e) {
                        response = { status: 'error', message: serializeError(e) };
                    }
                    break;

                case 'clearSwitchCache':
                    try {
                        clearSwitchCache();
                        response = { status: 'success', message: 'clearSwitchCache' };
                    } catch (e) {
                        response = { status: 'error', message: serializeError(e) };
                    }
                    break;
				case 'swapCams':
					try {
						swapCams();
						response = { status: 'success', message: 'received swapCams' };
					}
					catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'twitch_code':
					try {
						connectToTwitch(messageObj.code);
					} catch (e) {
						response = { status: 'error', message: serializeError(e) };
					}
					break;
				case 'heartbeat':
					response = { status: 'success', message: 'heartbeat' };
					break;
				default:
					console.error('Unknown command:', messageObj.command);
					response = { status: 'error', message: 'Unknown command' };
			}
			ws.send(JSON.stringify(response));
		} catch (err) {
			console.error('Invalid message received:', err);
			ws.send(JSON.stringify({ status: 'error', message: 'Invalid message received' }));
		}
	});
	
	ws.send(JSON.stringify({ status: 'update', message: webSocketInfo }));
});

function updateGUI() {
	// console.log(webSocketInfo)
	wss.clients.forEach((ws) => {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ status: 'update', message: webSocketInfo }));
		}
	});
}


function loadJsonFromUrl(url) {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			let data = '';

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				try {
					const jsonData = JSON.parse(data);
					resolve(jsonData);
				} catch (error) {
					reject(error);
				}
			});
		}).on('error', (error) => {
			reject(error);
		});
	});
}

function makeHttpRequest(url) {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			if (res.statusCode !== 200) {
				reject(new Error(`HTTP error: ${res.statusCode}`));
				return;
			}

			let data = '';

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				resolve(data);
			});
		}).on('error', (error) => {
			reject(error);
		});
	});
}

var p1;
var p2;

let currentSet = null;
let oldSet = null;

const PORT_COLORS = [
	'fe3636',
	'2e89ff',
	'ffbb10',
	'28b448',
	'f98636',
	'2cd2ea',
	'ff9bb4',
	'9570ff'
]

async function tshLoadSet(info) {
	console.log(`Called tshLoadSet at ${new Date()}\n`);
	let program_state = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/program-state');
	if(program_state.score[1].match == "Grand Final Reset") {
		console.log("It's grands reset, no need to ever load another set")
		return;
	}

	var players = JSON.parse(JSON.stringify(info.players));
	// console.log(tags)
	// for (let index = 0; index < players; index++) {
	// 	for (const [key, tagList] of Object.entries(tags)) {
	// 		console.log(key)
	// 		if (tagList.includes(players[i].name)) {
	// 			players[i].startggname = key.toLowerCase();
	// 		}
	// 	}
	// }

	for (let player of players) {
		for (let tagInfo of tags) {
			if (tagInfo.tags.includes(player.name)) {
				// matchedTag = tag;
				player.startggname = tagInfo.sggname.toLowerCase();
				break;
			}
		}
	}

	const setData = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/get-sets');
	// const setData = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/get-sets?getFinished');
	var foundSet = false;

	for (const set of setData) {
		var editedSet = JSON.parse(JSON.stringify(set));
		editedSet.p1_name = set.p1_name.toLowerCase();
		editedSet.p2_name = set.p2_name.toLowerCase();

		if (editedSet.p1_name.includes(' | ')) {
			editedSet.p1_name = editedSet.p1_name.split(' | ')[1];
		}

		if (editedSet.p2_name.includes(' | ')) {
			editedSet.p2_name = editedSet.p2_name.split(' | ')[1];
		}

		let p1found = false;
		let p2found = false;

		for (let i = 0; i < players.length; i++) {
			const player = players[i];

			if (!player.name) {
				continue;
			}

			player.uneditedName = player.uneditedName || player.name; // hack hack hack all day

			player.name = player.name.toLowerCase();

			if ((player.startggname === editedSet.p1_name || player.name === editedSet.p1_name) && player.character != 0) {
				p1found = i;
			}

			if ((player.startggname === editedSet.p2_name || player.name === editedSet.p2_name) && player.character != 0) {
				p2found = i;
			}
		}

		// console.log({ p1found })
		// console.log({ p2found })

		if (p1found !== false && p2found !== false) {
			currentSet = set;
			foundSet = true;
			await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-set?set=${set.id}&no-mains`);
			console.log(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-set?set=${set.id}&no-mains`)
			var isSwapped = await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-get-swap');
			// console.log(isSwapped)
			if (p1found > p2found) {
				p1 = players[p1found].name
				console.log({ p2 })
				p2 = players[p2found].name
				console.log({ p1 })
				if (isSwapped == "False") {
					await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-swap-teams');
				}
				await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-team0-color-${PORT_COLORS[p1found]}`);
				await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-team1-color-${PORT_COLORS[p2found]}`);
			} else {
				p1 = players[p2found].name
				console.log({ p1 })
				p2 = players[p1found].name
				console.log({ p2 })
				if (isSwapped == "True") {
					await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-swap-teams');
				}
				await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-team1-color-${PORT_COLORS[p1found]}`);
				await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-team0-color-${PORT_COLORS[p2found]}`);
			}
			let match_info = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/get-match-' + set.id);
			console.log(match_info.top_n)
			if(match_info.top_n <= CONFIG.TOP_N_BO5) {
				console.log("bo5")
				await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-set?best-of=5');
			} else {
				console.log("bo3")
				await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-set?best-of=3');
			}
			break;
		}
	}

	if(foundSet == false && CONFIG.LOAD_PLAYERS_IF_NO_SET) {
		console.log("Could not find a set between two players!")
		await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-clear-all`);
		var isSwapped = await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-get-swap');
		if (isSwapped == "True") {
			await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-swap-teams');
		}
		// await setTimeout(1000);
		let p1found = false;
		let p2found = false;
		// 
		for (let i = 0; i < players.length; i++) {
			const player = players[i];
	
			if (!player.name) {
				continue;
			}

			console.log("player " + i + " is " + player.name)
	
			let data = {
				"gamerTag": player.uneditedName
			};
	
			if(p1found == false) {
				let response;
				p1found = true;
				p2 = player.name;
				if(player.startggname != null) {
					response = await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-player-from-tag-1-0?tag=${player.startggname}&no-mains`);
				} else {
					response = await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-player-from-tag-1-0?tag=${player.name}&no-mains`);
				}
				if(response == "ERROR") {
					console.log("Could not find an entry in the database for " + (player.startggname ? player.startggname : player.name) + ". We are loading their direct tag (" + player.name + ") as P1 instead.");
					await axios.post('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-update-team-1-0', data);
					player.nameInDB = false;
				}
				await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-team1-color-${PORT_COLORS[i]}`);
			} else {
				let response;
				p2found = true
				p1 = player.name;
				if(player.startggname != null) {
					response = await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-player-from-tag-0-0?tag=${player.startggname}&no-mains`);
				} else {
					response = await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-player-from-tag-0-0?tag=${player.name}&no-mains`);
				}
				if(response == "ERROR" && CONFIG.LOAD_TAG_IF_NO_DB) {
					console.log("Could not find an entry in the database for " + (player.startggname ? player.startggname : player.name) + ". We are loading their direct tag (" + player.name + ") as P2 instead.");
					await axios.post('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-update-team-0-0', data);
					player.nameInDB = false;
				}
				await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-team0-color-${PORT_COLORS[i]}`);
			}
		}
	}

	updateChars(players);

	webSocketInfo.tshInfo.players = players;
	webSocketInfo.tshInfo.foundSet = foundSet;
	updateGUI();
}

var overlayId;

let timestampsFileName;
let CAM_LEFT_P1;
let CAM_LEFT_P2;
let CAM_RIGHT_P1;
let CAM_RIGHT_P2;

let isStreaming = false;

async function connectToOBS() {
    try {
        await obs.connect(`ws://${CONFIG.OBS_IP}:${CONFIG.OBS_PORT}`, CONFIG.OBS_PASSWORD);
		await obs.call('GetSceneItemId', {
			'sceneName': CONFIG.GAME_SCENE,
			'sourceName': CONFIG.OVERLAY_NAME,
		}).then((response) => {
			overlayId = response.sceneItemId;
		})
		
		let response = await obs.call('GetSceneItemList', {
			'sceneName': CONFIG.CAM_LEFT_SCENE
		})
		response.sceneItems.forEach(item => {
			// console.log({item})
			if(item.sourceName == CONFIG.CAM_P1_SCENE) {
				CAM_LEFT_P1 = item.sceneItemId;
			}
			if(item.sourceName == CONFIG.CAM_P2_SCENE) {
				CAM_LEFT_P2 = item.sceneItemId;
			}
		});
		response = await obs.call('GetSceneItemList', {
			'sceneName': CONFIG.CAM_RIGHT_SCENE
		})
		response.sceneItems.forEach(item => {
			if(item.sourceName == CONFIG.CAM_P1_SCENE) {
				CAM_RIGHT_P1 = item.sceneItemId;
			}
			if(item.sourceName == CONFIG.CAM_P2_SCENE) {
				CAM_RIGHT_P2 = item.sceneItemId;
			}
		});

		await obs.call('GetStreamStatus').then(async (response) => {
			if (response.outputActive && !isStreaming) {
				isStreaming = true;
				createTimestampsFile();
				if (webSocketInfo.tshConnected == 1 && webSocketInfo.twitchConnected == 1) {
					let settings = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/user_data/settings.json');
					let tournamentUrl = settings.TOURNAMENT_URL;
					sendMessage(`!commands edit !bracket ${tournamentUrl}`);
					createStreametaJson();
				}
			} else if (!response.outputActive && isStreaming) {
				isStreaming = false;
			}
		});

		console.log('Connected to OBS');
		webSocketInfo.obsConnected = 1;
		webSocketInfo.obsError = "";
		updateGUI();
    } catch (error) {
        console.log('Could not connect to OBS' + error);
		webSocketInfo.obsConnected = 0;
		webSocketInfo.obsError = serializeError(error);
		updateGUI();
    }
};

async function disconnectFromOBS() {
	obs.disconnect();
	console.log('Disconnected from OBS');
	webSocketInfo.obsConnected = 0;
	webSocketInfo.obsError = "";
	updateGUI();
}

async function swapCams() {
	try {
		if(webSocketInfo.obsConnected == 1) {
			let response = await obs.call('GetSceneItemEnabled', {
				'sceneName': CONFIG.CAM_RIGHT_SCENE,
				'sceneItemId': CAM_RIGHT_P1
			})
			if(response.sceneItemEnabled) {
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_RIGHT_SCENE,
					'sceneItemId': CAM_RIGHT_P1,
					'sceneItemEnabled': false
				})
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_RIGHT_SCENE,
					'sceneItemId': CAM_RIGHT_P2,
					'sceneItemEnabled': true
				})
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_LEFT_SCENE,
					'sceneItemId': CAM_LEFT_P1,
					'sceneItemEnabled': true
				})
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_LEFT_SCENE,
					'sceneItemId': CAM_LEFT_P2,
					'sceneItemEnabled': false
				})
			} else {
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_RIGHT_SCENE,
					'sceneItemId': CAM_RIGHT_P1,
					'sceneItemEnabled': true
				})
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_RIGHT_SCENE,
					'sceneItemId': CAM_RIGHT_P2,
					'sceneItemEnabled': false
				})
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_LEFT_SCENE,
					'sceneItemId': CAM_LEFT_P1,
					'sceneItemEnabled': false
				})
				await obs.call('SetSceneItemEnabled', {
					'sceneName': CONFIG.CAM_LEFT_SCENE,
					'sceneItemId': CAM_LEFT_P2,
					'sceneItemEnabled': true
				})
			}
			webSocketInfo.obsError = "";
		}
	}  catch (error) {
        console.log('Could not swap cams!!' + error);
		webSocketInfo.obsError = serializeError(error);
		updateGUI();
    }
}

function secondsToTimecode(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;

	const pad = (num) => String(num).padStart(2, '0');

	return `${pad(hours)}:${pad(minutes)}:${pad(remainingSeconds)}`;
}

obs.on('StreamStateChanged', async (response) => {
	if (response.outputActive && !isStreaming) {
		isStreaming = true;
		createTimestampsFile();
		if (webSocketInfo.tshConnected == 1 && webSocketInfo.twitchConnected == 1) {
			let settings = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/user_data/settings.json');
			let tournamentUrl = settings.TOURNAMENT_URL;
			sendMessage(`!commands edit !bracket ${tournamentUrl}`);
			createStreametaJson();
		}
	} else if (!response.outputActive && isStreaming) {
		isStreaming = false;
		if (streametaJson != null) {
			if (streametaJson.sets[streametaJson.sets.length - 1].end_time == "null") {
				apiClient.videos.getVideosByUser(twitchUser, { limit: 1, type: "archive" }).then((stream) => {
					streametaJson.sets[streametaJson.sets.length - 1].end_time = secondsToTimecode(stream.data[0].durationInSeconds); // really hacky and untested way to just set the final set to end at the stream end time
				});
			}
		}

		if (streametaJsonFileName != null) {
			webhook.sendFile(streametaJsonFileName);
		}
		if (timestampsFileName != null) {
			webhook.sendFile(timestampsFileName);
		}
	}
});

var broadcastId;

function createTimestampsFile() {
	const date = new Date();
	if (webSocketInfo.twitchConnected == 1) {
		apiClient.videos.getVideosByUser(twitchUser, { limit: 1, type: "archive" }).then((stream) => { // this might not work lol
			broadcastId = stream.data[0].id;
			timestampsFileName = path.resolve(__dirname, `../timestamps/${broadcastId}.txt`);
			if (!fs.existsSync(timestampsFileName)) {
				fs.writeFile(timestampsFileName, '', (err) => {
					if (err) throw err;
					console.log(`Created ${timestampsFileName}`);
				});
			} else {
				console.log(`${timestampsFileName} already exists`);
			}
		});
	} else {
		timestampsFileName = path.resolve(__dirname, `../timestamps/Timestamps-${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.txt`);
		if (!fs.existsSync(timestampsFileName)) {
			fs.writeFile(timestampsFileName, '', (err) => {
				if (err) throw err;
				console.log(`Created ${timestampsFileName}`);
			});
		} else {
			console.log(`${timestampsFileName} already exists`);
		}
	}

}

var streametaJsonFileName = null;
var streametaJson = null;
var bracketUrl;

async function createStreametaJson() {
	let stream = await apiClient.videos.getVideosByUser(twitchUser, { limit: 1, type: "archive" });
	broadcastId = stream.data[0].id; // this might not work
	streametaJsonFileName = path.resolve(__dirname, `../streameta/${broadcastId}.json`);
	if (!fs.existsSync(streametaJsonFileName)) {
		let settings = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/user_data/settings.json');
		let program_state = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/program-state');
		streametaJson = {};
		streametaJson.name = program_state.tournamentInfo.tournamentName;
		streametaJson.channel = CONFIG.TWITCH_CHANNEL;
		streametaJson.youtube_channel = CONFIG.YT_CHANNEL_ID;
		streametaJson.sets = [];
		bracketUrl = settings.TOURNAMENT_URL;
		updateStreametaJson();
	} else {
		console.log(`${streametaJsonFileName} already exists`);
		fs.readFile(streametaJsonFileName, 'utf8', (err, data) => {
			if (err) throw err;
			streametaJson = JSON.parse(data);
		});
	}
}

function updateStreametaJson() {
	fs.writeFile(streametaJsonFileName, JSON.stringify(streametaJson, null, 4), (err) => {
		if (err) throw err;
		console.log(`Updated ${streametaJsonFileName}`);
	});
}

let resultsScreenStart = null;

async function updateChars(players) {
	// console.log({p1})
	// console.log({p2})
	console.log(`Called updateChars at ${new Date()}\n`);
	for (let i = 0; i < players.length; i++) {
		const player = players[i];
		if (p1 != null && p2 != null && player.character != 0 && player.name != null) {
			let data = {
				"mains": {
					"ssbu": [
						[
							characters[player.character],
							player.skin
						]
					]
				}
			};
			// console.log(`MY NAME IS ${player.name.toLowerCase()} AND I AM LOOKING FOR A CHARACTER CHANGE OF ${p1} AND ${p2} AT ${new Date()}!`)
			if(player.name.toLowerCase() === p1.toLowerCase()) {
				await axios.post('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-update-team-0-0', data);
				console.log(`updated ${p1} to ${player.character} (${characters[player.character]}) ${player.skin}`);
			} else if (player.name.toLowerCase() === p2.toLowerCase()) {
				await axios.post('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-update-team-1-0', data);
				console.log(`updated ${p2} to ${player.character} (${characters[player.character]}) ${player.skin}`);
			} else {
				console.error(`Could not locate a character change of a player in a loaded set!! This should never happen!!!! Player: ${player.name} P1: ${p1} P2: ${p2}`)
			}
		}
	}
}

async function isCommentary() {
    let commentatorData = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/get-comms');
    let commentatorCount = 0;

    for (let key in commentatorData) {
        let commentator = commentatorData[key];
        if (commentator.mergedName !== "" && commentator.mergedName !== undefined) {
            commentatorCount++;
        }
    }

    return commentatorCount !== 0;
}

var concat_data = '';
var maxInvalidParseAttempts = 5;
var server;
var oldPlayers = null;
var oldMatchInfo = null;
var numCharOld = 0;
var isAutoBracketScene = false;
var previousInfo = null;

var countInfoPerSec = 0;
var lowestCount = 99;

var lockScoreUpdate = false;
var prediction = null;

function addSecondsToTimecode(timecode, seconds) {
	const [hours, minutes, secondsPart] = timecode.split(':').map(Number);
	const date = new Date('1970-01-01T00:00:00Z');
	date.setUTCHours(hours);
	date.setUTCMinutes(minutes);
	date.setUTCSeconds(secondsPart);

	// Add the specified seconds
	date.setUTCSeconds(date.getUTCSeconds() + seconds);

	// Format back to HH:MM:SS
	const newTimecode = date.toISOString().substr(11, 8);
	return newTimecode;
}

setInterval(() => {
	if(webSocketInfo.switchConnected == 1) {
		// console.log(countInfoPerSec)
		if(countInfoPerSec < lowestCount) {
			console.log(lowestCount);
			lowestCount = countInfoPerSec;
		}
		countInfoPerSec = 0;
	}
}, 1000);

function connectToSwitch() {
	server = net.createConnection({ host: CONFIG.SWITCH_IP, port: CONFIG.SWITCH_PORT }, () => {
		if(!server.readable) {
			console.log("OOPS FAKE CONNECTION TO SWITCH!")
			console.log("ALREADY AN EXISTING CONNECTION LOL??")
			return;
		}
		// server.setTimeout(1000);
		console.log('Connected to Switch');
		webSocketInfo.switchConnected = 1;
		webSocketInfo.switchError = "";
		updateGUI();

		oldPlayers = null;
		oldMatchInfo = null;
		numCharOld = 0;
		isAutoBracketScene = false;
		previousInfo = null;

		var invalidParseAttempts = 0;
		server.on('data', async (data) => {
			var info;

			concat_data += data.toString();

			if(data.toString().includes('\n')) {
				try {
					var info = JSON.parse(concat_data.toString());
					concat_data = '';
				} catch (error) {
					// console.log('Could not parse JSON');
					// console.log(data.toString());
					invalidParseAttempts++;
					if (invalidParseAttempts > maxInvalidParseAttempts) {
						// console.log('Too many invalid parse attempts, resetting concat_data');
						concat_data = '';
					}
					return;
				}
			} else {
				return;
			}

			// var onlyGUIInfo = info;
			
			webSocketInfo.switchInfo = info;
			countInfoPerSec++;
			updateGUI();

			let numChar = 0;
			for (const player of info.players) {
				if (!player.is_cpu && player.name != null) {
					numChar += 1;
				}
			}

			if (info.is_match && oldMatchInfo !== info.is_match) {
				oldMatchInfo = info.is_match;
				if(webSocketInfo.tshConnected == 1) {
					await updateChars(info.players); // just in case two people on different sets play the same character 
				}
				if(webSocketInfo.obsConnected == 1) {
					if(webSocketInfo.tshConnected == 1) {
						if(CONFIG.USE_PLAYER_CAMS) {
							if(CONFIG.ONLY_PLAYER_CAMS_WITH_COMMENTARY) {
								isCommentary().then((hasCommentary) => {
									if (hasCommentary) {
										obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE_PLAYERCAMS });
									} else {
										obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE });
									}
								});
							} else {
								obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE_PLAYERCAMS });
							}
						}
					} else {
						obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE });
					}

					if (currentSet != null && currentSet !== oldSet) {
						obs.call('GetStreamStatus').then(async (response) => {
							if (response.outputActive) {
								if (timestampsFileName != undefined) {
									let timestamp = `${response.outputTimecode.split(".")[0]} - ${currentSet.round_name} - ${currentSet.p1_name} vs ${currentSet.p2_name}\n`;
						
									// Read the last line of the file
									const rl = readline.createInterface({
										input: fs.createReadStream(timestampsFileName),
										output: process.stdout,
										terminal: false
									});
						
									let lastLine = '';
									rl.on('line', (line) => {
										lastLine = line;
									});
						
									rl.on('close', () => {
										// Compare the last line with the new timestamp
										if (lastLine.split(" - ")[1] !== timestamp.split(" - ")[1]) {
											// Append the new timestamp if it is not a duplicate
											fs.appendFile(timestampsFileName, timestamp, (err) => {
												if (err) throw err;
												console.log(timestamp);
											});
										}
									});
								}
								if (webSocketInfo.twitchConnected == 1) {
									try {
										prediction = await apiClient.predictions.createPrediction(twitchUser, {
											autoLockAfter: 60,
											title: `Who will win ${currentSet.round_name}?`,
											outcomes: [
												currentSet.p1_name,
												currentSet.p2_name
											]
										});
									
										console.log('Prediction created:', prediction);
									} catch (error) {
										if (error._body && error._body.includes('prediction event already active')) {
											console.log('An active prediction already exists. Ending it...');
								
											// Fetch the active prediction
											const activePredictions = await apiClient.predictions.getPredictions(twitchUser, { status: 'ACTIVE' });
											if (activePredictions.data.length > 0) {
												const activePrediction = activePredictions.data[0];
								
												// End the active prediction
												await apiClient.predictions.cancelPrediction(twitchUser, activePrediction.id, 'CANCELED');
												console.log('Active prediction ended:', activePrediction);
								
												// Create a new prediction
												prediction = await apiClient.predictions.createPrediction(twitchUser, {
													autoLockAfter: 1,
													title: `Who will win ${currentSet.round_name}?`,
													outcomes: [
														currentSet.p1_name,
														currentSet.p2_name
													]
												});
								
												console.log('New prediction created:', prediction);
											} else {
												console.error('No active prediction found to end.');
											}
										} else {
											console.error('Error creating prediction:', error);
										}
									}
									if(streametaJson != null) {
										var set = {};
										set.broadcast = broadcastId;
										set.start_time = response.outputTimecode.split(".")[0];
										set.end_time = "null";
										var tournamentName = streametaJson.name;
										if(tournamentName.includes("Pōneke Popoff")) {
											tournamentName = tournamentName.replace("Pōneke Popoff", "PōP");
										}
										if(tournamentName.includes(" - ")) {
											tournamentName = tournamentName = tournamentName.split(" - ")[0];
										}
										set.title = `${tournamentName}: ${currentSet.p1_name} vs ${currentSet.p2_name} (${currentSet.round_name})`;
										if(bracketUrl == null) {
											let settings = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/user_data/settings.json');
											bracketUrl = settings?.TOURNAMENT_URL;
										}
										if (bracketUrl != null && bracketUrl != "") {
											set.description = "Bracket: " + bracketUrl;
										} else {
											set.description = "";
										}
										set.tags = CONFIG.STREAMETA_TAGS;
										set.notify = CONFIG.STREAMETA_NOTIFY;
										if (streametaJson.sets.length > 0) {
											if (streametaJson.sets[streametaJson.sets.length - 1].title != set.title) { // duplicate
												if (streametaJson.sets[streametaJson.sets.length - 1].end_time == "null") {
													streametaJson.sets[streametaJson.sets.length - 1].end_time = response.outputTimecode.split(".")[0]; // prev set never ended whoops lets just end it as the next one starts
												}
												streametaJson.sets.push(set);
											}
										} else {
											streametaJson.sets.push(set);
										}
										updateStreametaJson();
									}
								}
							}
						});
						oldSet = currentSet;
					}
				}
			} else if (!info.is_match && oldMatchInfo !== info.is_match) {
				oldMatchInfo = info.is_match;
				if(webSocketInfo.obsConnected == 1) {
					if(webSocketInfo.tshConnected == 1) {
						isCommentary().then((hasCommentary) => {
							if (hasCommentary) {
								obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.NOT_GAME_COMS_SCENE });
							} else {
								obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.NOT_GAME_SCENE });
							}
						});
					} else {
						obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.NOT_GAME_SCENE });
					}
				}
			}


			if (webSocketInfo.obsConnected == 1) {
				if (numChar !== numCharOld) {
					if (numChar === 2) {
						obs.call('SetSceneItemEnabled', {
							'sceneName': CONFIG.GAME_SCENE,
							'sceneItemId': overlayId, 
							'sceneItemEnabled': true ,
						});
					} else {
						obs.call('SetSceneItemEnabled', {
							'sceneName': CONFIG.GAME_SCENE,
							'sceneItemId': overlayId, 
							'sceneItemEnabled': false,
						});
					}
					numCharOld = numChar;
				}

				if (info.is_results_screen) {
					if (resultsScreenStart === null) {
						resultsScreenStart = Date.now();
					} else {
						if(CONFIG.GO_TO_BRACKET_ON_INACTIVE) {
							if (Date.now() - resultsScreenStart > CONFIG.BRACKET_INACTIVITY_TIME) {
								fetch('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/update-bracket')
								.then(response => {
									if(isAutoBracketScene === false) {
										obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.BRACKET_SCENE });
									}
								})
								.catch(error => console.error('Error resetting bracket:', error));
								resultsScreenStart = null;
								isAutoBracketScene = true;
							}
						}
					}
				} else {
					resultsScreenStart = null;
				}

				if (isAutoBracketScene === true) {
					let infoCopy = { ...info };
					let previousInfoCopy = { ...previousInfo };
				
					delete infoCopy.playerX;
					delete infoCopy.playerY;
					delete previousInfoCopy.playerX;
					delete previousInfoCopy.playerY; //player x and y pos is still updated on results screen
				
					if (JSON.stringify(infoCopy) !== JSON.stringify(previousInfoCopy)) {
						if(webSocketInfo.tshConnected == 1) {
							isCommentary().then((hasCommentary) => {
								if (hasCommentary) {
									obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.NOT_GAME_COMS_SCENE });
								} else {
									obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.NOT_GAME_SCENE });
								}
							});
						} else {
							obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.NOT_GAME_SCENE });
						}
						isAutoBracketScene = false;
					}
				}
				previousInfo = JSON.parse(JSON.stringify(info));
			}


			if (webSocketInfo.tshConnected == 1) {
				if (oldPlayers === null) {
					oldPlayers = JSON.parse(JSON.stringify(info.players));
					await tshLoadSet(info);
				}

				for (let i = 0; i < oldPlayers.length; i++) {
					const oldPlayer = oldPlayers[i];
					const currentPlayer = info.players[i];

					if (oldPlayer.name !== currentPlayer.name) {
						// console.log(oldPlayer.name)
						// console.log(currentPlayer.name)
						oldPlayers = JSON.parse(JSON.stringify(info.players));
						await tshLoadSet(info);
						break;
					}

					if (oldPlayer.stocks !== currentPlayer.stocks) {
						// console.log(currentPlayer)
						if (currentPlayer.stocks == 0) {
							if (p1 != null && p2 != null) {
								var winningPlayer;
								var losingPlayer;

								// info.players.forEach(player => {
									// if (player.stocks > 0 && player.name != null) {
										// winningPlayer = player;
										// break;
									// }
								// });
								
								for(let i = 0; i < info.players.length; i++) {
									let player = info.players[i];
									if (player.stocks > 0 && player.name != null) {
										winningPlayer = player;
										// console.log(`winng player name ${player.name} left`);
										// console.log(`winng player had ${player.stocks} left`);
										break;
									}
								}

								if(winningPlayer && lockScoreUpdate == false) {
									lockScoreUpdate = true;
									if (winningPlayer.name.toLowerCase() == p1) {
										console.log(`${p1} won at ${new Date()}`);
										await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-team0-scoreup');
									} else if(winningPlayer.name.toLowerCase() == p2) {
										console.log(`${p2} won at ${new Date()}`);
										await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-team1-scoreup');
									} else {
										console.error(`Could not find winning player in loaded set!! This should never happen!!!! Winning player: ${winningPlayer.name} P1: ${p1} P2: ${p2}`)
									}
									let program_state = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/program-state');

									if (program_state.best_of != 0 && currentSet) {
										let win_score = Math.ceil(program_state.score[1].best_of / 2);
										if((program_state.score[1].team[1].score >= win_score) || (program_state.score[1].team[2].score >= win_score)) {
											let winningOutcomeName;
											var isSwapped = await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-get-swap');
											console.log({isSwapped})
											if (winningPlayer.name.toLowerCase() == p1) {
												if (isSwapped == "True") {
													winningOutcomeName = currentSet.p1_name;
												} else {
													winningOutcomeName = currentSet.p2_name;
												}
											} else {												
												if(winningPlayer.name.toLowerCase() == p2) {
													if (isSwapped == "True") {
														winningOutcomeName = currentSet.p2_name;
													} else {
														winningOutcomeName = currentSet.p1_name;
													}
												}
											}

											if (webSocketInfo.twitchConnected == 1) {
												const activePredictions = await apiClient.predictions.getPredictions(twitchUser, { status: 'ACTIVE' });

												if (activePredictions.data.length > 0) {
													const activePrediction = activePredictions.data[0];
													
													const winningOutcome = activePrediction.outcomes.find(outcome => outcome.title === winningOutcomeName);

													if (winningOutcome) {
														try {
															const result = await apiClient.predictions.resolvePrediction(twitchUser, activePrediction.id, winningOutcome.id);
															console.log('Prediction rewarded:', result);
														} catch (error) {
															if (error._body && error._body.includes('prediction event has already ended')) {
																console.error('Error: The prediction event has already ended.');
															} else {
																console.error('Error resolving prediction:', error);
															}
														}
													} else {
														console.error('Winning outcome not found');
													}
												} else {
													console.error('No active prediction found to reward.');
												}

												if(streametaJson != null) {
													if(webSocketInfo.obsConnected == 1) {
														obs.call('GetStreamStatus').then(async (response) => {
															if (response.outputActive) {
																if (streametaJson.sets.length > 0) {
																	if (program_state.score[1].match != "Grand Final") {																		
																		streametaJson.sets[streametaJson.sets.length - 1].end_time = addSecondsToTimecode(response.outputTimecode.split(".")[0], 30);
																		updateStreametaJson();
																	} else {
																		if(!((program_state.score[1].team[1].score >= 3 && program_state.score[1].team[1].losers == true) || (program_state.score[1].team[2].score >= 3 && program_state.score[1].team[2].losers == true))) { //worlds worst if statement
																			streametaJson.sets[streametaJson.sets.length - 1].end_time = addSecondsToTimecode(response.outputTimecode.split(".")[0], 30);
																			updateStreametaJson();
																		}
																	}
																}
															}
														});
													}
												}
											}
										}
									}

									if(program_state.score[1].match == "Grand Final") {
										if((program_state.score[1].team[1].score >= 3 && program_state.score[1].team[1].losers == true) || (program_state.score[1].team[2].score >= 3 && program_state.score[1].team[2].losers == true)) {
											// await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-reset-match');
											await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-set?losers=False&team=1');
											await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-set?losers=False&team=2');
											await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-set?best-of=5&match=Grand Final Reset');
											await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-reset-scores');
											if(webSocketInfo.obsConnected == 1) {
												obs.call('GetStreamStatus').then(async (response) => {
													if(response.outputActive && timestampsFileName != undefined) {
														let timestamp = `${response.outputTimecode.split(".")[0]} - Grand Final Reset - ${currentSet.p1_name} vs ${currentSet.p2_name}\n`;
														fs.appendFile(timestampsFileName, timestamp, (err) => {
															if (err) throw err;
															console.log(timestamp);
														});

														if (webSocketInfo.twitchConnected == 1) {
															try {
																prediction = await apiClient.predictions.createPrediction(twitchUser, {
																	autoLockAfter: 60,
																	title: `Who will win Grand Final Reset?`,
																	outcomes: [
																		currentSet.p1_name,
																		currentSet.p2_name
																	]
																});
															
																console.log('Prediction created:', prediction);
															} catch (error) {
																if (error._body && error._body.includes('prediction event already active')) {
																	console.log('An active prediction already exists. Ending it...');
														
																	// Fetch the active prediction
																	const activePredictions = await apiClient.predictions.getPredictions(twitchUser, { status: 'ACTIVE' });
																	if (activePredictions.data.length > 0) {
																		const activePrediction = activePredictions.data[0];
														
																		// End the active prediction
																		await apiClient.predictions.cancelPrediction(twitchUser, activePrediction.id, 'CANCELED');
																		console.log('Active prediction ended:', activePrediction);
														
																		// Create a new prediction
																		prediction = await apiClient.predictions.createPrediction(twitchUser, {
																			autoLockAfter: 1,
																			title: `Who will win Grand Final Reset?`,
																			outcomes: [
																				currentSet.p1_name,
																				currentSet.p2_name
																			]
																		});
														
																		console.log('New prediction created:', prediction);
																	} else {
																		console.error('No active prediction found to end.');
																	}
																} else {
																	console.error('Error creating prediction:', error);
																}
															}
														}
													}
												})
											}
										}
									}
									lockScoreUpdate = false;
								}
							}
						}

						oldPlayers = JSON.parse(JSON.stringify(info.players));
						break;
					}

					if (oldPlayer.character !== currentPlayer.character || oldPlayer.skin !== currentPlayer.skin) {
						await updateChars(info.players);
						oldPlayers = JSON.parse(JSON.stringify(info.players));
					}
				}
			}


			// console.log(JSON.stringify(info, null, 4));
		});
	});
    server.on('end', () => {
        console.log('Switch connection closed');
        webSocketInfo.switchConnected = 0;
		updateGUI();
    });
	server.on('error', (error) => {
		console.log('Switch connection failed', error);
		webSocketInfo.switchError = serializeError(error);
		webSocketInfo.switchConnected = 0;
		updateGUI();
	});
}

async function clearSwitchCache() { // broken :(
	oldPlayers = null;
	oldMatchInfo = null;
	numCharOld = 0;
	isAutoBracketScene = false;
	previousInfo = null;
	console.log("clearSwitchCache");
}

// connectToSwitch();

async function connectToTSH() {
	try {
		await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-get-swap'); // just a low cost API request to see if its on
		webSocketInfo.tshConnected = 1;
		webSocketInfo.tshError = "";
		updateGUI();
	} catch (error) {
		webSocketInfo.tshConnected = 0;
		webSocketInfo.tshError = serializeError(error);
		updateGUI();
	}
}

function disconnectFromTSH() {
	webSocketInfo.tshConnected = 0; //TEMP
	webSocketInfo.tshError = "";
	console.log('Disconnected from TSH');
	updateGUI();
}

let sendMessage;
let apiClient;
let twitchUser;

async function connectToTwitch(code) {
	console.log('Connecting to Twitch...');
	const clientId = CONFIG.TWITCH_CLIENT_ID;
	const clientSecret = CONFIG.TWITCH_CLIENT_SECRET;
	const redirectUri = 'http://localhost.';

	const url = 'https://id.twitch.tv/oauth2/token';
	const params = new URLSearchParams();
	params.append('client_id', clientId);
	params.append('client_secret', clientSecret);
	params.append('code', code);
	params.append('grant_type', 'authorization_code');
	params.append('redirect_uri', redirectUri);

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: params
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		var data = await response.json();
		data.accessToken = data.access_token;
		data.refreshToken = data.refresh_token;
		data.expiresIn = data.expires_in;
		delete data.access_token;
		delete data.refresh_token;
		delete data.expires_in; //lmao
		await fs.promises.writeFile('./twitch_tokens.json', JSON.stringify(data, null, 4), 'utf-8');
		await connectToTwitchWithTokens();
	} catch (error) {
		console.error('Error connecting to Twitch:', error);
	}
}

async function connectToTwitchWithTokens() {
	console.log('Connecting to Twitch with tokens...');
	try {
		const tokenData = JSON.parse(await fs.promises.readFile('./twitch_tokens.json', 'utf-8'));
		const authProvider = new RefreshingAuthProvider(
			{
				clientId: CONFIG.TWITCH_CLIENT_ID,
				clientSecret: CONFIG.TWITCH_CLIENT_SECRET,
			}
		);
	
		authProvider.onRefresh(async (userId, newTokenData) => {
			await fs.promises.writeFile('./twitch_tokens.json', JSON.stringify(newTokenData, null, 4), 'utf-8');
		});
	
		await authProvider.addUserForToken(tokenData, ['chat', 'channel:manage:predictions', 'channel:read:predictions']);
		const chatClient = new ChatClient({ authProvider, channels: [CONFIG.TWITCH_CHANNEL] });
		apiClient = new ApiClient({ authProvider });
	
		twitchUser = await apiClient.users.getUserByName(CONFIG.TWITCH_CHANNEL);
	
		await chatClient.connect();
	
		sendMessage = async function(message) {
			await chatClient.say(CONFIG.TWITCH_CHANNEL, message);
		};
		webSocketInfo.twitchConnected = 1;
		updateGUI();
		console.log('Connected to Twitch');
	} catch (error) {
		webSocketInfo.twitchConnected = 0;
		updateGUI();
		console.error('Error during Twitch integration setup:', error);
	}
}

if (CONFIG.TWITCH_CLIENT_ID && CONFIG.TWITCH_CLIENT_SECRET) {
	connectToTwitchWithTokens();
}