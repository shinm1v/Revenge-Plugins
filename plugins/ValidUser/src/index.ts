import { findByProps } from "@vendetta/metro";
import { FluxDispatcher } from "@vendetta/metro/common";
import { before } from "@vendetta/patcher";

const RestAPI = findByProps("getAPIBaseURL", "get", "post");
const UserStore = findByProps("getUser", "getCurrentUser");
const MessageStore = findByProps("getMessage", "getMessages");

let unpatches: (() => void)[] = [];

async function fetchAndUpdateUser(id: string): Promise<void> {
    try {
        const res = await RestAPI.get({ url: `/users/${id}` });
        
        if (res?.body) {
            console.log(`[ValidUser] Fetched user ${id}: ${res.body.username}`);
            
            // Update UserStore
            FluxDispatcher.dispatch({
                type: "USER_UPDATE",
                user: res.body
            });
            
            return;
        }
    } catch (err: any) {
        console.error(`[ValidUser] Failed to fetch user ${id}:`, err?.status);
    }
}

function extractIdFromContent(content: string): string | null {
    // Extract ID from <@ID> format
    const match = content.match(/<@!?(\d+)>/);
    return match ? match[1] : null;
}

export const onLoad = () => {
    console.log(`[ValidUser] Plugin loaded - patching message components`);
    
    try {
        // Find the message row/text component that renders mentions
        const MessageContentModule = findByProps("MessageContent") || findByProps("childrenRender");
        
        if (!MessageContentModule) {
            console.warn("[ValidUser] Could not find message content module");
            return;
        }

        // Patch the Mention component rendering
        const MentionModule = findByProps("Mention");
        
        if (MentionModule?.default) {
            const unpatch = before("default", MentionModule, function(args: any[]) {
                const props = args[0];
                
                if (!props?.userId) return;

                const userId = props.userId;
                const user = UserStore?.getUser(userId);

                // If user is not cached, hook the press handler
                if (!user?.username) {
                    const originalOnPress = props?.onPress;
                    
                    props.onPress = async function(e: any) {
                        console.log(`[ValidUser] Mention tapped for uncached user ${userId}`);
                        
                        // Fetch the user data
                        await fetchAndUpdateUser(userId);
                        
                        // Dispatch message update to force re-render
                        FluxDispatcher.dispatch({
                            type: "MESSAGE_UPDATE"
                        });
                        
                        // Call original handler
                        if (typeof originalOnPress === "function") {
                            originalOnPress.call(this, e);
                        }
                    };
                }
            });

            unpatches.push(unpatch);
        }

        // Also patch raw text mentions (for <@ID> that aren't parsed as components)
        const TextModule = findByProps("Text");
        
        if (TextModule?.default) {
            const unpatch = before("default", TextModule, function(args: any[]) {
                const props = args[0];
                
                // Check if this text node contains a mention like <@ID>
                if (props?.children && typeof props.children === "string") {
                    const content = props.children;
                    
                    if (content.includes("<@")) {
                        const userId = extractIdFromContent(content);
                        
                        if (userId) {
                            const user = UserStore?.getUser(userId);
                            
                            // If not cached and this is a clickable element
                            if (!user?.username && (props?.onPress || props?.onClick)) {
                                const originalOnPress = props?.onPress || props?.onClick;
                                
                                props.onPress = props.onClick = async function(e: any) {
                                    console.log(`[ValidUser] Raw mention tapped for ${userId}`);
                                    
                                    await fetchAndUpdateUser(userId);
                                    
                                    FluxDispatcher.dispatch({
                                        type: "MESSAGE_UPDATE"
                                    });
                                    
                                    if (typeof originalOnPress === "function") {
                                        originalOnPress.call(this, e);
                                    }
                                };
                            }
                        }
                    }
                }
            });

            unpatches.push(unpatch);
        }
    } catch (err) {
        console.error("[ValidUser] Error during patch setup:", err);
    }
};

export const onUnload = () => {
    console.log(`[ValidUser] Plugin unloaded`);
    
    for (const unpatch of unpatches) {
        if (typeof unpatch === "function") {
            unpatch();
        }
    }
    
    unpatches = [];
};
