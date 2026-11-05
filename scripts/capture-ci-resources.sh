#!/usr/bin/env bash
# A post-failure snapshot; cgroup peak/events cover the job where available.
set -u
mkdir -p test-results
{
  printf 'Captured: '
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  printf '\nMemory (MiB):\n'
  free -m || true
  printf '\nDisk:\n'
  df -h . || true
  for file in /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.events; do
    if [ -r "$file" ]; then
      printf '\n%s:\n' "$file"
      cat "$file" || true
    fi
  done
} > test-results/runner-resources.txt
