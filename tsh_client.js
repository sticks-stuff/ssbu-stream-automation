const http = require('http');
const fs = require('fs');
const net = require('net');
const OBSWebSocket = require('obs-websocket-js').default;
const obs = new OBSWebSocket();
const url = require('url');
const { join } = require('path');

const SWITCH_IP = '192.168.69.178';
const SWITCH_PORT = 4242;

const OBS_IP = 'localhost';
const OBS_PORT = 4455;
const OBS_PASSWORD = 'gIrwKyVys5bACaMg';

const GAME_SCENE = 'Game';
const NOT_GAME_SCENE = 'Not-Game';
const BRACKET_SCENE = 'Bracket';
const OVERLAY_NAME = 'Overlay';

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

tags = JSON.parse(fs.readFileSync('tags.json', 'utf8'));

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
		for (let [tag, names] of Object.entries(tags)) {
			// console.log(tag)
			if (names.includes(player.name)) {
				// matchedTag = tag;
				player.startggname = tag.toLowerCase();
				break;
			}
		}
	}

	const setData = await loadJsonFromUrl('http://127.0.0.1:5000/get-sets');
	// const setData = await loadJsonFromUrl('http://127.0.0.1:5000/get-sets?getFinished');

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

			player.name = player.name.toLowerCase();

			if ((player.startggname === editedSet.p1_name || player.name === editedSet.p1_name) && player.character != 0) {
				p1found = i;
			}

			if ((player.startggname === editedSet.p2_name || player.name === editedSet.p2_name) && player.character != 0) {
				p2found = i;
			}
		}

		console.log({ p1found })
		console.log({ p2found })

		if (p1found !== false && p2found !== false) {
			currentSet = set;
			await makeHttpRequest(`http://127.0.0.1:5000/scoreboard0-load-set?set=${set.id}`);
			var isSwapped = await makeHttpRequest('http://127.0.0.1:5000/scoreboard0-get-swap');
			console.log(isSwapped)
			if (p1found > p2found) {
				p1 = players[p1found].name
				console.log({ p2 })
				p2 = players[p2found].name
				console.log({ p1 })
				if (isSwapped == "False") {
					await makeHttpRequest('http://127.0.0.1:5000/scoreboard0-swap-teams');
				}
				await makeHttpRequest(`http://127.0.0.1:5000/scoreboard0-team0-color-${PORT_COLORS[p1found]}`);
				await makeHttpRequest(`http://127.0.0.1:5000/scoreboard0-team1-color-${PORT_COLORS[p2found]}`);
				// console.log("waiting 3 seconds for flip")
				// setTimeout(async () => {
				// 	console.log("flipping!")
				// 	await makeHttpRequest('http://127.0.0.1:5000/swap-teams');
				// }, 3000); // takes about 2 seconds to load the set
			} else {
				p1 = players[p2found].name
				console.log({ p1 })
				p2 = players[p1found].name
				console.log({ p2 })
				if (isSwapped == "True") {
					await makeHttpRequest('http://127.0.0.1:5000/scoreboard0-swap-teams');
				}
				await makeHttpRequest(`http://127.0.0.1:5000/scoreboard0-team1-color-${PORT_COLORS[p1found]}`);
				await makeHttpRequest(`http://127.0.0.1:5000/scoreboard0-team0-color-${PORT_COLORS[p2found]}`);
			}

			break;
		}
	}

	console.log(`Called at ${new Date()}\n ${JSON.stringify(players, null, 4)}`);
}

var tshEnable = false;

if (process.argv[2] == 'tsh-enable') {
	console.log('TSH Enabled');
	tshEnable = true;
}
var overlayId;

let obsConnected = false;
let timestampsFileName;

(async () => {
    try {
        await obs.connect(`ws://${OBS_IP}:${OBS_PORT}`, OBS_PASSWORD);
        console.log('Connected to OBS');
        obsConnected = true;

        obs.call('GetSceneItemId', {
            'sceneName': GAME_SCENE,
            'sourceName': OVERLAY_NAME,
        }).then((response) => {
            overlayId = response.sceneItemId;
        })
		obs.call('GetStreamStatus').then((response) => {
			if(response.outputActive) {
				createTimestampsFile();
			}
		})
    } catch (error) {
        console.log('Could not connect to OBS');
    }
})();

obs.on('StreamStateChanged', response => {
	if(response.outputActive == true) {
		createTimestampsFile();
	}
})

function createTimestampsFile() {
	const date = new Date();
	timestampsFileName = `Timestamps-${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.txt`;

	fs.writeFile(timestampsFileName, '', (err) => {
		if (err) throw err;
		console.log(`Created ${timestampsFileName}`);
	});
}

let resultsScreenStart = null;

function connectToSwitch() {
	const server = net.createConnection({ host: SWITCH_IP, port: SWITCH_PORT }, () => {
		console.log('Connected to Switch');

		let oldPlayers = null;
		let oldMatchInfo = null;
		let numCharOld = 0;

		server.on('data', async (data) => {
			var info;
			try {
				info = JSON.parse(data.toString());
			} catch (error) {
				console.log('Could not parse JSON');
				return;
			}

			let numChar = 0;
			for (const player of info.players) {
				if (!player.is_cpu && player.name != null) {
					numChar += 1;
				}
			}

			if (obsConnected) {
				if (numChar !== numCharOld) {
					if (numChar === 2) {
						obs.call('SetSceneItemEnabled', {
							'sceneName': GAME_SCENE,
							'sceneItemId': overlayId, 
							'sceneItemEnabled': true ,
						});
					} else {
						obs.call('SetSceneItemEnabled', {
							'sceneName': GAME_SCENE,
							'sceneItemId': overlayId, 
							'sceneItemEnabled': false,
						});
					}
					numCharOld = numChar;
				}

				if (info.is_match && oldMatchInfo !== info.is_match) {
					oldMatchInfo = info.is_match;
					obs.call('SetCurrentProgramScene', { 'sceneName': GAME_SCENE });

					if (obsConnected && currentSet != null && currentSet !== oldSet) {
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

				} else if (!info.is_match && oldMatchInfo !== info.is_match) {
					oldMatchInfo = info.is_match;
					obs.call('SetCurrentProgramScene', { 'sceneName': NOT_GAME_SCENE });
				}

				if (info.is_results_screen) {
					if (resultsScreenStart === null) {
						resultsScreenStart = Date.now();
					} else if (Date.now() - resultsScreenStart > 60000) {
						obs.call('SetCurrentProgramScene', { 'sceneName': BRACKET_SCENE });
						resultsScreenStart = null;
					}
				} else {
					resultsScreenStart = null;
				}
			}


			if (tshEnable) {
				if (oldPlayers === null) {
					await tshLoadSet(info);
					oldPlayers = JSON.parse(JSON.stringify(info.players));
				}

				for (let i = 0; i < oldPlayers.length; i++) {
					const oldPlayer = oldPlayers[i];
					const currentPlayer = info.players[i];

					if (oldPlayer.name !== currentPlayer.name) {
						console.log(oldPlayer.name)
						console.log(currentPlayer.name)
						await tshLoadSet(info);  // Replace this with your function
						oldPlayers = JSON.parse(JSON.stringify(info.players));
						break;
					}

					if (oldPlayer.stocks !== currentPlayer.stocks) {
						console.log(currentPlayer)
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
										await makeHttpRequest('http://127.0.0.1:5000/scoreboard0-team0-scoreup');
									} else if(winningPlayer.name.toLowerCase() == p2) {
										console.log(`${p2} won at ${new Date()}`);
										await makeHttpRequest('http://127.0.0.1:5000/scoreboard0-team1-scoreup');
									} else {
										console.error(`Could not find winning player in loaded set!! This should never happen!!!! Winning player: ${winningPlayer.name} P1: ${p1} P2: ${p2}`)
									}
								}
							}
						}

						oldPlayers = JSON.parse(JSON.stringify(info.players));
						break;
					}
				}
			}


			// console.log(JSON.stringify(info, null, 4));
		});
	});
    server.on('end', () => {
        console.log('Connection closed');
        setTimeout(connectToSwitch, 60000);  // Try to reconnect after 60 seconds
    });
	server.on('error', (error) => {
		console.log('Connection failed', error);
		setTimeout(connectToSwitch, 60000);  // Try to reconnect after 60 seconds
	});
}

connectToSwitch();