#!/usr/bin/env python3
"""Fail-closed verification for the transient experiment expiry timer."""

from __future__ import annotations

import json
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from typing import Final

TIMER_UNIT: Final = "nexcut-experiment-expiry.timer"
SERVICE_UNIT: Final = "nexcut-experiment-expiry.service"
TIMER_OBJECT_PATH: Final = (
    "/org/freedesktop/systemd1/unit/"
    "nexcut_2dexperiment_2dexpiry_2etimer"
)
UINT64_PATTERN: Final = re.compile(r"^[0-9]+$")


@dataclass(frozen=True)
class TimerEvidence:
    timerExists: str
    timerActiveState: str
    timerSubState: str
    timerServiceRelationship: str
    nextElapseRealtimeUsec: str
    nextElapseMonotonicUsec: str
    currentRealtimeUsec: str
    currentMonotonicUsec: str
    futureTriggerEstablished: str
    futureTriggerEvidenceSource: str
    diagnosticOutcome: str


def parse_uint64(value: str | None) -> int | None:
    if value is None or not UINT64_PATTERN.fullmatch(value):
        return None
    parsed = int(value)
    if parsed < 0 or parsed > (2**64 - 1):
        return None
    return parsed


def classify_timer(
    *,
    timer_exists: bool,
    active_state: str,
    sub_state: str,
    service_relationship: bool,
    next_realtime_usec: int | None,
    current_realtime_usec: int,
    next_monotonic_usec: int | None,
    current_monotonic_usec: int,
) -> tuple[str, str, str]:
    if (
        not timer_exists
        or active_state != "active"
        or sub_state != "waiting"
        or not service_relationship
    ):
        return "UNKNOWN", "STATE_OR_SERVICE_RELATIONSHIP", "INCONSISTENT"

    realtime = None
    if next_realtime_usec is not None and next_realtime_usec > 0:
        realtime = "FUTURE" if next_realtime_usec > current_realtime_usec else "EXPIRED"

    monotonic = None
    if next_monotonic_usec is not None and next_monotonic_usec > 0:
        monotonic = (
            "FUTURE" if next_monotonic_usec > current_monotonic_usec else "EXPIRED"
        )

    if realtime is not None and monotonic is not None and realtime != monotonic:
        return "UNKNOWN", "REALTIME_MONOTONIC_CONFLICT", "INCONSISTENT"

    sources = []
    result = monotonic or realtime
    if monotonic is not None:
        sources.append("DBUS_NEXT_ELAPSE_MONOTONIC_USEC")
    if realtime is not None:
        sources.append("DBUS_NEXT_ELAPSE_REALTIME_USEC")

    if result == "FUTURE":
        return "YES", ",".join(sources), "FUTURE_PROVEN"
    if result == "EXPIRED":
        return "NO", ",".join(sources), "EXPIRED_PROVEN"
    return "UNKNOWN", "NONE", "TIMESTAMP_UNAVAILABLE"


def run_text(*args: str) -> str:
    return subprocess.run(
        args,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    ).stdout.strip()


def systemctl_property(name: str) -> str:
    return run_text("systemctl", "show", TIMER_UNIT, f"--property={name}", "--value")


def dbus_timer_usec(name: str) -> tuple[str, int | None]:
    try:
        raw = run_text(
            "busctl",
            "get-property",
            "--value",
            "org.freedesktop.systemd1",
            TIMER_OBJECT_PATH,
            "org.freedesktop.systemd1.Timer",
            name,
        )
    except (OSError, subprocess.CalledProcessError):
        return "UNKNOWN", None
    parsed = parse_uint64(raw)
    return raw if parsed is not None else "UNKNOWN", parsed


def collect_evidence() -> TimerEvidence:
    load_state = systemctl_property("LoadState")
    active_state = systemctl_property("ActiveState")
    sub_state = systemctl_property("SubState")
    triggers = systemctl_property("Triggers")

    realtime_raw, next_realtime = dbus_timer_usec("NextElapseUSecRealtime")
    monotonic_raw, next_monotonic = dbus_timer_usec("NextElapseUSecMonotonic")

    current_realtime = time.time_ns() // 1_000
    current_monotonic = time.clock_gettime_ns(time.CLOCK_MONOTONIC) // 1_000

    future, source, outcome = classify_timer(
        timer_exists=load_state == "loaded",
        active_state=active_state,
        sub_state=sub_state,
        service_relationship=SERVICE_UNIT in triggers.split(),
        next_realtime_usec=next_realtime,
        current_realtime_usec=current_realtime,
        next_monotonic_usec=next_monotonic,
        current_monotonic_usec=current_monotonic,
    )

    return TimerEvidence(
        timerExists="YES" if load_state == "loaded" else "NO",
        timerActiveState=active_state or "UNKNOWN",
        timerSubState=sub_state or "UNKNOWN",
        timerServiceRelationship="YES" if SERVICE_UNIT in triggers.split() else "NO",
        nextElapseRealtimeUsec=realtime_raw,
        nextElapseMonotonicUsec=monotonic_raw,
        currentRealtimeUsec=str(current_realtime),
        currentMonotonicUsec=str(current_monotonic),
        futureTriggerEstablished=future,
        futureTriggerEvidenceSource=source,
        diagnosticOutcome=outcome,
    )


def main() -> int:
    try:
        evidence = collect_evidence()
    except (OSError, subprocess.CalledProcessError):
        evidence = TimerEvidence(
            timerExists="UNKNOWN",
            timerActiveState="UNKNOWN",
            timerSubState="UNKNOWN",
            timerServiceRelationship="UNKNOWN",
            nextElapseRealtimeUsec="UNKNOWN",
            nextElapseMonotonicUsec="UNKNOWN",
            currentRealtimeUsec="UNKNOWN",
            currentMonotonicUsec="UNKNOWN",
            futureTriggerEstablished="UNKNOWN",
            futureTriggerEvidenceSource="NONE",
            diagnosticOutcome="TIMESTAMP_UNAVAILABLE",
        )
    print(json.dumps(asdict(evidence), separators=(",", ":"), sort_keys=True))
    return 0 if evidence.diagnosticOutcome == "FUTURE_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
