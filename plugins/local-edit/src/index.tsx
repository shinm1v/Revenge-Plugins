import { findByName, findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { React, ReactNative as RN, stylesheet } from "@vendetta/metro/common";
import { findInReactTree } from "@vendetta/utils";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showConfirmationAlert } from "@vendetta/ui/alerts";
import { semanticColors } from "@vendetta/ui";

const ActionSheet = findByProps("openLazy", "hideActionSheet");
const { ActionSheetRow } = findByProps("ActionSheetRow");

const ChatItemWrapper = findByProps("DCDAutoModerationSystemMessageView", "default")?.default;
const MessageRecord = findByName("MessageRecord");
const RowManager = findByName("RowManager");

const EditIcon = getAssetIDByName("PencilSparkleIcon");

const styles = stylesheet.createThemedStyleSheet({
    previewContainer: {
        marginVertical: 8,
        borderRadius: 8,
        padding: 4,
        backgroundColor: semanticColors.BACKGROUND_SECONDARY,
        maxHeight: RN.Dimensions.get("window").height * 0.35,
    },
    inputField: {
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        fontSize: 16,
        color: semanticColors.TEXT_NORMAL,
        backgroundColor: semanticColors.BACKGROUND_TERTIARY,
        borderColor: semanticColors.BACKGROUND_MODIFIER_ACCENT,
        borderWidth: 1,
        minHeight: 80,
        textAlignVertical: "top",
    }
});

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

function LocalPreviewModal({ message }: { message: any }) {
    const [liveText, setLiveText] = React.useState(message.content || "");

    const simulatedMessage = new MessageRecord({
        ...message,
        content: liveText
    });

    return (
        <RN.View style={{ width: "100%" }}>
            {ChatItemWrapper && RowManager ? (
                <RN.View style={styles.previewContainer}>
                    <RN.ScrollView nestedScrollEnabled={true}>
                        <ChatItemWrapper
                            rowGenerator={new RowManager()}
                            message={simulatedMessage}
                        />
                    </RN.ScrollView>
                </RN.View>
            ) : null}

            <RN.TextInput
                style={styles.inputField}
                multiline={true}
                placeholder="Edit message body..."
                placeholderTextColor="#72767d"
                value={liveText}
                onChangeText={(text) => {
                    setLiveText(text);
                    message.__pendingLocalContent = text;
                }}
            />
        </RN.View>
    );
}

function openLocalEditPreview(message: any) {
    message.__pendingLocalContent = message.content || "";

    const alertOptions = {
        title: "Local Edit Preview",
        confirmText: "Save",
        cancelText: "Cancel",
        onConfirm: () => {
            dispatchLocalEdit(message, message.__pendingLocalContent);
        },
        children: React.createElement(LocalPreviewModal, { message })
    };

    // @ts-expect-error - children is completely fine here but missing in base typings
    showConfirmationAlert(alertOptions);
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
                                openLocalEditPreview(message);
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
