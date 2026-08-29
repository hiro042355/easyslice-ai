import importlib.util
import pathlib
import sys
import unittest

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

    def test_formatted_monotonic_is_not_misclassified(self):
        self.assertIsNone(MODULE.parse_uint64("8h 1min 46.752986s"))

    def test_unparseable_monotonic_is_unavailable(self):
        self.assertIsNone(MODULE.parse_uint64("not-a-timestamp"))
        self.assertEqual(self.classify()[2], "TIMESTAMP_UNAVAILABLE")

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
