#!/usr/bin/env node
// Historical entry-point filename retained for packaged lifecycle callers.
// Postinstall only applies the owned Pi fullscreen setting; it never downloads
// or builds native binaries. RDD remains optional and reports a missing binary.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { installTuiModeSetting, isPiManagedInstall } from "./install-tui-mode-setting.mjs";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
if (!isPiManagedInstall(packageDir)) {
	console.log(`tomidev skipped enabling fullscreen in global Pi settings: ${packageDir} is not a pi-managed install.`);
} else {
	try {
		const result = await installTuiModeSetting();
		if (result.changed) console.log("tomidev enabled fullscreen in global Pi settings; /settings can switch back to regular.");
	} catch (error) {
		console.error(`tomidev could not enable fullscreen: ${error instanceof Error ? error.message : String(error)}`);
		process.exitCode = 1;
	}
}
