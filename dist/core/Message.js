"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const uuid_1 = require("uuid"); // Use uuid for unique IDs
class Message {
    constructor(round, phase, senderId, senderName, // Store name directly
    content, visibility, recipientId) {
        this.round = round;
        this.phase = phase;
        this.senderId = senderId;
        this.senderName = senderName;
        this.content = content;
        this.visibility = visibility;
        this.recipientId = recipientId;
        this.id = (0, uuid_1.v4)();
        this.timestamp = new Date();
    }
}
exports.Message = Message;
