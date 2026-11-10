import assert from "node:assert/strict";
import test from "node:test";
import * as brand from "../lib/brand.ts";

test("brand constants name the tomidev rename", () => {
	assert.equal(brand.BRAND_NAME, "tomidev");
	assert.equal(brand.BRAND_DISPLAY_NAME, "Tomidev Shell");
	assert.equal(brand.COMMAND_PREFIX, "td");
	assert.equal(brand.BIN_NAME, "tomidev");
	assert.equal(brand.PACKAGE_NAME, "tomidev");
	assert.equal(brand.SOURCE_REPOSITORY, "TommiL90/td-shell");
	assert.equal(brand.GIT_SOURCE, "git:github.com/TommiL90/td-shell");
	assert.equal(brand.HOME_DIRNAME, ".tomidev");
	assert.equal(brand.ENV_PREFIX, "TOMIDEV_");
	assert.equal(brand.SCHEMA_PREFIX, "tomidev");
	assert.equal(brand.LEGACY_SCHEMA_PREFIX, "gentle-pi");
});

test("shared environment names are built from ENV_PREFIX", () => {
	assert.equal(brand.ENV_CONFIG_HOME, "TOMIDEV_CONFIG_HOME");
	assert.equal(brand.ENV_AGENT_HOME, "TOMIDEV_AGENT_HOME");
	assert.equal(brand.ENV_AGENTS_CHILD, "TOMIDEV_AGENTS_CHILD");
	assert.equal(brand.ENV_AGENTS_PI, "TOMIDEV_AGENTS_PI");
});

test("persisted ids are written with the tomidev prefix and every readable spelling is listed", () => {
	assert.equal(brand.LEGACY_SHELL_SCHEMA_PREFIX, "gentle-shell");
	assert.equal(brand.brandId("reply-language"), "tomidev.reply-language");
	assert.equal(brand.brandSchema("voice-settings", 1), "tomidev.voice-settings/v1");
	assert.deepEqual([...brand.readableBrandIds("reply-language")], ["tomidev.reply-language", "gentle-pi.reply-language", "gentle-shell.reply-language"]);
});

test("isBrandSchema accepts the current id and both pre-rename prefixes at the same version only", () => {
	for (const value of ["tomidev.voice-settings/v1", "gentle-pi.voice-settings/v1", "gentle-shell.voice-settings/v1"]) {
		assert.equal(brand.isBrandSchema(value, "voice-settings", 1), true, value);
	}
	for (const value of ["tomidev.voice-settings/v2", "gentle-pi.voice-settings/v2", "gentle-ai.voice-settings/v1", "voice-settings/v1", "gentle-pi.voice-settings", "tomidev.animations/v1", undefined, 1, {}]) {
		assert.equal(brand.isBrandSchema(value, "voice-settings", 1), false, String(value));
	}
});

test("isBrandId matches unversioned kinds and customTypes under any readable prefix", () => {
	assert.equal(brand.isBrandId("gentle-pi.agent_model_profiles", "agent_model_profiles"), true);
	assert.equal(brand.isBrandId("tomidev.agent_model_profiles", "agent_model_profiles"), true);
	assert.equal(brand.isBrandId("gentle-pi.agent_model_profile", "agent_model_profiles"), false);
	assert.equal(brand.isBrandId("gentle-ai.agent_model_profiles", "agent_model_profiles"), false);
});

test("isBrandFamily matches every version of a family under the current and legacy prefixes", () => {
	assert.equal(brand.isBrandFamily("tomidev.session-profile/v1", "session-profile/"), true);
	assert.equal(brand.isBrandFamily("gentle-pi.session-profile/v1", "session-profile/"), true);
	assert.equal(brand.isBrandFamily("gentle-pi.session-profile/v99", "session-profile/"), true);
	assert.equal(brand.isBrandFamily("gentle-pi.session-profile-other/v1", "session-profile/"), false);
	assert.equal(brand.isBrandFamily("gentle-ai.session-profile/v1", "session-profile/"), false);
	assert.equal(brand.isBrandFamily(42, "session-profile/"), false);
});

test("brandCommand prefixes a command name with the td namespace", () => {
	assert.equal(brand.brandCommand("guide"), "td:guide");
	assert.equal(brand.brandCommand("install-delegation"), "td:install-delegation");
	assert.equal(brand.brandCommand("skill-registry:refresh"), "td:skill-registry:refresh");
});
