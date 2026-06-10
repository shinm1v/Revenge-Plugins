import { findByProps } from "src/metro";
import { after } from "src/patcher";
import { storage } from "src/vendetta/storage";
import { logger } from "src/utils/logger";

const log = logger("MentionFixer");

let patches: (() => void)[] = [];

export function start() {
    log.info("MentionFixer started");
    
    const API = findByProps("get", "post");
    const Dispatcher = findByProps("dispatch", "subscribe");
    const MessageComponent = findByProps("MessageContent", "default");
    
    function extractId(content: string): string | null {
        const match = content.match(/<@!?(\d+)>/);
        return match ? match[1] : null;
    }
    
    async function fixMention(id: string, channelId: string) {
        try {
            const res = await API.get({ url: `/users/${id}` });
            Dispatcher.dispatch({ type: "USER_UPDATE", user: res.body });
            Dispatcher.dispatch({ type: "LOAD_MESSAGES_SUCCESS", channelId, messages: [] });
            log.info(`Fixed mention for user: ${res.body.username}`);
        } catch (err) {
            log.error("Failed:", err);
        }
    }
    
    if (MessageComponent) {
        const unpatch = after("render", MessageComponent, (args, ret) => {
            const message = args[0]?.message || args[0]?.messageData;
            if (message?.content) {
                const id = extractId(message.content);
                if (id && !message.mentions?.length) {
                    fixMention(id, message.channel_id);
                }
            }
            return ret;
        });
        patches.push(unpatch);
    }
}

export function stop() {
    patches.forEach(unpatch => unpatch());
    patches = [];
    log.info("MentionFixer stopped");
}