import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";

const GuildActions = findByProps("joinGuild");

if (!storage.lurkGuildIds) storage.lurkGuildIds = [];

function lurk(id: string) {
  if (!GuildActions?.joinGuild) {
    showToast("Failed: joinGuild not found", "Small");
    return;
  }

  GuildActions.joinGuild(id, { lurker: true })
    .then(() => {
      setTimeout(() => patchGuild(id), 100);
      showToast(`Lurking in guild ${id}`, "Check");
    })
    .catch(() => {
      showToast(`Failed to lurk in ${id}`, "Small");
    });
}

function patchGuild(id: string) {
  const guildsTree = findByProps("getGuildsTree");
  const guilds = findByProps("getGuildCount");
  const lurkingIds = findByProps("lurkingGuildIds");
  const joinGuild = findByProps("joinGuild");

  try {
    if (guildsTree?.getGuildsTree?.()?.root?.children) {
      guildsTree.getGuildsTree().root.children.unshift({
        type: "guild",
        id,
        unavailable: false,
        children: []
      });
    }

    if (guilds?.getGuild) {
      const guild = guilds.getGuild(id);
      if (guild) guild.joinedAt = new Date();
    }

    lurkingIds?.lurkingGuildIds?.()?.pop();
    joinGuild?.transitionToGuildSync?.(id);
  } catch (e) {
    console.error("Lurker patch failed:", e);
  }
}

function lurkAllStored() {
  for (const guildId of storage.lurkGuildIds) {
    if (guildId && guildId.trim()) {
      lurk(guildId.trim());
    }
  }
}

export default {
  onLoad() {
    setTimeout(() => lurkAllStored(), 500);
  },

  onUnload() {},

  settings: Settings,
};
