import type { App } from "obsidian";

export type AgentCliStatus = "enabled" | "disabled" | "unavailable" | "unknown";

type CliSettingsHost = {
	electron?: { ipcRenderer?: { sendSync?: (channel: "cli", value: null) => unknown } };
};

/** Reads the same read-only Electron setting used by Obsidian's General tab. */
export function readAgentCliStatus(supported: boolean, host: object): AgentCliStatus {
	if (!supported) return "unavailable";
	try {
		// The public registration API does not report the app-wide toggle.
		const enabled = (host as CliSettingsHost).electron?.ipcRenderer?.sendSync?.("cli", null);
		if (enabled === true) return "enabled";
		if (enabled === false) return "disabled";
	} catch {
		// An unavailable internal bridge must not be shown as an explicitly disabled setting.
	}
	return "unknown";
}

/** Provides an optional shortcut to General, whose internal tab ID is "about". */
export function getOpenGeneralSettings(app: App): (() => boolean) | null {
	const settings = (app as App & { setting?: { open?: () => void; openTabById?: (id: string) => unknown } }).setting;
	const open = settings?.open;
	const openTabById = settings?.openTabById;
	if (typeof open !== "function" || typeof openTabById !== "function") return null;

	return () => {
		try {
			open.call(settings);
			const result = openTabById.call(settings, "about");
			return result !== null && result !== false;
		} catch {
			return false;
		}
	};
}
