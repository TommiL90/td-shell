import assert from "node:assert/strict";
import test from "node:test";
import { __testing } from "../extensions/gentle-ai.ts";

test("the fixed persona follows the user's latest message", () => {
	assert.match(__testing.buildGentlePrompt(), /Always respond in the same language the user writes in \(match the user's latest message\)\./);
});

test("the fixed persona has no regional language prohibition", () => {
	assert.doesNotMatch(__testing.buildGentlePrompt(), /Do NOT use voseo|never vos forms/);
});

test("the fixed persona uses professional, technical Spanish for Spanish messages", () => {
	const prompt = __testing.buildGentlePrompt();
	assert.match(prompt, /When the user writes in Spanish, answer in professional, technical Spanish\./);
	assert.match(prompt, /Language: professional, technical Spanish when the user writes Spanish\./);
	assert.doesNotMatch(prompt, /voseo|Rioplatense/i);
});
