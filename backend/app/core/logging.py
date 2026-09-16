import logging
import sys
import warnings
from typing import Any

import structlog


def configure_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO

    # Silence the deprecation warning from the `google.generativeai`
    # package. The package still works fine; we'll migrate to
    # `google.genai` in a follow-up.
    warnings.filterwarnings(
        "ignore",
        message=r"All support for the `google\.generativeai` package has ended.*",
        category=FutureWarning,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    # SQLAlchemy is very chatty at INFO — every statement and PRAGMA
    # gets logged. Keep our app logs readable by raising the threshold
    # for the SQL layer. Set DEBUG=true in the environment if you want
    # to see every query.
    if not debug:
        # Disable ALL sqlalchemy output by default. Enable with
        # DEBUG=true (or PYTHONVERBOSE-style env vars) if needed.
        for noisy in (
            "sqlalchemy",
            "sqlalchemy.engine",
            "sqlalchemy.engine.Engine",
            "sqlalchemy.pool",
            "sqlalchemy.dialects",
            "sqlalchemy.orm",
        ):
            logging.getLogger(noisy).setLevel(logging.ERROR)
            logging.getLogger(noisy).propagate = False


def get_logger(name: str) -> structlog.BoundLogger:
    return structlog.get_logger(name)