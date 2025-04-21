"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _ConversationLog_messages;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationLog = void 0;
const IMessage_1 = require("../interfaces/IMessage");
const IRole_1 = require("../interfaces/IRole");
class ConversationLog {
    constructor() {
        _ConversationLog_messages.set(this, []);
    }
    addMessage(message) {
        __classPrivateFieldGet(this, _ConversationLog_messages, "f").push(message);
        // Maybe add validation here
    }
    getMessages(filter) {
        let filtered = [...__classPrivateFieldGet(this, _ConversationLog_messages, "f")]; // Copy
        if (filter?.round !== undefined) {
            filtered = filtered.filter(m => m.round === filter.round);
        }
        if (filter?.phase) {
            filtered = filtered.filter(m => m.phase === filter.phase);
        }
        if (filter?.visibility) {
            const visibilities = Array.isArray(filter.visibility) ? filter.visibility : [filter.visibility];
            filtered = filtered.filter(m => visibilities.includes(m.visibility));
        }
        if (filter?.relevantToPlayer) {
            const { id, role } = filter.relevantToPlayer;
            const isMafia = role === IRole_1.RoleName.Mafia;
            filtered = filtered.filter(m => m.visibility === IMessage_1.MessageVisibility.Public ||
                (m.visibility === IMessage_1.MessageVisibility.Mafia && isMafia)
            // || m.recipientId === id // For future private messages
            );
        }
        return Object.freeze(filtered); // Return immutable view
    }
    getAllMessages() {
        return Object.freeze([...__classPrivateFieldGet(this, _ConversationLog_messages, "f")]);
    }
}
exports.ConversationLog = ConversationLog;
_ConversationLog_messages = new WeakMap();
