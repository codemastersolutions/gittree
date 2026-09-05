module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'build', 'ci', 'revert']
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-max-length': [2, 'always', 72],
    'scope-enum': [
      2,
      'always',
      ['core', 'cli', 'vscode', 'repo', 'ci', 'deps', 'readme', 'docs', 'test']
    ]
  }
};
