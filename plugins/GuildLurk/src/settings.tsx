import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";

const { ScrollView } = findByProps("ScrollView");
const { TableRowGroup, TableRow, Stack, TextInput } = findByProps(
  "TableSwitchRow",
  "TableCheckboxRow",
  "TableRowGroup",
  "Stack",
  "TableRow"
);

storage.lurkGuildIds ??= [];

export default function Settings() {
  useProxy(storage);
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  const [newGuildId, setNewGuildId] = React.useState("");

  const addGuildId = () => {
    if (!newGuildId.trim()) {
      showToast("Please enter a guild ID", getAssetIDByName("Small"));
      return;
    }
    if (!storage.lurkGuildIds.includes(newGuildId.trim())) {
      storage.lurkGuildIds = [...storage.lurkGuildIds, newGuildId.trim()];
      setNewGuildId("");
      forceUpdate();
      showToast("Guild ID added (will lurk on reload)", getAssetIDByName("Check"));
    } else {
      showToast("Guild ID already exists", getAssetIDByName("Warning"));
    }
  };

  const removeGuildId = (guildId: string) => {
    storage.lurkGuildIds = storage.lurkGuildIds.filter((id: string) => id !== guildId);
    forceUpdate();
    showToast("Guild ID removed", getAssetIDByName("Check"));
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 10 }}>
      <Stack spacing={8}>
        <TableRowGroup title="Guild Lurker">
          <TableRow
            label="What is this?"
            subLabel="Join guilds without appearing in member list"
          />
        </TableRowGroup>

        <TableRowGroup title="Add Guild ID to Lurk">
          <Stack spacing={4}>
            <TextInput
              placeholder="Enter guild ID"
              value={newGuildId}
              onChange={setNewGuildId}
              isClearable
              onSubmitEditing={addGuildId}
              returnKeyType="done"
            />
          </Stack>
        </TableRowGroup>

        <TableRowGroup>
          <TableRow
            label="Add Guild ID"
            subLabel="Add a guild ID to lurk in (will apply on reload)"
            trailing={<TableRow.Arrow />}
            onPress={addGuildId}
          />
        </TableRowGroup>

        {storage.lurkGuildIds && storage.lurkGuildIds.length > 0 && (
          <TableRowGroup title="Lurking Guilds">
            {storage.lurkGuildIds.map((guildId: string, index: number) => (
              <TableRow
                key={index}
                label={guildId}
                trailing={
                  <RN.TouchableOpacity onPress={() => removeGuildId(guildId)}>
                    <RN.Image
                      source={getAssetIDByName("TrashIcon")}
                      style={{ width: 20, height: 20, tintColor: "#ff4d4d" }}
                    />
                  </RN.TouchableOpacity>
                }
              />
            ))}
          </TableRowGroup>
        )}

        <TableRowGroup title="How to Get Guild ID">
          <TableRow
            label="Guild ID"
            subLabel="Enable Developer Mode in Discord settings → right-click server name → Copy ID"
          />
        </TableRowGroup>
      </Stack>
    </ScrollView>
  );
}
