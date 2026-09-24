"""Regression tests for cross-process PDF render serialization."""

import multiprocessing
import threading
import time

import pytest

from app.services.edition_pdf import edition_pdf_render_lock


def _hold_render_lock(lock_path: str, ready, release) -> None:
    with edition_pdf_render_lock(lock_path, timeout_seconds=2):
        ready.set()
        release.wait(2)


def _start_lock_holder(lock_path: str):
    ready = multiprocessing.Event()
    release = multiprocessing.Event()
    process = multiprocessing.Process(
        target=_hold_render_lock,
        args=(lock_path, ready, release),
    )
    process.start()
    assert ready.wait(2), "child process did not acquire the render lock"
    return process, release


def test_render_lock_serializes_across_processes(tmp_path):
    lock_path = str(tmp_path / "edition-pdf.lock")
    process, release = _start_lock_holder(lock_path)
    timer = threading.Timer(0.2, release.set)
    timer.start()
    started_at = time.monotonic()

    try:
        with edition_pdf_render_lock(lock_path, timeout_seconds=1):
            elapsed = time.monotonic() - started_at
    finally:
        release.set()
        timer.cancel()
        process.join(2)
        if process.is_alive():
            process.terminate()
            process.join(2)

    assert elapsed >= 0.15
    assert process.exitcode == 0


def test_render_lock_times_out_and_is_released_after_errors(tmp_path):
    lock_path = str(tmp_path / "edition-pdf.lock")
    process, release = _start_lock_holder(lock_path)

    try:
        with pytest.raises(TimeoutError, match="PDF render lock"):
            with edition_pdf_render_lock(lock_path, timeout_seconds=0.05):
                pass
    finally:
        release.set()
        process.join(2)
        if process.is_alive():
            process.terminate()
            process.join(2)

    with pytest.raises(RuntimeError, match="render failed"):
        with edition_pdf_render_lock(lock_path, timeout_seconds=0.2):
            raise RuntimeError("render failed")

    with edition_pdf_render_lock(lock_path, timeout_seconds=0.2):
        pass
