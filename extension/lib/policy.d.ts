export interface PolicyRule {
  rule: string;
  pattern: string;
  flags?: string;
  suggestion?: string;
}

export interface AegisPolicy {
  displayName: string;
  uiKey: string;
  gatesEnabledByDefault: boolean;
  dangerousCommands: {
    blockSudo: boolean;
    blockRecursiveRmOutsideProject: boolean;
    blockPipeToShell: boolean;
    blockedBranches: string[];
    blockChmod777: boolean;
  };
  secrets: {
    rules: PolicyRule[];
    placeholderPatterns: string[];
  };
  checks: {
    timeoutMs: number;
    includeGitleaks: boolean;
    includeSemgrep: boolean;
    extraChecks: unknown[];
  };
  tests: {
    packageManagers: string[];
    directRunners: string[];
    pythonModuleRunners: string[];
  };
}

export declare function defaultPolicy(): AegisPolicy;
export declare function loadPolicy(cwd: string): {
  policy: AegisPolicy;
  sourcePath: string | null;
  warnings: string[];
};
