import { findByProps, findByStoreName } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { storage } from "@vendetta/plugin";
import { showInputAlert } from "@vendetta/ui/alerts";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");
const MessageStore = findByStoreName("MessageStore");
const ChannelStore = findByStoreName("ChannelStore");

// simple persistent storage for local edits
const localEdits: Record<string, { content: string; editedAt: number }> = storage.data.edits ?? {};
storage.data.edits = localEdits;

let unpatchMessage: (() => void) | null = null;
let unpatchGetMessage: (() => void) | null = null;

// Method 1: Patch the message store's getMessage function
function patchMessageStore() {
    if (!MessageStore?.getMessage) return null;
    
    const originalGetMessage = MessageStore.getMessage;
    
    MessageStore.getMessage = function(channelId: string, messageId: string) {
        const message = originalGetMessage.call(this, channelId, messageId);
        if (message && localEdits[messageId]) {
            return {
                ...message,
                content: localEdits[messageId].content,
                isLocalEdit: true
            };
        }
        return message;
    };
    
    return () => {
        MessageStore.getMessage = originalGetMessage;
    };
}

// Method 2: Patch the MessageContent component render
function patchMessageRender() {
    // Common Vendetta/Revenge module names for message content
    const MessageContent = findByProps("MessageContent") ?? 
                          findByProps("default", "type")?.type?.MessageContent ??
                          findByProps("render", "type")?.type;
    
    if (!MessageContent?.default) return () => {};
    
    return before("default", MessageContent, (args: any[]) => {
        const msg = args?.[0]?.message;
        if (!msg?.id) return;
        
        const edited = localEdits[msg.id];
        if (edited) {
            msg.content = edited.content;
        }
    });
}

// Better edit modal using Vendetta's alert system
function openEditModal(message: any) {
    const currentContent = localEdits[message.id]?.content ?? message.content;
    
    showInputAlert({
        title: "Edit Message Locally",
        initialValue: currentContent,
        placeholder: "Enter new message content...",
        confirmText: "Save",
        cancelText: "Cancel",
        onConfirm: (newText: string) => {
            if (!newText || newText === message.content) {
                // Remove edit if it matches original
                if (localEdits[message.id]) {
                    delete localEdits[message.id];
                    storage.data.edits = localEdits;
                }
                return;
            }
            
            localEdits[message.id] = {
                content: newText,
                editedAt: Date.now()
            };
            storage.data.edits = localEdits;
            
            // Force update the message
            forceMessageUpdate(message.id);
        }
    });
}

// Force UI refresh
function forceMessageUpdate(messageId: string) {
    // Try multiple refresh methods for compatibility
    if (MessageStore?.emit?.("MESSAGE_UPDATE")) {
        MessageStore.emit("MESSAGE_UPDATE", { messageId });
    }
    
    if (MessageStore?.forceUpdate) {
        MessageStore.forceUpdate();
    }
    
    // Dispatch event through Flux
    const Dispatcher = findByProps("dispatch", "subscribe");
    if (Dispatcher?.dispatch) {
        Dispatcher.dispatch({
            type: "MESSAGE_UPDATE",
            messageId: messageId
        });
    }
}

// Add clear all edits option to settings
function addSettingsAction() {
    const UserSettings = findByProps("openUserSettings", "SettingsUI");
    // This would require a settings panel - omitted for brevity
}

// Context menu patching
let unpatchContextMenu: (() => void) | null = null;

function patchContextMenu() {
    if (!ActionSheet?.openLazy) return;
    
    return before("openLazy", ActionSheet, ([component, args, ctx]: any) => {
        if (args !== "MessageLongPressActionSheet" && args !== "ChatLongPressActionSheet") return;
        if (!ctx?.message) return;
        
        const message = ctx.message;
        
        component.then((instance: any) => {
            after("default", instance, (_: any, res: any) => {
                if (!res) return;
                
                const groups = findInReactTree(
                    res,
                    (c: any) => Array.isArray(c) && 
                               c[0]?.type?.name === "ActionSheetRowGroup"
                );
                
                if (!groups?.length) return;
                
                const isEdited = !!localEdits[message.id];
                
                const editButton = React.createElement(ActionSheetRow, {
                    label: isEdited ? "Edit Locally (Edit)" : "Edit Locally",
                    subText: isEdited ? "Currently edited" : null,
                    icon: React.createElement(ActionSheetRow.Icon, {
                        source: getAssetIDByName("ic_message_edit") ?? 
                                getAssetIDByName("edit") ?? 
                                getAssetIDByName("ic_edit_24px")
                    }),
                    onPress: () => {
                        ActionSheet.hideActionSheet();
                        openEditModal(message);
                    }
                });
                
                const clearButton = isEdited ? React.createElement(ActionSheetRow, {
                    label: "Clear Local Edit",
                    subText: "Restore original message",
                    icon: React.createElement(ActionSheetRow.Icon, {
                        source: getAssetIDByName("ic_close") ?? 
                                getAssetIDByName("trash")
                    }),
                    onPress: () => {
                        ActionSheet.hideActionSheet();
                        delete localEdits[message.id];
                        storage.data.edits = localEdits;
                        forceMessageUpdate(message.id);
                    }
                }) : null;
                
                // Insert at position 1 (after reply button)
                groups[0].splice(1, 0, editButton);
                if (clearButton) {
                    groups[0].splice(2, 0, clearButton);
                }
            });
        });
    });
}

// Add slash command support
function registerCommands() {
    const commands = findByProps("registerCommand", "unregisterCommand");
    if (!commands?.registerCommand) return;
    
    commands.registerCommand({
        name: "localedit",
        description: "Edit a message locally",
        options: [
            {
                name: "message_id",
                description: "ID of the message to edit",
                type: 3,
                required: true
            },
            {
                name: "content",
                description: "New content for the message",
                type: 3,
                required: true
            }
        ],
        execute: (args: any, ctx: any) => {
            const { message_id, content } = args;
            
            // Try to find message
            let targetMessage = ctx?.message;
            if (!targetMessage && message_id) {
                // Search in current channel messages
                const messages = MessageStore?.getMessages(ctx?.channel?.id);
                targetMessage = messages?.[message_id];
            }
            
            if (!targetMessage) {
                return {
                    content: "❌ Could not find that message",
                    ephemeral: true
                };
            }
            
            localEdits[targetMessage.id] = {
                content: content,
                editedAt: Date.now()
            };
            storage.data.edits = localEdits;
            forceMessageUpdate(targetMessage.id);
            
            return {
                content: `✅ Locally edited message (only visible to you)`,
                ephemeral: true
            };
        }
    });
    
    return () => commands.unregisterCommand("localedit");
}

export default {
    onLoad() {
        console.log("[LocalMessageEdit] Loading...");
        
        unpatchMessage = patchMessageRender();
        unpatchGetMessage = patchMessageStore();
        unpatchContextMenu = patchContextMenu();
        
        // Commands are optional
        try {
            registerCommands();
        } catch (e) {
            console.warn("[LocalMessageEdit] Could not register commands", e);
        }
        
        console.log("[LocalMessageEdit] Loaded! Edit indicator:", Object.keys(localEdits).length);
    },
    
    onUnload() {
        console.log("[LocalMessageEdit] Unloading...");
        
        unpatchMessage?.();
        unpatchGetMessage?.();
        unpatchContextMenu?.();
        
        unpatchMessage = null;
        unpatchGetMessage = null;
        unpatchContextMenu = null;
    },
    
    // Expose for other plugins
    getEdits: () => ({ ...localEdits }),
    clearEdits: () => {
        Object.keys(localEdits).forEach(key => delete localEdits[key]);
        storage.data.edits = localEdits;
    }
};
