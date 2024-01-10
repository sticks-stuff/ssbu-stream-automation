// Function to establish WebSocket connection
var socket;
function connectWebSocket() {
    // Create WebSocket connection.
	return new Promise((resolve, reject) => {
		socket = new WebSocket('ws://127.0.0.1:9310'); // replace with your server address
	
		// Connection opened
		socket.addEventListener('open', function (event) {
			socket.send(JSON.stringify({ command: 'heartbeat' }));
			resolve();
		});
	
		// Listen for messages
		socket.addEventListener('message', function (event) {
			console.log('Message from server: ', event.data);
			const data = JSON.parse(event.data);
			if (data.status === 'success' && data.message === 'heartbeat') {
				// Send heartbeat every 30 seconds to keep connection alive
				setInterval(() => {
					socket.send(JSON.stringify({ command: 'heartbeat' }));
				}, 30000);
			} else if (data.status === 'error' && data.message === 'heartbeat') {
				handleFailure();
			}
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