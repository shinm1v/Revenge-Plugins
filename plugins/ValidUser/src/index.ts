const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fixUnknownMentions(message: any) {
    const ids = extractAllMentionIds(message);
    
    if (ids.length === 0) {
        logger.log("[ValidUser] No mention IDs found in message or embeds");
        return;
    }
    
    logger.log(`[ValidUser] Fixing ${ids.length} unknown mention(s): ${ids.join(", ")}`);
    
    const API = findByProps("get", "post");
    const Dispatcher = findByProps("dispatch", "subscribe");
    
    try {
        for (let i = 0; i < ids.length; i++) {
            const userId = ids[i];
            const res = await API.get({ url: `/users/${userId}` });
            Dispatcher.dispatch({
                type: "USER_UPDATE",
                user: res.body
            });
            logger.log(`[ValidUser] Cached user: ${res.body.username} (${userId}) [${i+1}/${ids.length}]`);
            
            // Add delay between fetches (except after the last one)
            if (i < ids.length - 1) {
                await sleep(150); // 150ms delay between requests
            }
        }
        
        Dispatcher.dispatch({
            type: "CHANNEL_SELECT",
            channelId: message.channel_id
        });
        
        logger.log(`[ValidUser] Dispatched CHANNEL_SELECT to refresh UI`);
    } catch (err) {
        logger.error("[ValidUser] Failed to fix mentions:", err);
    }
}