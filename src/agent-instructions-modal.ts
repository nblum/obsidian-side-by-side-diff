import { Modal, Platform, TFile, requireApiVersion } from "obsidian";
import type { App } from "obsidian";
import { AGENT_INSTRUCTION_PATHS, buildAgentInstructions, planAgentInstructions } from "./agent-instructions";
import type { AgentInstructionPath } from "./agent-instructions";
import { getOpenGeneralSettings, readAgentCliStatus } from "./agent-setup-capabilities";
import { OBSIDIAN_CLI_GUIDE_URL } from "./external-links";
import type { Translator } from "./i18n";
import { setStatusMessage, showStatusNotice } from "./status-message";

class PreviewChangedError extends Error {}

type InstructionDestination = {
	file: TFile | null;
	blocked: "unavailable" | "readFailed" | null;
};

/** Previews and confirms an opt-in change to an instruction file in the vault root. */
export class AgentInstructionsModal extends Modal {
	private previewVersion = 0;

	constructor(app: App, private readonly translate: Translator, private readonly suffix: string) {
		super(app);
	}

	override onOpen(): void {
		this.modalEl.addClass("file-diff-sbs-agent-modal");
		this.titleEl.setText(this.translate("agent.setup.title"));
		void this.renderPreview();
	}

	override onClose(): void {
		this.previewVersion++;
		this.contentEl.empty();
	}

	/** Resolves the actual indexed path when the filesystem accepts a different spelling. */
	private async findInstructionDestination(path: AgentInstructionPath): Promise<InstructionDestination> {
		const vault = this.app.vault;
		const indexed = vault.getAbstractFileByPath(path);
		if (indexed instanceof TFile) return { file: indexed, blocked: null };
		const onDisk = indexed ? "folder" : (await vault.adapter.stat(path))?.type;
		if (onDisk === "file") {
			const file = vault.getRoot().children.find((entry): entry is TFile =>
				entry instanceof TFile && entry.path.toLowerCase() === path.toLowerCase()
			);
			return file ? { file, blocked: null } : { file: null, blocked: "readFailed" };
		}
		return { file: null, blocked: onDisk === "folder" && path === "AGENTS.md" ? "unavailable" : null };
	}

	/** Reads the selected file and renders the exact Markdown section pending approval. */
	private async renderPreview(preferredPath?: AgentInstructionPath, changed = false): Promise<void> {
		const version = ++this.previewVersion;
		const vault = this.app.vault;
		this.contentEl.empty();
		this.renderCliStatus();
		const status = this.contentEl.createEl("p", { attr: { role: "status" } });
		setStatusMessage(status, this.translate("agent.setup.loading"), "progress");
		const preview = this.contentEl.createDiv();
		const actions = this.contentEl.createDiv({ cls: "file-diff-sbs-agent-actions" });
		const cancel = actions.createEl("button", { text: this.translate("modal.cancel") });
		cancel.addEventListener("click", () => { this.close(); });

		let path: string = preferredPath ?? "AGENTS.md";
		try {
			const destinations = await Promise.all(AGENT_INSTRUCTION_PATHS.map(async candidate => ({
				candidate, ...await this.findInstructionDestination(candidate)
			})));
			if (version !== this.previewVersion) return;
			const existing = destinations.flatMap(({ candidate, file }) => file ? [{ candidate, file }] : []);
			const selected = existing.find(({ candidate }) => candidate === preferredPath) ?? existing[0];
			const candidate = selected?.candidate ?? "AGENTS.md";
			const file = selected?.file ?? null;
			path = file?.path ?? candidate;
			const blocked = destinations.find(destination => destination.blocked !== null);
			if (file === null && blocked?.blocked !== undefined && blocked.blocked !== null) {
				setStatusMessage(status, this.translate(`agent.setup.${blocked.blocked}`, { path: blocked.candidate }), "error");
				return;
			}
			let destination: HTMLSelectElement | undefined;
			if (existing.length > 1) {
				const label = this.contentEl.createEl("label", { text: this.translate("agent.setup.destination"), cls: "file-diff-sbs-agent-destination" });
				status.before(label);
				const select = label.createEl("select", { cls: "dropdown" });
				for (const option of existing) {
					select.createEl("option", { value: option.file.path, text: option.file.path }).selected = option.candidate === candidate;
				}
				select.addEventListener("change", () => {
					const option = existing.find(entry => entry.file.path === select.value);
					if (option) void this.renderPreview(option.candidate);
				});
				destination = select;
			}
			const baseline = file ? await vault.read(file) : null;
			if (version !== this.previewVersion) return;
			setStatusMessage(status, changed ? this.translate("agent.setup.changed") : "", "warning");
			const edit = planAgentInstructions(baseline, buildAgentInstructions(vault.getName(), this.suffix));
			if (edit.kind === "invalid") {
				setStatusMessage(status, this.translate("agent.setup.invalid", { path }), "error");
				return;
			}
			preview.createEl("p", { text: this.translate(`agent.setup.${edit.kind}Prompt`, { path }) });
			preview.createEl("pre", { cls: "file-diff-sbs-agent-preview" }).createEl("code", { text: edit.section });
			if (edit.kind === "unchanged") {
				cancel.setText(this.translate("agent.setup.closeAction"));
				return;
			}
			const confirm = actions.createEl("button", { text: this.translate(`agent.setup.${edit.kind}Action`), cls: "mod-cta" });
			confirm.addEventListener("click", () => {
				confirm.disabled = true;
				if (destination) destination.disabled = true;
				setStatusMessage(status, this.translate("agent.setup.saving", { path }), "progress");
				void this.savePreview(candidate, path, file, baseline, edit.content, version, status, confirm, destination);
			});
		} catch {
			if (version === this.previewVersion) {
				setStatusMessage(status, this.translate("agent.setup.readFailed", { path }), "error");
			}
		}
	}

	/** Shows the app-wide toggle and a shortcut to Obsidian's own registration flow. */
	private renderCliStatus(): void {
		const supported = Platform.isDesktopApp && requireApiVersion("1.12.2");
		const cliStatus = readAgentCliStatus(supported, window);
		const panel = this.contentEl.createDiv({ cls: "file-diff-sbs-agent-cli", attr: { "data-cli-status": cliStatus } });
		panel.createEl("strong", { text: this.translate(`agent.setup.cli.${cliStatus}`) });
		const description = cliStatus === "unavailable" ? "agent.setup.requirements"
			: cliStatus === "enabled" ? "agent.setup.cli.verify" : "agent.setup.cli.enable";
		panel.createEl("p", { text: this.translate(description) });
		const actions = panel.createDiv({ cls: "file-diff-sbs-agent-cli-actions" });
		const guide = actions.createEl("a", {
			text: this.translate("agent.setup.cli.guide"), href: OBSIDIAN_CLI_GUIDE_URL,
			attr: { target: "_blank", rel: "noopener" }
		});
		const openGeneral = cliStatus === "disabled" || cliStatus === "unknown" ? getOpenGeneralSettings(this.app) : null;
		if (openGeneral) {
			const button = actions.createEl("button", { text: this.translate("agent.setup.cli.openGeneral"), prepend: true });
			button.addEventListener("click", () => {
				if (openGeneral()) {
					this.close();
				} else {
					button.remove();
					guide.focus();
				}
			});
		}
	}

	/** Applies only the confirmed version, refreshing the preview if the file changed. */
	private async savePreview(
		candidate: AgentInstructionPath, path: string, file: TFile | null, baseline: string | null, content: string,
		version: number, status: HTMLElement, confirm: HTMLButtonElement, destination?: HTMLSelectElement
	): Promise<void> {
		const vault = this.app.vault;
		try {
			if (vault.getAbstractFileByPath(path) !== file) throw new PreviewChangedError();
			if (file) {
				await vault.process(file, current => {
					if (current !== baseline || file.path !== path || vault.getAbstractFileByPath(path) !== file) {
						throw new PreviewChangedError();
					}
					return content;
				});
			} else {
				const destinations = await Promise.all(AGENT_INSTRUCTION_PATHS.map(instruction => this.findInstructionDestination(instruction)));
				if (destinations.some(destination => destination.file !== null || destination.blocked !== null)) throw new PreviewChangedError();
				await vault.create(path, content);
			}
		} catch (error) {
			if (version !== this.previewVersion) return;
			if (error instanceof PreviewChangedError || vault.getAbstractFileByPath(path) !== file) {
				await this.renderPreview(candidate, true);
			} else {
				setStatusMessage(status, this.translate("agent.setup.writeFailed", { path }), "error");
				confirm.disabled = false;
				if (destination) destination.disabled = false;
			}
			return;
		}
		if (version === this.previewVersion) this.close();
		showStatusNotice(this.translate("agent.setup.saved", { path }), "success");
	}
}
