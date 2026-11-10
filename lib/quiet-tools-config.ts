import { ENV_PREFIX } from "./brand.ts";
export const QUIET_TOOLS_ENV = `${ENV_PREFIX}QUIET_TOOLS`;
export const PI_PRETTY_SUPPRESSED_TOOL_NAMES = ["read", "bash", "ls", "find", "grep"] as const;

export function quietToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[QUIET_TOOLS_ENV] !== "0";
}

export function mergeDisabledTools(existing: string | undefined, tools: readonly string[]): string {
	const disabled = new Set(
		(existing ?? "")
			.split(",")
			.map((tool) => tool.trim().toLowerCase())
			.filter(Boolean),
	);
	for (const tool of tools) disabled.add(tool);
	return [...disabled].join(",");
}
