import pytest
from app.data_pipeline.normalizer import normalize_cpi_response, validate_completeness


def _row(series_no="1", row_text="Food", uom="Per Cent", columns=None):
    return {"seriesNo": series_no, "rowText": row_text, "uoM": uom, "columns": columns or []}


def _payload(rows):
    return {"Data": {"row": rows}}


# ── normalize_cpi_response ────────────────────────────────────────────────────

def test_empty_row_list_returns_empty():
    assert normalize_cpi_response(_payload([])) == []


def test_missing_data_key_returns_empty():
    assert normalize_cpi_response({}) == []


def test_single_series_half_year_parsed():
    payload = _payload([_row(columns=[
        {"key": "2024 1H", "value": "0.8"},
        {"key": "2024 2H", "value": "1.2"},
    ])])
    result = normalize_cpi_response(payload)
    assert len(result) == 1
    assert result[0]["series_name"] == "Food"
    assert result[0]["data_points"] == [(2024, 1, 0.8), (2024, 7, 1.2)]


def test_na_value_is_skipped():
    payload = _payload([_row(columns=[
        {"key": "2024 1H", "value": "N.A."},
        {"key": "2024 2H", "value": "0.5"},
    ])])
    result = normalize_cpi_response(payload)
    assert len(result[0]["data_points"]) == 1
    assert result[0]["data_points"][0][2] == 0.5


def test_dash_empty_and_na_variants_all_skipped():
    payload = _payload([_row(columns=[
        {"key": "2022 1H", "value": "na"},
        {"key": "2022 2H", "value": "-"},
        {"key": "2023 1H", "value": ""},
        {"key": "2023 2H", "value": "N/A"},
        {"key": "2024 1H", "value": "1.1"},
    ])])
    result = normalize_cpi_response(payload)
    assert len(result[0]["data_points"]) == 1
    assert result[0]["data_points"][0][2] == 1.1


def test_unparseable_period_key_is_skipped():
    payload = _payload([_row(columns=[
        {"key": "bad-date", "value": "1.0"},
        {"key": "2024 1H", "value": "0.3"},
    ])])
    result = normalize_cpi_response(payload)
    assert len(result[0]["data_points"]) == 1


def test_non_numeric_value_is_skipped():
    payload = _payload([_row(columns=[
        {"key": "2024 1H", "value": "abc"},
        {"key": "2024 2H", "value": "1.5"},
    ])])
    result = normalize_cpi_response(payload)
    assert len(result[0]["data_points"]) == 1
    assert result[0]["data_points"][0][2] == 1.5


def test_row_with_empty_series_name_is_skipped():
    payload = _payload([
        _row(row_text="", columns=[{"key": "2024 1H", "value": "0.5"}]),
        _row(row_text="Transport", columns=[{"key": "2024 1H", "value": "0.3"}]),
    ])
    result = normalize_cpi_response(payload)
    assert len(result) == 1
    assert result[0]["series_name"] == "Transport"


def test_multiple_series_all_returned():
    payload = _payload([
        _row("1", "Food", columns=[{"key": "2024 1H", "value": "0.8"}]),
        _row("2", "Transport", columns=[{"key": "2024 1H", "value": "0.3"}]),
        _row("3", "Education", columns=[{"key": "2024 1H", "value": "0.1"}]),
    ])
    result = normalize_cpi_response(payload)
    assert len(result) == 3
    assert {r["series_name"] for r in result} == {"Food", "Transport", "Education"}


def test_unit_is_preserved():
    payload = _payload([_row(uom="Per Cent", columns=[{"key": "2024 1H", "value": "1.0"}])])
    result = normalize_cpi_response(payload)
    assert result[0]["unit"] == "Per Cent"


def test_series_with_no_valid_data_points_still_returned():
    payload = _payload([_row(columns=[{"key": "2024 1H", "value": "N.A."}])])
    result = normalize_cpi_response(payload)
    assert len(result) == 1
    assert result[0]["data_points"] == []


# ── validate_completeness ─────────────────────────────────────────────────────

def test_matching_counts_do_not_raise():
    validate_completeness(10, 10)


def test_zero_counts_do_not_raise():
    validate_completeness(0, 0)


def test_db_fewer_than_api_raises():
    with pytest.raises(ValueError, match="Completeness check FAILED"):
        validate_completeness(10, 8)


def test_db_more_than_api_raises():
    with pytest.raises(ValueError, match="Completeness check FAILED"):
        validate_completeness(10, 12)


def test_error_message_contains_both_counts():
    with pytest.raises(ValueError) as exc_info:
        validate_completeness(15, 12)
    msg = str(exc_info.value)
    assert "15" in msg
    assert "12" in msg
