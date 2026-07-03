/**
 * Socket.io events and connections handler
 * Configures event-driven listeners to support real-time POS stock movement updates
 * @param {Server} io - The Socket.io Server instance
 */
const sockethandler = (io) => {
    const enableSocketLogs = (process.env.SOCKET_LOGGING || 'true') === 'true';
    io.on("connection", (socket) => {
        // Log client connections for local debug/monitoring when enabled
        if (enableSocketLogs) console.log(`Socket client connected: ${socket.id}`);

        /**
         * Event: joinBranch
         * Action: Subscribes client socket to a specific branch room
         * Payload: branchId (String representing Branch Mongo ObjectId)
         */
        socket.on("joinBranch", (branchId) => {
            if (branchId) {
                const roomName = `branch_${branchId}`;
                socket.join(roomName);
                if (enableSocketLogs) console.log(`Socket ${socket.id} joined room: ${roomName}`);

                socket.emit("joinedBranchRoom", {
                    success: true,
                    room: roomName,
                    message: `Subscribed to live stock changes for branch ID: ${branchId}`
                });
            } else {
                socket.emit("socketError", {
                    message: "branchId parameter is required to join a branch subscription room"
                });
            }
        });

        /**
         * Event: leaveBranch
         * Action: Unsubscribes client from a specific branch room
         * Payload: branchId (String)
         */
        socket.on("leaveBranch", (branchId) => {
            if (branchId) {
                const roomName = `branch_${branchId}`;
                socket.leave(roomName);
                if (enableSocketLogs) console.log(`Socket ${socket.id} left room: ${roomName}`);

                socket.emit("leftBranchRoom", {
                    success: true,
                    room: roomName,
                    message: `Unsubscribed from live updates for branch ID: ${branchId}`
                });
            }
        });

        // Disconnection handler
        socket.on("disconnect", () => {
            if (enableSocketLogs) console.log(`Socket client disconnected: ${socket.id}`);
        });
    });
};

module.exports = sockethandler;
