import importlib.util
import pathlib
import subprocess
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "runtime" / "verify-safeguard.py"
SPEC = importlib.util.spec_from_file_location("verify_safeguard", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class SafeguardVerifierTests(unittest.TestCase):
    def classify(self, **overrides):
        values = dict(
            timer_exists=True,
            active_state="active",
            sub_state="waiting",
            service_relationship=True,
            next_realtime_usec=None,
            current_realtime_usec=1_000,
            next_monotonic_usec=None,
            current_monotonic_usec=1_000,
        )
        values.update(overrides)
        return MODULE.classify_timer(**values)

    def test_realtime_future(self):
        self.assertEqual(self.classify(next_realtime_usec=2_000)[2], "FUTURE_PROVEN")

    def test_realtime_expired(self):
        self.assertEqual(self.classify(next_realtime_usec=999)[2], "EXPIRED_PROVEN")

    def test_realtime_absent_is_not_expired(self):
        self.assertEqual(self.classify()[2], "TIMESTAMP_UNAVAILABLE")

    def test_monotonic_future(self):
        self.assertEqual(self.classify(next_monotonic_usec=2_000)[2], "FUTURE_PROVEN")

    def test_monotonic_expired(self):
        self.assertEqual(self.classify(next_monotonic_usec=999)[2], "EXPIRED_PROVEN")

    def test_typed_uint64_parser_accepts_exact_busctl_shape(self):
        self.assertEqual(MODULE.parse_typed_uint64("t 123456789"), 123456789)
        self.assertEqual(MODULE.parse_typed_uint64(" \t t\t0 \r\n"), 0)
        self.assertEqual(MODULE.parse_typed_uint64(f"t {2**64 - 1}"), 2**64 - 1)

    def test_typed_uint64_parser_rejects_noncanonical_shapes(self):
        rejected = (
            None,
            "",
            "123456789",
            "s 123456789",
            "x 123456789",
            "t",
            "t -1",
            "t +1",
            "t 1.0",
            "t 8h",
            "t 1 trailing",
            '"t 1"',
            't "1"',
            "garbage123",
            f"t {2**64}",
            "8h 1min 46.752986s",
        )
        for value in rejected:
            with self.subTest(value=value):
                self.assertIsNone(MODULE.parse_typed_uint64(value))

    def test_unparseable_monotonic_is_unavailable(self):
        self.assertIsNone(MODULE.parse_typed_uint64("not-a-timestamp"))
        self.assertEqual(self.classify()[2], "TIMESTAMP_UNAVAILABLE")

    def test_dbus_query_uses_systemd_252_compatible_exact_command(self):
        completed = subprocess.CompletedProcess([], 0, stdout=" \t t 2000 \r\n", stderr="")
        with mock.patch.object(MODULE.subprocess, "run", return_value=completed) as run:
            raw, parsed = MODULE.dbus_timer_usec("NextElapseUSecMonotonic")

        self.assertEqual((raw, parsed), ("t 2000", 2000))
        run.assert_called_once_with(
            (
                "busctl",
                "get-property",
                "org.freedesktop.systemd1",
                MODULE.TIMER_OBJECT_PATH,
                "org.freedesktop.systemd1.Timer",
                "NextElapseUSecMonotonic",
            ),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )

    def test_dbus_query_failure_is_closed_unknown(self):
        failure = subprocess.CalledProcessError(1, ("busctl", "get-property"))
        with mock.patch.object(MODULE.subprocess, "run", side_effect=failure):
            self.assertEqual(
                MODULE.dbus_timer_usec("NextElapseUSecRealtime"),
                ("UNKNOWN", None),
            )

    def test_dbus_empty_or_malformed_output_is_closed_unknown(self):
        for output in (
            "",
            "t",
            "123",
            "s 123",
            "x 123",
            "t 1 trailing",
            f"t {2**64}",
        ):
            with self.subTest(output=output):
                completed = subprocess.CompletedProcess([], 0, stdout=output, stderr="")
                with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
                    self.assertEqual(
                        MODULE.dbus_timer_usec("NextElapseUSecRealtime"),
                        ("UNKNOWN", None),
                    )

    def test_clock_conflict(self):
        result = self.classify(next_realtime_usec=2_000, next_monotonic_usec=999)
        self.assertEqual(result, ("UNKNOWN", "REALTIME_MONOTONIC_CONFLICT", "INCONSISTENT"))

    def test_inactive_timer(self):
        self.assertEqual(self.classify(active_state="inactive")[2], "INCONSISTENT")

    def test_timer_not_waiting(self):
        self.assertEqual(self.classify(sub_state="dead")[2], "INCONSISTENT")

    def test_missing_service_relationship(self):
        self.assertEqual(self.classify(service_relationship=False)[2], "INCONSISTENT")

    def test_human_list_timers_output_is_not_an_input(self):
        self.assertNotIn("list_timer", MODULE.classify_timer.__annotations__)
        self.assertEqual(self.classify()[2], "TIMESTAMP_UNAVAILABLE")

    def test_missing_evidence_never_expires(self):
        self.assertEqual(self.classify(next_realtime_usec=0, next_monotonic_usec=0)[2], "TIMESTAMP_UNAVAILABLE")


if __name__ == "__main__":
    unittest.main()
