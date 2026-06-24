# @paperclipai/adapter-claude-local

## Unreleased

### Patch Changes

- Added lenient JSON parsing fallback in `parseClaudeStreamJson()` for markdown-wrapped and mixed-text output
- Added `extractResultFromMixedOutput()` to locate `"type": "result"` JSON objects inside interleaved text
- Treats exit-code-0 + parse failure as inferred success with `inferredSuccess: true` flag instead of error

## 0.3.1

### Patch Changes

- Stable release preparation for 0.3.1
- Updated dependencies
  - @paperclipai/adapter-utils@0.3.1

## 0.3.0

### Minor Changes

- Stable release preparation for 0.3.0

### Patch Changes

- Updated dependencies
  - @paperclipai/adapter-utils@0.3.0

## 0.2.7

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.7

## 0.2.6

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.6

## 0.2.5

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.5

## 0.2.4

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.4

## 0.2.3

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.3

## 0.2.2

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.2

## 0.2.1

### Patch Changes

- Version bump (patch)
- Updated dependencies
  - @paperclipai/adapter-utils@0.2.1
