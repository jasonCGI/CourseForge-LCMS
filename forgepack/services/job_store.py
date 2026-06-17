"""Shared TTL reaper for the per-processor in-memory JOBS dicts.

Each JOBS dict otherwise grows forever and its output ZIP on disk is never
deleted — a slow memory leak + unbounded disk growth that eventually OOMs/
fills the single Railway worker. Call reap(JOBS) when a new job starts.
"""
import os
from datetime import datetime, timedelta


def reap(jobs: dict, ttl_seconds: int = 3600):
    cutoff = datetime.utcnow() - timedelta(seconds=ttl_seconds)
    for jid in list(jobs.keys()):
        try:
            ts = datetime.fromisoformat(jobs[jid].get('created_at', ''))
        except (ValueError, TypeError):
            continue
        if ts < cutoff:
            entry = jobs.pop(jid, {})
            path = entry.get('output_path')
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass
