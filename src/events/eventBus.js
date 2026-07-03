const EventEmitter = require('events');

// Central event bus for inter-module communication within the monolith backend.
// Other modules (like Inventory, Sales) will require this and emit events here.
class EventBus extends EventEmitter {}

const systemEvents = new EventBus();

module.exports = systemEvents;
