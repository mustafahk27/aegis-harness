import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const CONFIG_FILENAMES = ["aegis-harness.config.json", ".aegis-harness.json"];
const POLICY_BLUEPRINT_PATH = join(dirname(fileURLToPath(import.meta.url)), "policy.defaults.json");
const POLICY_BLUEPRINT = JSON.parse(readFileSync(POLICY_BLUEPRINT_PATH, "utf8"));
const DEFAULT_POLICY = POLICY_BLUEPRINT.defaultPolicy;
const POLICY_PROFILES = POLICY_BLUEPRINT.profiles;
const policyCache = new Map();
function fileState(cwd, filename) {
    const file = join(cwd, filename);
    if (!existsSync(file))
        return `${filename}:missing`;
    const stat = statSync(file);
    return `${filename}:${stat.mtimeMs}:${stat.size}`;
}
function fingerprint(cwd) {
    return CONFIG_FILENAMES.map((filename) => fileState(cwd, filename)).join("|");
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sanitizeString(value, field, warnings) {
    if (value === undefined)
        return undefined;
    if (typeof value === "string")
        return value;
    warnings.push(`invalid policy value for '${field}' — expected a string`);
    return undefined;
}
function sanitizeBoolean(value, field, warnings) {
    if (value === undefined)
        return undefined;
    if (typeof value === "boolean")
        return value;
    warnings.push(`invalid policy value for '${field}' — expected a boolean`);
    return undefined;
}
function sanitizeMode(value, field, warnings) {
    if (value === undefined)
        return undefined;
    if (typeof value === "string") {
        const normalized = value.toLowerCase();
        if (normalized === "feature" || normalized === "debug" || normalized === "refactor" || normalized === "review") {
            return normalized;
        }
    }
    warnings.push(`invalid policy value for '${field}' — expected one of feature, debug, refactor, or review`);
    return undefined;
}
function sanitizeNumber(value, field, warnings) {
    if (value === undefined)
        return undefined;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    warnings.push(`invalid policy value for '${field}' — expected a finite number`);
    return undefined;
}
function sanitizeStringArray(value, field, warnings) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
        warnings.push(`invalid policy value for '${field}' — expected an array of strings`);
        return undefined;
    }
    return value;
}
function sanitizeNumberArray(value, field, warnings) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
        warnings.push(`invalid policy value for '${field}' — expected an array of finite numbers`);
        return undefined;
    }
    return value;
}
function sanitizeSecretRules(value, warnings) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value)) {
        warnings.push("invalid policy value for 'secrets.rules' — expected an array");
        return undefined;
    }
    const rules = [];
    for (const entry of value) {
        if (!isPlainObject(entry)) {
            warnings.push("invalid policy value in 'secrets.rules' — expected an object");
            continue;
        }
        const rule = sanitizeString(entry.rule, "secrets.rules[].rule", warnings);
        const pattern = sanitizeString(entry.pattern, "secrets.rules[].pattern", warnings);
        if (!rule || !pattern)
            continue;
        const flags = sanitizeString(entry.flags, "secrets.rules[].flags", warnings);
        const suggestion = sanitizeString(entry.suggestion, "secrets.rules[].suggestion", warnings);
        rules.push({ rule, pattern, ...(flags ? { flags } : {}), ...(suggestion ? { suggestion } : {}) });
    }
    return rules;
}
function sanitizeExtraChecks(value, warnings) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value)) {
        warnings.push("invalid policy value for 'checks.extraChecks' — expected an array");
        return undefined;
    }
    const checks = [];
    for (const entry of value) {
        if (!isPlainObject(entry)) {
            warnings.push("invalid policy value in 'checks.extraChecks' — expected an object");
            continue;
        }
        const name = sanitizeString(entry.name, "checks.extraChecks[].name", warnings);
        const argv = sanitizeStringArray(entry.argv, "checks.extraChecks[].argv", warnings);
        if (!name || !argv)
            continue;
        const optional = sanitizeBoolean(entry.optional, "checks.extraChecks[].optional", warnings);
        const okExitCodes = sanitizeNumberArray(entry.okExitCodes, "checks.extraChecks[].okExitCodes", warnings);
        checks.push({
            name,
            argv,
            ...(optional === undefined ? {} : { optional }),
            ...(okExitCodes ? { okExitCodes } : {}),
        });
    }
    return checks;
}
function sanitizePolicyOverrides(raw, warnings) {
    if (!isPlainObject(raw)) {
        warnings.push("policy config must be a JSON object");
        return {};
    }
    const dangerousRaw = isPlainObject(raw.dangerousCommands) ? raw.dangerousCommands : undefined;
    const dangerousCommands = dangerousRaw
        ? {
            ...(sanitizeBoolean(dangerousRaw.blockSudo, "dangerousCommands.blockSudo", warnings) !== undefined
                ? { blockSudo: sanitizeBoolean(dangerousRaw.blockSudo, "dangerousCommands.blockSudo", warnings) }
                : {}),
            ...(sanitizeBoolean(dangerousRaw.blockRecursiveRmOutsideProject, "dangerousCommands.blockRecursiveRmOutsideProject", warnings) !== undefined
                ? {
                    blockRecursiveRmOutsideProject: sanitizeBoolean(dangerousRaw.blockRecursiveRmOutsideProject, "dangerousCommands.blockRecursiveRmOutsideProject", warnings),
                }
                : {}),
            ...(sanitizeBoolean(dangerousRaw.blockPipeToShell, "dangerousCommands.blockPipeToShell", warnings) !== undefined
                ? { blockPipeToShell: sanitizeBoolean(dangerousRaw.blockPipeToShell, "dangerousCommands.blockPipeToShell", warnings) }
                : {}),
            ...(sanitizeStringArray(dangerousRaw.blockedBranches, "dangerousCommands.blockedBranches", warnings)
                ? { blockedBranches: sanitizeStringArray(dangerousRaw.blockedBranches, "dangerousCommands.blockedBranches", warnings) }
                : {}),
            ...(sanitizeBoolean(dangerousRaw.blockChmod777, "dangerousCommands.blockChmod777", warnings) !== undefined
                ? { blockChmod777: sanitizeBoolean(dangerousRaw.blockChmod777, "dangerousCommands.blockChmod777", warnings) }
                : {}),
        }
        : undefined;
    const secretsRaw = isPlainObject(raw.secrets) ? raw.secrets : undefined;
    const secrets = secretsRaw
        ? {
            ...(sanitizeSecretRules(secretsRaw.rules, warnings) ? { rules: sanitizeSecretRules(secretsRaw.rules, warnings) } : {}),
            ...(sanitizeStringArray(secretsRaw.placeholderPatterns, "secrets.placeholderPatterns", warnings)
                ? { placeholderPatterns: sanitizeStringArray(secretsRaw.placeholderPatterns, "secrets.placeholderPatterns", warnings) }
                : {}),
        }
        : undefined;
    const checksRaw = isPlainObject(raw.checks) ? raw.checks : undefined;
    const checks = checksRaw
        ? {
            ...(sanitizeNumber(checksRaw.timeoutMs, "checks.timeoutMs", warnings) !== undefined
                ? { timeoutMs: sanitizeNumber(checksRaw.timeoutMs, "checks.timeoutMs", warnings) }
                : {}),
            ...(sanitizeBoolean(checksRaw.includeGitleaks, "checks.includeGitleaks", warnings) !== undefined
                ? { includeGitleaks: sanitizeBoolean(checksRaw.includeGitleaks, "checks.includeGitleaks", warnings) }
                : {}),
            ...(sanitizeBoolean(checksRaw.includeSemgrep, "checks.includeSemgrep", warnings) !== undefined
                ? { includeSemgrep: sanitizeBoolean(checksRaw.includeSemgrep, "checks.includeSemgrep", warnings) }
                : {}),
            ...(sanitizeExtraChecks(checksRaw.extraChecks, warnings) ? { extraChecks: sanitizeExtraChecks(checksRaw.extraChecks, warnings) } : {}),
        }
        : undefined;
    const testsRaw = isPlainObject(raw.tests) ? raw.tests : undefined;
    const tests = testsRaw
        ? {
            ...(sanitizeStringArray(testsRaw.packageManagers, "tests.packageManagers", warnings)
                ? { packageManagers: sanitizeStringArray(testsRaw.packageManagers, "tests.packageManagers", warnings) }
                : {}),
            ...(sanitizeStringArray(testsRaw.directRunners, "tests.directRunners", warnings)
                ? { directRunners: sanitizeStringArray(testsRaw.directRunners, "tests.directRunners", warnings) }
                : {}),
            ...(sanitizeStringArray(testsRaw.pythonModuleRunners, "tests.pythonModuleRunners", warnings)
                ? { pythonModuleRunners: sanitizeStringArray(testsRaw.pythonModuleRunners, "tests.pythonModuleRunners", warnings) }
                : {}),
        }
        : undefined;
    const profile = typeof raw.profile === "string" ? raw.profile : undefined;
    if (raw.profile !== undefined && typeof raw.profile !== "string") {
        warnings.push("invalid policy value for 'profile' — expected a string");
    }
    const displayName = sanitizeString(raw.displayName, "displayName", warnings);
    const uiKey = sanitizeString(raw.uiKey, "uiKey", warnings);
    const gatesEnabledByDefault = sanitizeBoolean(raw.gatesEnabledByDefault, "gatesEnabledByDefault", warnings);
    const defaultMode = sanitizeMode(raw.defaultMode, "defaultMode", warnings);
    return {
        ...(profile ? { profile } : {}),
        ...(displayName ? { displayName } : {}),
        ...(uiKey ? { uiKey } : {}),
        ...(gatesEnabledByDefault === undefined ? {} : { gatesEnabledByDefault }),
        ...(defaultMode ? { defaultMode } : {}),
        ...(dangerousCommands ? { dangerousCommands } : {}),
        ...(secrets ? { secrets } : {}),
        ...(checks ? { checks } : {}),
        ...(tests ? { tests } : {}),
    };
}
function mergePolicy(base, override) {
    return {
        ...base,
        ...override,
        dangerousCommands: { ...base.dangerousCommands, ...(override.dangerousCommands ?? {}) },
        secrets: {
            ...base.secrets,
            ...(override.secrets ?? {}),
            rules: override.secrets?.rules ?? base.secrets.rules,
            placeholderPatterns: override.secrets?.placeholderPatterns ?? base.secrets.placeholderPatterns,
        },
        checks: {
            ...base.checks,
            ...(override.checks ?? {}),
            extraChecks: override.checks?.extraChecks ?? base.checks.extraChecks,
        },
        tests: { ...base.tests, ...(override.tests ?? {}) },
    };
}
function normalizePolicy(cwd, raw) {
    const warnings = [];
    const sourcePath = CONFIG_FILENAMES.map((filename) => join(cwd, filename)).find((file) => existsSync(file)) ?? null;
    const sanitized = sanitizePolicyOverrides(raw, warnings);
    const requestedProfile = sanitized.profile ?? DEFAULT_POLICY.profile;
    const resolvedProfile = requestedProfile in POLICY_PROFILES ? requestedProfile : DEFAULT_POLICY.profile;
    if (requestedProfile !== resolvedProfile) {
        warnings.push(`unknown policy profile '${String(requestedProfile)}'; using '${DEFAULT_POLICY.profile}' instead`);
    }
    const merged = mergePolicy(mergePolicy(DEFAULT_POLICY, POLICY_PROFILES[resolvedProfile]), sanitized);
    merged.profile = resolvedProfile;
    const validRules = merged.secrets.rules.filter((rule) => {
        try {
            new RegExp(rule.pattern, rule.flags);
            return true;
        }
        catch (error) {
            warnings.push(`invalid regex pattern in policy for '${rule.rule}': ${String(error)}`);
            return false;
        }
    });
    merged.secrets.rules = validRules;
    const validPlaceholders = merged.secrets.placeholderPatterns.filter((pattern) => {
        try {
            new RegExp(pattern, "i");
            return true;
        }
        catch (error) {
            warnings.push(`invalid placeholder pattern in policy: ${pattern} (${String(error)})`);
            return false;
        }
    });
    merged.secrets.placeholderPatterns = validPlaceholders;
    return { policy: merged, sourcePath, warnings };
}
export function loadPolicy(cwd) {
    const key = fingerprint(cwd);
    const cached = policyCache.get(key);
    if (cached)
        return cached;
    const file = CONFIG_FILENAMES.map((filename) => join(cwd, filename)).find((candidate) => existsSync(candidate));
    if (!file) {
        const loaded = { policy: DEFAULT_POLICY, sourcePath: null, warnings: [] };
        policyCache.set(key, loaded);
        return loaded;
    }
    try {
        const raw = JSON.parse(readFileSync(file, "utf8"));
        const loaded = normalizePolicy(cwd, raw);
        policyCache.set(key, loaded);
        return loaded;
    }
    catch (error) {
        const loaded = {
            policy: DEFAULT_POLICY,
            sourcePath: file,
            warnings: [`failed to parse policy file ${file}: ${String(error)}`],
        };
        policyCache.set(key, loaded);
        return loaded;
    }
}
export function defaultPolicy() {
    return DEFAULT_POLICY;
}
