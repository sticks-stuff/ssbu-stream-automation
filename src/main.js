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

var CONFIG = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config.json'), 'utf8'));
var tags = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'tags.json'), 'utf8'));
var characters = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'characters.json'), 'utf8'));

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
	await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-clear-all`);

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

	// const setData = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/get-sets');
	var foundSet = false;
	const setData = await loadJsonFromUrl('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/get-sets?getFinished');

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
			console.log(isSwapped)
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

			break;
		}
	}

	if(foundSet == false) {
		console.log("Could not find a set between two players!")
		let p1found = false;
		let p2found = false;
		// 
		for (let i = 0; i < players.length; i++) {
			const player = players[i];
	
			if (!player.name) {
				continue;
			}

			console.log(i + " " + player.name)
	
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
			} else {
				let response;
				p2found = true
				p1 = player.name;
				if(player.startggname != null) {
					response = await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-player-from-tag-0-0?tag=${player.startggname}&no-mains`);
				} else {
					response = await makeHttpRequest(`http://${CONFIG.TSH_IP}:${CONFIG.TSH_PORT}/scoreboard0-load-player-from-tag-0-0?tag=${player.name}&no-mains`);
				}
				if(response == "ERROR") {
					console.log("Could not find an entry in the database for " + (player.startggname ? player.startggname : player.name) + ". We are loading their direct tag (" + player.name + ") as P2 instead.");
					await axios.post('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-update-team-0-0', data);
					player.nameInDB = false;
				}
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

		await obs.call('GetStreamStatus').then((response) => {
			if(response.outputActive) {
				createTimestampsFile();
			}
		})

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

obs.on('StreamStateChanged', response => {
	if(response.outputActive == true) {
		createTimestampsFile();
	}
})

function createTimestampsFile() {
	const date = new Date();
	timestampsFileName = path.resolve(__dirname, `../timestamps/Timestamps-${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.txt`);

	fs.writeFile(timestampsFileName, '', (err) => {
		if (err) throw err;
		console.log(`Created ${timestampsFileName}`);
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
			if(player.name.toLowerCase() === p1) {
				await axios.post('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-update-team-0-0', data);
				console.log(`updated ${p1} to ${player.character} (${characters[player.character]}) ${player.skin}`);
			} else if (player.name.toLowerCase() === p2) {
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

setInterval(() => {
    console.log(countInfoPerSec);
    countInfoPerSec = 0;
}, 1000);

function connectToSwitch() {
	server = net.createConnection({ host: CONFIG.SWITCH_IP, port: CONFIG.SWITCH_PORT }, () => {
		if(!server.readable) {
			console.log("OOPS FAKE CONNECTION TO SWITCH!")
			console.log("ALREADY AN EXISTING CONNECTION LOL??")
			return;
		}
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
					console.log('Could not parse JSON');
					console.log(data.toString());
					invalidParseAttempts++;
					if (invalidParseAttempts > maxInvalidParseAttempts) {
						console.log('Too many invalid parse attempts, resetting concat_data');
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
						isCommentary().then((hasCommentary) => {
							if (hasCommentary) {
								obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE_PLAYERCAMS });
							} else {
								obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE });
							}
						});
					} else {
						obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.GAME_SCENE });
					}

					if (currentSet != null && currentSet !== oldSet) {
						obs.call('GetStreamStatus').then((response) => {
							if(response.outputActive && timestampsFileName != undefined) {
								let timestamp = `${response.outputTimecode.split(".")[0]} - ${currentSet.round_name} - ${currentSet.p1_name} vs ${currentSet.p2_name}\n`;
								fs.appendFile(timestampsFileName, timestamp, (err) => {
									if (err) throw err;
									console.log(timestamp);
								});
								
							}
						})
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
					} else if (Date.now() - resultsScreenStart > 120000) {
						fetch('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/update-bracket')
						.then(response => {
							if(isAutoBracketScene === false) {
								obs.call('SetCurrentProgramScene', { 'sceneName': CONFIG.BRACKET_SCENE });
							}
						})
						.catch(error => console.error('Error:', error));
						resultsScreenStart = null;
						isAutoBracketScene = true;
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
					await tshLoadSet(info);
					oldPlayers = JSON.parse(JSON.stringify(info.players));
				}

				for (let i = 0; i < oldPlayers.length; i++) {
					const oldPlayer = oldPlayers[i];
					const currentPlayer = info.players[i];

					if (oldPlayer.name !== currentPlayer.name) {
						// console.log(oldPlayer.name)
						// console.log(currentPlayer.name)
						await tshLoadSet(info);
						oldPlayers = JSON.parse(JSON.stringify(info.players));
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

								if(winningPlayer) {
									if (winningPlayer.name.toLowerCase() == p1) {
										console.log(`${p1} won at ${new Date()}`);
										await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-team0-scoreup');
									} else if(winningPlayer.name.toLowerCase() == p2) {
										console.log(`${p2} won at ${new Date()}`);
										await makeHttpRequest('http://' + CONFIG.TSH_IP + ':' + CONFIG.TSH_PORT + '/scoreboard0-team1-scoreup');
									} else {
										console.error(`Could not find winning player in loaded set!! This should never happen!!!! Winning player: ${winningPlayer.name} P1: ${p1} P2: ${p2}`)
									}
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