import assert from "node:assert/strict";
import test from "node:test";
import { latestRelease } from "../scripts/main-channel.mjs";

const releases = "https://api.github.com/repos/TommiL90/td-shell/releases/latest";

test("upgrade discovers the latest stable version from the source repository release tag", async () => {
	const requests: unknown[] = [];
	const version = await latestRelease(async (url: string, options: unknown) => {
		requests.push({ url, options });
		return { ok: true, json: async () => ({ tag_name: "v4.8.0", draft: false, prerelease: false }) };
	});
	assert.equal(version, "4.8.0");
	assert.deepEqual(requests, [{ url: releases, options: { headers: { Accept: "application/vnd.github+json", "User-Agent": "tomidev" } } }]);
});

for (const release of [null, {}, { tag_name: "v4.8.0", draft: true }, { tag_name: "v4.8.0", prerelease: true },
	{ tag_name: "v4.8.0-beta.1" }, { tag_name: "main" }, { tag_name: "v4.8.0;evil" }]) {
	test(`upgrade rejects an invalid source release without invoking package managers: ${JSON.stringify(release)}`, async () => {
		let calls = 0;
		await assert.rejects(latestRelease(async (url: string) => {
			assert.equal(url, releases);
			calls += 1;
			return { ok: true, json: async () => release };
		}), { code: "latest-release-unavailable" });
		assert.equal(calls, 1);
	});
}
