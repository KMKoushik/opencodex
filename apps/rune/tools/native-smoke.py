#!/usr/bin/env python3
"""Isolated bare-binary startup, live-row and idle smoke (not the full bench harness)."""
import json
import os
import queue
import statistics
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GATEWAY = "http://127.0.0.1:4431"
DATA = "/tmp/ocr-m1/profile"
PROJECT = "/private/tmp/ocr-m1/proj"


def api(path, body=None, method=None):
    req = urllib.request.Request(GATEWAY + "/api" + path,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


def run(index):
    env = dict(os.environ, OPENCODEX_GATEWAY=GATEWAY, OPENCODEX_DATA_DIR=DATA,
               OPENCODEX_BENCH="1", OPENCODEX_BENCH_PROJECT=PROJECT, OPENCODEX_FRAME_LOG="1")
    start = time.time() * 1000
    proc = subprocess.Popen([str(ROOT / "apps/rune/target/perf/opencodex")], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = []
    incoming = queue.Queue()

    def read():
        for line in proc.stdout:
            lines.append(line.rstrip())
            incoming.put(line.rstrip())
    threading.Thread(target=read, daemon=True).start()

    def wait(predicate, timeout=15):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            try:
                line = incoming.get(timeout=max(0.01, until-time.monotonic()))
            except queue.Empty:
                break
            if predicate(line):
                return line
        raise RuntimeError("native marker timed out")

    session = None
    try:
        first = wait(lambda line: line.startswith(("OPENCODEX_BENCH first_content", "OPENCODEX_SNAPSHOT")))
        snapshot_ms = int(first.split()[-1] if first.startswith("OPENCODEX_BENCH") else first.split()[4]) - start
        time.sleep(3)  # let asset/model/profile answers land, then measure actual idle
        markers = [line for line in lines if line.startswith("OPENCODEX_BENCH first_content")]
        startup = int(markers[0].split()[-1])-start if markers else None
        idle_start = int(time.time()*1000)
        time.sleep(20 if index == 2 else 2)
        idle_end = int(time.time()*1000)
        idle_draws = [line for line in lines if line.startswith("OPENCODEX_FRAME Drawn")
                      and idle_start < int(line.split()[-1]) < idle_end]
        if index == 2:
            count = int([line for line in lines if line.startswith("OPENCODEX_SNAPSHOT")][-1].split()[1]) + 1
            session = api("/sessions", {"directory": PROJECT})
            wait(lambda line: line.startswith(f"OPENCODEX_SNAPSHOT {count} "))
            before = [line for line in lines if line.startswith("OPENCODEX_SNAPSHOT")][-1].split()[3]
            api(f'/sessions/{session["id"]}/action', {"action": "rename", "title": "Live row smoke"})
            wait(lambda line: line.startswith("OPENCODEX_SNAPSHOT") and line.split()[3] != before)
            print("gateway worker observed live create + rename without reopening the app")
        print(json.dumps({"run": index, "firstContentMs": round(startup, 1) if startup is not None else None,
                          "firstSnapshotMs":round(snapshot_ms,1),"presentedContent":startup is not None,
                          "idleSeconds": (idle_end-idle_start)/1000, "idleDraws": len(idle_draws)}), flush=True)
        Path(f"/tmp/ocr-m1/native-{index}.log").write_text("\n".join(lines))
        return snapshot_ms
    finally:
        Path(f"/tmp/ocr-m1/native-{index}.log").write_text("\n".join(lines))
        try:
            if session:
                api(f'/sessions/{session["id"]}', method="DELETE")
        finally:
            proc.terminate()  # only the exact native process this script launched
            proc.wait(timeout=10)


samples = [run(i) for i in range(3)]
print("Bare exec-to-snapshot median ms (not presentation):", round(statistics.median(samples), 1))
