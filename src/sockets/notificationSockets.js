const setupNotificationSockets = (io) => {
	io.on('connection', (socket) => {
		socket.on('joinNotifications', (userId) => {
			if (!userId) {
				socket.emit('socketError', {
					message: 'User ID is required to join notifications',
				});
				return;
			}

			socket.join(`notifications_${userId}`);
			socket.emit('joinedNotifications', { userId });
		});

		socket.on('leaveNotifications', (userId) => {
			if (!userId) {
				return;
			}

			socket.leave(`notifications_${userId}`);
			socket.emit('leftNotifications', { userId });
		});
	});
};

module.exports = setupNotificationSockets;
