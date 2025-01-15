// Function to establish WebSocket connection
var socket;
function connectWebSocket() {

	// Remove existing event listeners
	if (socket) {
		socket.removeEventListener('open');
		socket.removeEventListener('message');
		socket.removeEventListener('close');
		socket.removeEventListener('error');
	}

	// Create WebSocket connection.
	return new Promise((resolve, reject) => {
		socket = new WebSocket('ws://127.0.0.1:9310'); // replace with your server address

		// Connection opened
		socket.addEventListener('open', function (event) {
			socket.send(JSON.stringify({ command: 'heartbeat' }));
			resolve();
		});

		// Connection closed
		socket.addEventListener('close', function (event) {
			console.log('Server connection closed: ', event);
			handleFailure();
			connectWebSocket(); // Reconnect
		});

		// Connection error
		socket.addEventListener('error', function (event) {
			console.log('WebSocket error: ', event);
			handleFailure();
			reject(error);
			connectWebSocket(); // Reconnect
		});
	});
}

// Function to run when connection fails or heartbeat fails
function handleFailure() {
	document.body.innerHTML = '';
	var para = document.createElement("P");
	var t = document.createTextNode("Connection or heartbeat failed!!");
	para.appendChild(t);
	document.body.appendChild(para);
}