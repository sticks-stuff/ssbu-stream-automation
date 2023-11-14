import socket
import json
from obswebsocket import obsws, requests

GAME_SCENE = "Game"
NOT_GAME_SCENE = "Not-Game"
OVERLAY_NAME = "Overlay"

SWITCH_IP = "" 
SWITCH_PORT = 4242

OBS_IP = "localhost"
OBS_PORT = 4455
OBS_PASSWORD = ""

client = obsws(OBS_IP, OBS_PORT, OBS_PASSWORD)
client.connect()

overlayId = client.call(requests.GetSceneItemId(sceneName=GAME_SCENE, sourceName=OVERLAY_NAME)).getSceneItemId()
oldMatchInfo = None

with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
	sock.connect((SWITCH_IP, SWITCH_PORT))

	while True:
		message = sock.recv(1024)
		info = json.loads(message.decode())
  
		numChar = 0
		for i in info["players"]:
			if i["character"] != 0 and i["is_cpu"] == False:
				numChar += 1

		if numChar == 2:
			client.call(requests.SetSceneItemEnabled(sceneName=GAME_SCENE, sceneItemId=overlayId, sceneItemEnabled=True))
		else:
			client.call(requests.SetSceneItemEnabled(sceneName=GAME_SCENE, sceneItemId=overlayId, sceneItemEnabled=False))

		if info["is_match"] == True and oldMatchInfo != info["is_match"]:
			oldMatchInfo = info["is_match"]
			client.call(requests.SetCurrentProgramScene(sceneName=GAME_SCENE))
		elif info["is_match"] == False and oldMatchInfo != info["is_match"]:
			oldMatchInfo = info["is_match"]
			client.call(requests.SetCurrentProgramScene(sceneName=NOT_GAME_SCENE))

		print(json.dumps(info, indent=4))
