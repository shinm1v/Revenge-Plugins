import { findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { React } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");
const AlertModule = findByProps("alert", "prompt"); 

// Direct asset resolution for the specific icon component name
const EditIcon = getAssetIDByName("PencilSparkleIcon");

function dispatchLocalEdit(message: any, newContent: string) {
    const Dispatcher = findByProps("dispatch", "subscribe");
    if (!message || !message.id || !message.channel_id) return;

    const modifiedMessage = JSON.parse(JSON.stringify(message));
    modifiedMessage.content = newContent;
    
    if (modifiedMessage.content.endsWith("\u200b")) {
        modifiedMessage.content = modifiedMessage.content.replace(/\u200b/g, "");
    } else {
        modifiedMessage.content += "\u200b";
    }

    Dispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: modifiedMessage
    });
}

function openLocalEditModal(message: any) {
    if (!AlertModule?.prompt) {
        AlertModule.alert("Error", "Native text input prompt module not found.");
        return;
    }

    AlertModule.prompt(
        "Local Edit",
        "Modify this message text locally on your device screen:",
        [
            {
                text: "Cancel",
                style: "cancel"
            },
            {
                text: "Save Changes",
                onPress: (userInput: string) => {
                    dispatchLocalEdit(message, userInput ?? "");
                }
            }
        ],
        "plain-text",
        message.content || ""
    );
}

let unpatchOpenLazy: (() => void) | null = null;

export default {
    onLoad() {
        unpatchOpenLazy = before("openLazy", ActionSheet, ([comp, args, msg]) => {
            if (args !== "MessageLongPressActionSheet" || !msg?.message) return;

            const message = msg.message;

            comp.then((instance: any) => {
                const unpatch = after("default", instance, (_: any, component: any) => {
                    React.useEffect(() => () => { unpatch(); }, []);

                    const groups: any[] = findInReactTree(
                        component,
                        (c: any) => Array.isArray(c) && c[0]?.type?.name === "ActionSheetRowGroup"
                    );

                    if (!groups?.length) return;

                    const localEditButton = React.createElement(ActionSheetRow, {
                        label: "Local Edit Message",
                        icon: React.createElement(ActionSheetRow.Icon, {
                            source: EditIcon,
                        }),
                        onPress: () => {
                            ActionSheet.hideActionSheet();
                            setTimeout(() => {
                                openLocalEditModal(message);
                            }, 150);
                        },
                    });

                    let inserted = false;
                    for (let gi = 0; gi < groups.length; gi++) {
                        const groupChildren: any[] = findInReactTree(
                            groups[gi],
                            (c: any) => Array.isArray(c) && c.some((child: any) =>
                                child?.type?.name === "ActionSheetRow"
                            )
                        );
                        if (!groupChildren) continue;

                        groupChildren.unshift(localEditButton);
                        inserted = true;
                        break;
                    }

                    if (!inserted) {
                        groups.unshift(
                            React.createElement(ActionSheetRow.Group, null, localEditButton)
                        );
                    }
                });
            });
        });
    },

    onUnload() {
        unpatchOpenLazy?.();
        unpatchOpenLazy = null;
    },
};
