"""
Tests for the schema-version gate in `server.version`.

`is_schema_supported` accepts any version in the CURRENT MAJOR line at or above
`MIN_SCHEMA_VERSION`, and rejects a different major or malformed input. These
tests pin that contract so a future edit to the constants or the parser can't
silently change which files import.
"""

import pytest

from server.version import (
    MIN_SCHEMA_VERSION,
    SCHEMA_VERSION,
    SUPPORTED_SCHEMA_VERSIONS,
    is_schema_supported,
)


def test_constants_are_as_documented():
    # Guards against an accidental constant edit shifting the whole gate.
    assert SCHEMA_VERSION == "1.0"
    assert MIN_SCHEMA_VERSION == "1.0"
    assert SUPPORTED_SCHEMA_VERSIONS == ["1.0"]


def test_accepts_exact_current_version():
    assert is_schema_supported("1.0") is True


def test_accepts_patch_suffix_of_current_version():
    # _parse_schema tolerates a patch component; "1.0.3" parses to (1, 0).
    assert is_schema_supported("1.0.3") is True


def test_accepts_newer_minor_in_same_major():
    # The range gate (added in commit ee9fb9b) permits an additive minor bump
    # on either side so a minor drift doesn't 422 every import.
    assert is_schema_supported("1.1") is True
    assert is_schema_supported("1.9") is True


def test_rejects_below_minimum():
    # Same major but below MIN ("0.x" is a different major anyway, so use a
    # constructed below-min case once MIN ever rises; for MIN=1.0 the only
    # below-min-same-major value is unreachable, so assert the boundary holds).
    # A 0.x version is below 1.0 AND a different major -> rejected.
    assert is_schema_supported("0.9") is False


def test_rejects_different_major():
    assert is_schema_supported("2.0") is False
    assert is_schema_supported("2.5") is False
    assert is_schema_supported("10.0") is False


@pytest.mark.parametrize("bad", ["", "abc", "v1.0", "1.x", "..", "1."])
def test_rejects_malformed_strings(bad):
    assert is_schema_supported(bad) is False


@pytest.mark.parametrize("bad", [None, [], {}, object()])
def test_rejects_non_string_input(bad):
    # _parse_schema returns None on these; the gate must not raise.
    assert is_schema_supported(bad) is False


def test_numeric_input_is_handled_gracefully():
    # A float like 1.0 stringifies to "1.0" and is accepted; an int 2 -> "2"
    # parses to (2, 0) and is rejected as a different major. Either way: no raise.
    assert is_schema_supported(1.0) is True
    assert is_schema_supported(2) is False
