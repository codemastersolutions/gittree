export const WORKTREE_LIST_4 = `worktree /Users/alice/repo-main
HEAD abc123def456789abc123def456789abc123def4
branch refs/heads/main
worktree /Users/alice/repo-feature-auth
HEAD def789abc123def456789abc123def456789abc12
branch refs/heads/feature/auth
worktree /Users/alice/repo-hotfix
HEAD 1111111111111111111111111111111111111111
detached
prunable gitdir file points to non-existent location
worktree /Users/alice/repo-old-deleted
HEAD 2222222222222222222222222222222222222222
branch refs/heads/deleted-branch
locked Permission denied
`;

export const STATUS_DIRTY_AHEAD_BEHIND = `# branch.oid 1111111111111111111111111111111111111111
# branch.head feature/auth
# branch.upstream origin/feature/auth
# ahead 2
# behind 1
1 .M N... 100644 100644 100644 abc abc src/auth/login.ts
1 .A N... 000000 100644 100644 0000000000000000000000000000000000000000 def src/auth/signup.ts
1 .D N... 100644 000000 000000 ghi ghi src/auth/legacy.ts
? src/auth/.env.local
? uploads/tmp.bin
`;

export const STATUS_CLEAN = `# branch.oid 9999999999999999999999999999999999999999
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
`;
